"""Cohort-relative Semester III performance risk profiling.

Scores are anomaly ranks within the loaded cohort, not calibrated probabilities
of future failure. The dataset has no verified future-outcome labels.
"""

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


FEATURE_COLUMNS = (
    "average_grade_point",
    "theory_average",
    "lab_average",
    "credit_weighted_score",
    "low_grade_count",
    "failed_subject_count",
)
MODEL_VERSION = "isoforest-cohort-percentile-v1"


def profile_risk(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return risk scores and levels for one complete student cohort."""
    if not records:
        raise ValueError("No academic performance records were provided.")

    frame = pd.DataFrame.from_records(records)
    missing_columns = [column for column in FEATURE_COLUMNS if column not in frame]
    if missing_columns:
        raise ValueError(f"Records are missing model features: {', '.join(missing_columns)}")
    if "student_id" not in frame:
        raise ValueError("Each record must include student_id.")
    if frame["student_id"].duplicated().any():
        raise ValueError("Each cohort must contain at most one record per student.")

    features = frame.loc[:, FEATURE_COLUMNS].apply(pd.to_numeric, errors="coerce")
    if features.isna().any().any() or not np.isfinite(features.to_numpy()).all():
        raise ValueError("All six model features must be present and finite numbers.")

    scaled_features = StandardScaler().fit_transform(features)
    detector = IsolationForest(
        n_estimators=300,
        contamination="auto",
        random_state=42,
    )
    detector.fit(scaled_features)

    anomaly_scores = -detector.score_samples(scaled_features)
    risk_scores = pd.Series(anomaly_scores).rank(method="average", pct=True).to_numpy()
    risk_levels = np.select(
        (risk_scores >= 0.90, risk_scores >= 0.60),
        ("High", "Medium"),
        default="Low",
    )

    return [
        {
            "student_id": student_id,
            "model_version": MODEL_VERSION,
            "risk_score": round(float(risk_score), 5),
            "risk_level": str(risk_level),
        }
        for student_id, risk_score, risk_level in zip(
            frame["student_id"], risk_scores, risk_levels
        )
    ]