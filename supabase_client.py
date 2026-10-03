"""Server-side Supabase access for the Semester III MVP."""

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client


ROOT = Path(__file__).resolve().parent

FEATURE_COLUMNS = (
    "average_grade_point",
    "theory_average",
    "lab_average",
    "credit_weighted_score",
    "low_grade_count",
    "failed_subject_count",
)
SELECT_COLUMNS = (
    "student_id",
    *FEATURE_COLUMNS,
)
EXPECTED_STUDENT_COUNT = 49
PAGE_SIZE = 1000


def create_supabase_client() -> Client:
    """Create a server-side client using credentials from the local .env."""
    load_dotenv(ROOT / ".env", override=False)
    url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        raise RuntimeError(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local .env file. "
            "Use the service-role key only in this trusted server-side Python app; "
            "never expose it in browser code or commit it."
        )
    return create_client(url, service_role_key)


def fetch_semester_records(
    client: Client,
    expected_count: int | None = EXPECTED_STUDENT_COUNT,
) -> list[dict[str, Any]]:
    """Fetch model features for the imported cohort from academic_performance."""
    probe = client.table("academic_performance").select("*").limit(1).execute()
    sample = (probe.data or [None])[0]
    if sample is None:
        raise ValueError("No academic performance records were found in Supabase.")
    has_cohort_metadata = {"semester", "academic_year"}.issubset(sample)

    records: list[dict[str, Any]] = []
    start = 0

    while True:
        query = (
            client.table("academic_performance")
            .select(",".join(SELECT_COLUMNS))
            .order("student_id")
        )
        if has_cohort_metadata:
            query = query.eq("semester", "III").eq("academic_year", 2026)
        response = query.range(start, start + PAGE_SIZE - 1).execute()
        page = response.data or []
        records.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE

    student_ids = [record["student_id"] for record in records]
    if len(student_ids) != len(set(student_ids)):
        raise ValueError("Supabase returned duplicate students for Semester III 2026.")
    if expected_count is not None and len(records) != expected_count:
        raise ValueError(
            f"Expected {expected_count} Semester III 2026 records, got {len(records)}. "
            "Check that the records were imported and that the server-side key can read them."
        )
    return records


def save_risk_predictions(client: Client, predictions: list[dict[str, Any]]) -> int:
    """Append a scored cohort run to risk_predictions and return rows written."""
    if not predictions:
        raise ValueError("No risk predictions were provided to save.")

    model_version = predictions[0]["model_version"]
    existing_ids = fetch_saved_student_ids(client, model_version)
    rows = [
        {
            "student_id": prediction["student_id"],
            "model_version": prediction["model_version"],
            "risk_score": prediction["risk_score"],
            "risk_level": prediction["risk_level"],
        }
        for prediction in predictions
        if prediction["student_id"] not in existing_ids
    ]
    if not rows:
        return 0

    response = client.table("risk_predictions").insert(rows).execute()
    return len(response.data or [])


def fetch_saved_student_ids(client: Client, model_version: str) -> set[str]:
    """Return students already saved for a model version."""
    response = (
        client.table("risk_predictions")
        .select("student_id")
        .eq("model_version", model_version)
        .execute()
    )
    return {row["student_id"] for row in response.data or []}