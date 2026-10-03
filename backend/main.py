"""Authenticated API for the EduRisk web application."""

from collections import Counter, defaultdict
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from supabase import Client, create_client

from model import profile_risk
from supabase_client import (
    create_supabase_client,
    fetch_semester_records,
    save_risk_predictions,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edurisk.api")
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)
app = FastAPI(title="EduRisk API", version="1.0.0")
bearer = HTTPBearer(auto_error=False)
allowed_origins = os.getenv("EDURISK_CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

ROLES = {"admin", "faculty", "advisor"}
GRADE_POINTS = {"O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "U": 0, "UA": 0}
SUBJECTS = {
    "dm_grade": "Discrete Mathematics",
    "ai_grade": "Artificial Intelligence",
    "fods_grade": "Foundations of Data Science",
    "ds_grade": "Data Structures",
    "oops_grade": "Object-Oriented Programming",
    "dpco_grade": "Digital Principles",
    "data_science_lab_grade": "Data Science Lab",
    "oops_lab_grade": "OOPS Lab",
}
STUDENT_COLUMNS = (
    "student_id,semester,section,academic_year,average_grade_point,theory_average,"
    "lab_average,credit_weighted_score,low_grade_count,failed_subject_count,"
    "passed_subject_count," + ",".join(SUBJECTS)
)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class InterventionUpdate(BaseModel):
    workflow_status: Literal["follow_up_due", "closed"]


def database() -> Client:
    try:
        return create_supabase_client()
    except Exception as error:
        logger.exception("Supabase client configuration failed")
        raise HTTPException(503, "Supabase server configuration is unavailable.") from error


def execute(query: Any) -> list[dict[str, Any]]:
    try:
        response = query.execute()
        return response.data or []
    except Exception as error:
        logger.exception("Supabase request failed")
        raise HTTPException(502, "The Supabase request failed.") from error


def auth_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(503, "Configure Supabase URL and an API key on the server.")
    return create_client(url, key)


def user_role(user: Any) -> str:
    metadata = getattr(user, "app_metadata", None) or {}
    role = str(metadata.get("edurisk_role", metadata.get("role", ""))).lower()
    if role not in ROLES:
        raise HTTPException(403, "Your account does not have an EduRisk role assigned.")
    return role


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(401, "Sign in to continue.")
    try:
        response = database().auth.get_user(credentials.credentials)
        user = response.user
    except Exception as error:
        raise HTTPException(401, "Your session is invalid or has expired.") from error
    if user is None:
        raise HTTPException(401, "Your session is invalid or has expired.")
    return {"id": str(user.id), "email": str(user.email or ""), "role": user_role(user)}


def require_roles(*roles: str):
    def dependency(user: dict[str, str] = Depends(current_user)) -> dict[str, str]:
        if user["role"] not in roles:
            raise HTTPException(403, "Your EduRisk role cannot access this resource.")
        return user

    return dependency


def fetch_performance(
    client: Client,
    semester: str = "III",
    section: str | None = None,
) -> list[dict[str, Any]]:
    sample = execute(client.table("academic_performance").select("*").limit(1))
    if not sample:
        return []
    available_columns = set(sample[0])
    selected_columns = [
        column for column in STUDENT_COLUMNS.split(",") if column in available_columns
    ]
    query = client.table("academic_performance").select(",".join(selected_columns))
    if {"semester", "academic_year"}.issubset(available_columns):
        query = query.eq("semester", semester).eq("academic_year", 2026)
    if section and "section" in available_columns:
        query = query.eq("section", section)
    rows = execute(query.order("student_id"))
    for row in rows:
        row.setdefault("semester", semester)
        row.setdefault("academic_year", 2026)
    return rows


def fetch_predictions(client: Client, limit: int = 5000) -> list[dict[str, Any]]:
    return execute(
        client.table("risk_predictions")
        .select("prediction_id,student_id,model_version,risk_level,risk_score,predicted_at")
        .order("predicted_at", desc=True)
        .order("prediction_id", desc=True)
        .limit(limit)
    )


def latest_by_student(predictions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for prediction in predictions:
        latest.setdefault(str(prediction["student_id"]), prediction)
    return latest


def enrich_students(
    performance: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    latest = latest_by_student(predictions)
    return [{**record, "risk": latest.get(str(record["student_id"]))} for record in performance]


def risk_counts(students: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(
        student["risk"]["risk_level"]
        for student in students
        if student.get("risk")
    )
    return {level: counts.get(level, 0) for level in ("High", "Medium", "Low")}


def subject_averages(students: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for column, label in SUBJECTS.items():
        values = [GRADE_POINTS[row[column]] for row in students if row.get(column) in GRADE_POINTS]
        result.append({"subject": label, "average": round(sum(values) / len(values), 2) if values else None})
    return result


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "edurisk-api"}


@app.post("/api/auth/login")
def login(request: LoginRequest) -> dict[str, Any]:
    try:
        response = auth_client().auth.sign_in_with_password(
            {"email": request.email, "password": request.password}
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(401, "Email or password is incorrect.") from error
    if response.session is None or response.user is None:
        raise HTTPException(401, "Email or password is incorrect.")
    role = user_role(response.user)
    return {
        "access_token": response.session.access_token,
        "token_type": "bearer",
        "user": {"email": response.user.email, "role": role},
    }


@app.get("/api/auth/me")
def me(user: dict[str, str] = Depends(current_user)) -> dict[str, str]:
    return user


@app.get("/api/dashboard")
def dashboard(user: dict[str, str] = Depends(require_roles("admin", "faculty", "advisor"))) -> dict[str, Any]:
    client = database()
    performance = fetch_performance(client)
    prediction_rows = fetch_predictions(client)
    students = enrich_students(performance, prediction_rows)
    counts = risk_counts(students)
    interventions = []
    if user["role"] in {"admin", "advisor"}:
        interventions = execute(
            client.table("risk_interventions")
            .select("source_prediction_id,student_id,risk_level,risk_score,action_type,workflow_status,notification_status,follow_up_due_at,created_at,updated_at")
            .order("created_at", desc=True)
            .limit(6)
        )
    history: dict[str, int] = defaultdict(int)
    for prediction in prediction_rows:
        predicted_at = str(prediction.get("predicted_at", ""))
        if predicted_at:
            history[predicted_at[:10]] += 1
    recent_high = [row for row in students if row.get("risk", {}).get("risk_level") == "High"]
    recent_high.sort(key=lambda row: float(row["risk"].get("risk_score") or 0), reverse=True)
    scores = [float(row["average_grade_point"]) for row in performance if row.get("average_grade_point") is not None]
    return {
        "semester": "III",
        "academic_year": 2026,
        "total_students": len(performance),
        "risk_distribution": counts,
        "students_requiring_attention": counts["High"],
        "average_grade_point": round(sum(scores) / len(scores), 2) if scores else None,
        "subject_averages": subject_averages(performance),
        "recent_high_risk": recent_high[:6],
        "recent_interventions": interventions,
        "prediction_activity": [
            {"date": day, "predictions": count}
            for day, count in sorted(history.items())[-30:]
        ],
        "scored_students": sum(bool(row.get("risk")) for row in students),
        "role": user["role"],
    }


@app.get("/api/students")
def students(
    search: str = "",
    risk_level: str | None = None,
    section: str | None = None,
    semester: str = "III",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: dict[str, str] = Depends(require_roles("admin", "faculty", "advisor")),
) -> dict[str, Any]:
    client = database()
    rows = enrich_students(
        fetch_performance(client, semester=semester, section=section),
        fetch_predictions(client),
    )
    if search:
        rows = [row for row in rows if search.casefold() in row["student_id"].casefold()]
    if risk_level:
        rows = [row for row in rows if row.get("risk", {}).get("risk_level") == risk_level]
    rows.sort(key=lambda row: float((row.get("risk") or {}).get("risk_score") or -1), reverse=True)
    start = (page - 1) * page_size
    return {"items": rows[start : start + page_size], "total": len(rows), "page": page, "page_size": page_size}


@app.get("/api/students/{student_id}")
def student_detail(
    student_id: str,
    semester: str = "III",
    user: dict[str, str] = Depends(require_roles("admin", "faculty", "advisor")),
) -> dict[str, Any]:
    client = database()
    performance = [
        row for row in fetch_performance(client, semester=semester)
        if row.get("student_id") == student_id
    ]
    if not performance:
        raise HTTPException(404, "Student performance record not found.")
    prediction = latest_by_student(fetch_predictions(client)).get(student_id)
    return {**performance[0], "risk": prediction}


@app.get("/api/analytics")
@app.get("/api/performance")
def performance(
    semester: str = "III",
    section: str | None = None,
    user: dict[str, str] = Depends(require_roles("admin", "faculty")),
) -> dict[str, Any]:
    rows = fetch_performance(database(), semester=semester, section=section)
    grade_distribution = Counter(
        grade for row in rows for subject in SUBJECTS if (grade := row.get(subject))
    )
    failure_distribution = Counter(int(row.get("failed_subject_count") or 0) for row in rows)
    scores = [float(row["average_grade_point"]) for row in rows if row.get("average_grade_point") is not None]
    theory = [float(row["theory_average"]) for row in rows if row.get("theory_average") is not None]
    labs = [float(row["lab_average"]) for row in rows if row.get("lab_average") is not None]
    return {
        "total_students": len(rows),
        "average_grade_point": round(sum(scores) / len(scores), 2) if scores else None,
        "students_below_five": sum(score < 5 for score in scores),
        "subject_averages": subject_averages(rows),
        "grade_distribution": dict(grade_distribution),
        "failed_subject_distribution": [
            {"failed_subjects": count, "students": total}
            for count, total in sorted(failure_distribution.items())
        ],
        "theory_average": round(sum(theory) / len(theory), 2) if theory else None,
        "lab_average": round(sum(labs) / len(labs), 2) if labs else None,
    }


@app.get("/api/risk-predictions")
def risk_predictions(
    risk_level: str | None = None,
    user: dict[str, str] = Depends(require_roles("admin", "faculty", "advisor")),
) -> dict[str, Any]:
    client = database()
    rows = enrich_students(fetch_performance(client), fetch_predictions(client))
    if risk_level:
        rows = [row for row in rows if row.get("risk", {}).get("risk_level") == risk_level]
    rows.sort(key=lambda row: float((row.get("risk") or {}).get("risk_score") or -1), reverse=True)
    return {"items": rows, "total": len(rows), "risk_distribution": risk_counts(rows)}


@app.post("/api/risk-predictions/run")
def run_risk_profile(
    user: dict[str, str] = Depends(require_roles("admin", "faculty")),
) -> dict[str, Any]:
    client = database()
    records = fetch_semester_records(client, expected_count=None)
    predictions = profile_risk(records)
    saved = save_risk_predictions(client, predictions)
    return {"predictions": predictions, "saved": saved, "model_version": predictions[0]["model_version"]}


@app.get("/api/interventions")
def interventions(
    workflow_status: str | None = None,
    risk_level: str | None = None,
    search: str = "",
    user: dict[str, str] = Depends(require_roles("admin", "advisor")),
) -> dict[str, Any]:
    query = database().table("risk_interventions").select("*").order("created_at", desc=True)
    if workflow_status:
        query = query.eq("workflow_status", workflow_status)
    if risk_level:
        query = query.eq("risk_level", risk_level)
    rows = execute(query.limit(1000))
    if search:
        rows = [row for row in rows if search.casefold() in row["student_id"].casefold()]
    return {"items": rows, "total": len(rows)}


@app.patch("/api/interventions/{source_prediction_id}")
def update_intervention(
    source_prediction_id: int,
    update: InterventionUpdate,
    user: dict[str, str] = Depends(require_roles("admin", "advisor")),
) -> dict[str, Any]:
    rows = execute(
        database()
        .table("risk_interventions")
        .update({"workflow_status": update.workflow_status, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("source_prediction_id", source_prediction_id)
        .neq("workflow_status", "closed")
        .select("*")
    )
    if not rows:
        raise HTTPException(404, "Intervention not found.")
    return rows[0]
