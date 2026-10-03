"""Streamlit dashboard for Semester III performance risk profiling."""

from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

from model import profile_risk
from supabase_client import (
    create_supabase_client,
    fetch_saved_student_ids,
    fetch_semester_records,
    save_risk_predictions,
)


ROOT = Path(__file__).resolve().parent
RISK_LEVELS = ("High", "Medium", "Low")

st.set_page_config(page_title="EduRisk | Dashboard", page_icon="ER", layout="wide")
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap');
    :root {
        --ink: #142542;
        --muted: #647694;
        --blue: #2878dc;
        --line: #e3ebf5;
        --surface: #ffffff;
    }
    .stApp { background: #f3f7fc; color: var(--ink); }
    [data-testid="stHeader"] { background: rgba(243, 247, 252, .94); }
    [data-testid="stSidebar"] { background: #102b50; }
    [data-testid="stSidebar"] * { color: #f4f8ff; }
    [data-testid="stSidebar"] [data-testid="stRadio"] label { padding: 7px 10px; }
    h1, h2, h3 { font-family: 'Manrope', sans-serif; color: var(--ink); letter-spacing: 0; }
    h1 { font-size: 1.65rem; margin-bottom: .15rem; }
    h2 { font-size: 1.08rem; }
    p, label, input, button, [data-testid="stMetricValue"] { font-family: 'DM Sans', sans-serif; }
    [data-testid="stMetric"] {
        background: var(--surface); border: 1px solid var(--line); border-radius: 9px;
        padding: 14px 16px; box-shadow: 0 2px 8px rgba(27, 55, 91, .035);
    }
    [data-testid="stMetricLabel"] { color: var(--muted); }
    [data-testid="stMetricValue"] { color: var(--ink); font-family: 'Manrope', sans-serif; }
    [data-testid="stVerticalBlockBorderWrapper"] { background: var(--surface); border-radius: 9px; border-color: var(--line); }
    div.stButton > button { border-radius: 7px; border-color: #b8d5fc; color: #1d66bb; }
    div.stButton > button[kind="primary"] { background: var(--blue); border-color: var(--blue); color: white; }
    [data-testid="stDataFrame"] { border: 1px solid var(--line); border-radius: 7px; }
    .brand { font-family: 'Manrope', sans-serif; font-size: 1.35rem; font-weight: 800; padding: 5px 0 22px; }
    .brand span { color: #68adff; }
    .eyebrow { color: var(--muted); font-size: .84rem; margin-top: 0; }
    .risk-high { color: #d94a47; }
    .risk-medium { color: #bb7d10; }
    .risk-low { color: #168c5b; }
    @media (max-width: 700px) {
        h1 { font-size: 1.35rem; }
        [data-testid="stMetric"] { padding: 10px; }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def load_preview() -> tuple[list[dict], list[dict]]:
    records = pd.read_csv(ROOT / "data" / "students.csv").to_dict("records")
    return records, profile_risk(records)


def risk_summary(predictions: pd.DataFrame) -> pd.DataFrame:
    counts = predictions["risk_level"].value_counts().reindex(RISK_LEVELS, fill_value=0)
    return counts.rename_axis("Risk level").to_frame("Students")


if "student_records" not in st.session_state:
    try:
        preview_records, preview_predictions = load_preview()
        st.session_state["student_records"] = preview_records
        st.session_state["risk_predictions"] = preview_predictions
        st.session_state["data_source"] = "Local anonymized preview"
    except Exception as error:
        st.error(f"Could not load the local cohort preview: {error}")
        st.stop()

with st.sidebar:
    st.markdown('<div class="brand">◆ Edu<span>Risk</span></div>', unsafe_allow_html=True)
    page = st.radio(
        "Workspace",
        ("Dashboard", "Student list", "Risk analysis"),
        label_visibility="collapsed",
    )
    st.divider()
    st.caption("SEMESTER III  ·  2026")
    st.caption("Academic performance monitoring")

records = pd.DataFrame(st.session_state["student_records"])
predictions = pd.DataFrame(st.session_state["risk_predictions"])
cohort = records.merge(predictions, on="student_id", how="inner")
cohort = cohort.sort_values(["risk_score", "student_id"], ascending=[False, True])
summary = risk_summary(cohort)
high_count = int((cohort["risk_level"] == "High").sum())
medium_count = int((cohort["risk_level"] == "Medium").sum())
low_count = int((cohort["risk_level"] == "Low").sum())

heading, controls = st.columns([3, 1.2], vertical_alignment="center")
with heading:
    st.title("Welcome to EduRisk")
    st.markdown(
        f'<p class="eyebrow">Semester III performance overview · {st.session_state["data_source"]}</p>',
        unsafe_allow_html=True,
    )
with controls:
    if st.button("↻  Refresh from Supabase", type="primary", use_container_width=True):
        try:
            with st.spinner("Loading the latest cohort and calculating risk..."):
                client = create_supabase_client()
                live_records = fetch_semester_records(client)
                live_predictions = profile_risk(live_records)
                saved_ids = fetch_saved_student_ids(client, live_predictions[0]["model_version"])
            st.session_state["student_records"] = live_records
            st.session_state["risk_predictions"] = live_predictions
            st.session_state["data_source"] = "Live Supabase cohort"
            st.session_state.pop("saved_prediction_count", None)
            if {row["student_id"] for row in live_predictions}.issubset(saved_ids):
                st.session_state["saved_prediction_count"] = len(live_predictions)
            st.rerun()
        except Exception as error:
            st.error(str(error))

search = st.text_input(
    "Search student ID",
    placeholder="Search by student ID...",
    label_visibility="collapsed",
)
if search:
    cohort = cohort[cohort["student_id"].astype(str).str.contains(search, case=False)]

if page == "Dashboard":
    metric_columns = st.columns(4)
    metric_columns[0].metric("Students", f"{len(records):,}")
    metric_columns[1].metric("High risk", high_count, delta=f"{high_count / len(records):.1%} of cohort" if len(records) else None, delta_color="inverse")
    metric_columns[2].metric("Medium risk", medium_count, delta=f"{medium_count / len(records):.1%} of cohort" if len(records) else None, delta_color="off")
    metric_columns[3].metric("Low risk", low_count, delta=f"{low_count / len(records):.1%} of cohort", delta_color="normal")

    chart_columns = st.columns([1, 1.2, 1])
    with chart_columns[0], st.container(border=True):
        st.subheader("Risk distribution")
        st.bar_chart(summary, color="#2878dc", height=210)
    with chart_columns[1], st.container(border=True):
        st.subheader("Grade point and risk score")
        risk_figure = px.scatter(
            cohort,
            x="average_grade_point",
            y="risk_score",
            color="risk_level",
            color_discrete_map={
                "High": "#ef5b57",
                "Medium": "#efa92f",
                "Low": "#2bb47a",
            },
            hover_data={"student_id": True, "risk_score": ":.0%"},
            labels={
                "average_grade_point": "Average grade point",
                "risk_score": "Risk percentile",
                "risk_level": "Risk level",
                "student_id": "Student ID",
            },
        )
        risk_figure.update_layout(
            height=250,
            margin=dict(l=8, r=8, t=12, b=8),
            legend_title_text="",
        )
        st.plotly_chart(
            risk_figure,
            use_container_width=True,
            config={"displayModeBar": False},
        )
    with chart_columns[2], st.container(border=True):
        st.subheader("Academic indicators")
        indicators = records[["average_grade_point", "theory_average", "lab_average", "credit_weighted_score"]].mean()
        st.bar_chart(indicators.rename_axis("Indicator").to_frame("Average"), color="#46a0ef", height=210)

    table_column, detail_column = st.columns([1.7, 1])
    with table_column, st.container(border=True):
        st.subheader("Student risk prediction")
        st.dataframe(
            cohort[["student_id", "average_grade_point", "credit_weighted_score", "failed_subject_count", "risk_score", "risk_level"]].rename(
                columns={
                    "student_id": "Student ID",
                    "average_grade_point": "Avg grade point",
                    "credit_weighted_score": "Weighted score",
                    "failed_subject_count": "Failed subjects",
                    "risk_score": "Risk percentile",
                    "risk_level": "Risk level",
                }
            ),
            hide_index=True,
            use_container_width=True,
            height=365,
            column_config={"Risk percentile": st.column_config.ProgressColumn("Risk percentile", min_value=0, max_value=1, format="%.0%%")},
        )
    with detail_column, st.container(border=True):
        st.subheader("Student details")
        if cohort.empty:
            st.info("No students match this search.")
        else:
            selected_id = st.selectbox("Student", cohort["student_id"].tolist(), label_visibility="collapsed")
            student = cohort.loc[cohort["student_id"] == selected_id].iloc[0]
            st.markdown(f"### {student['student_id']}")
            st.markdown(f"**{student['risk_level']} risk** · {student['risk_score']:.0%} cohort anomaly percentile")
            detail_left, detail_right = st.columns(2)
            detail_left.metric("Average grade point", f"{student['average_grade_point']:.2f} / 10")
            detail_right.metric("Weighted score", f"{student['credit_weighted_score']:.2f} / 10")
            detail_left.metric("Theory average", f"{student['theory_average']:.2f}")
            detail_right.metric("Lab average", f"{student['lab_average']:.2f}")
            st.markdown("**Suggested follow-up**")
            if int(student["failed_subject_count"]):
                st.info(f"Review {int(student['failed_subject_count'])} failed subject(s) and offer targeted academic support.")
            elif int(student["low_grade_count"]):
                st.info(f"Check in on {int(student['low_grade_count'])} low-grade subject(s) and monitor progress.")
            else:
                st.success("No low or failed grades in the available Semester III record.")

    if "saved_prediction_count" in st.session_state:
        st.success(f"{st.session_state['saved_prediction_count']} risk profiles are saved in Supabase.")
    elif st.button("Save risk profiles to Supabase"):
        try:
            saved_count = save_risk_predictions(create_supabase_client(), st.session_state["risk_predictions"])
            st.session_state["saved_prediction_count"] = len(cohort)
            if saved_count:
                st.success(f"Saved {saved_count} new risk profiles.")
            else:
                st.info("These risk profiles were already saved.")
        except Exception as error:
            st.error(f"Could not save profiles: {error}")

elif page == "Student list":
    st.subheader("Student list")
    st.dataframe(
        cohort[["student_id", "average_grade_point", "theory_average", "lab_average", "failed_subject_count", "risk_score", "risk_level"]].rename(
            columns={"student_id": "Student ID", "average_grade_point": "Avg grade point", "theory_average": "Theory", "lab_average": "Lab", "failed_subject_count": "Failed subjects", "risk_score": "Risk percentile", "risk_level": "Risk level"}
        ),
        hide_index=True,
        use_container_width=True,
        column_config={"Risk percentile": st.column_config.ProgressColumn("Risk percentile", min_value=0, max_value=1, format="%.0%%")},
    )

else:
    st.subheader("Risk analysis")
    analysis_left, analysis_right = st.columns(2)
    with analysis_left, st.container(border=True):
        st.markdown("#### Students by risk level")
        st.bar_chart(summary, color="#2878dc", height=280)
    with analysis_right, st.container(border=True):
        st.markdown("#### Average grade point by risk level")
        averages = cohort.groupby("risk_level")["average_grade_point"].mean().reindex(RISK_LEVELS)
        st.bar_chart(averages.dropna().rename_axis("Risk level").to_frame("Average grade point"), color="#46a0ef", height=280)

st.caption(
    "Risk score is an Isolation Forest anomaly percentile within this cohort, not a probability of future failure. "
    "The supplied dataset contains no attendance, student names, or verified future outcomes."
)