"""Build the anonymized Semester III feature CSV from grade-only source data.

The supplied grade-point mapping is project-specific. Low grades mean C or
below (grade point <= 5); U and UA count as failures, while all other grades
count as passed. Risk predictions and future outcomes are intentionally not
fabricated: their fields remain in the database design, not this input CSV.
"""

import csv
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "data" / "semester_iii_source_anonymized.csv"
OUTPUT_PATH = ROOT / "data" / "students.csv"

GRADE_POINTS = {
	"O": 10,
	"A+": 9,
	"A": 8,
	"B+": 7,
	"B": 6,
	"C": 5,
	"U": 0,
	"UA": 0,
}
SUBJECT_CREDITS = {
	"dm_grade": 4,
	"ai_grade": 3,
	"fods_grade": 3,
	"ds_grade": 4,
	"oops_grade": 3,
	"dpco_grade": 3,
	"data_science_lab_grade": 2,
	"oops_lab_grade": 2,
}
THEORY_SUBJECTS = tuple(SUBJECT_CREDITS)[:6]
LAB_SUBJECTS = tuple(SUBJECT_CREDITS)[6:]
MISSING_INDICATORS = (
	"attendance_percentage",
	"internal_assessment_1",
	"internal_assessment_2",
	"internal_assessment_average",
	"assignment_completion",
	"assignment_submission_rate",
	"lab_attendance",
	"previous_semester_score",
	"previous_failures",
	"study_hours_per_week",
	"next_semester_result",
)
SOURCE_FIELDS = ("student_id", *SUBJECT_CREDITS)
OUTPUT_FIELDS = (
	"student_id",
	"semester",
	"section",
	"academic_year",
	*SUBJECT_CREDITS,
	"average_grade_point",
	"theory_average",
	"lab_average",
	"credit_weighted_score",
	"low_grade_count",
	"failed_subject_count",
	"passed_subject_count",
	*MISSING_INDICATORS,
)
EXPECTED_STUDENT_COUNT = 49


def score_mean(values, weights=None):
	if weights is None:
		numerator = sum(values)
		denominator = len(values)
	else:
		numerator = sum(value * weight for value, weight in zip(values, weights))
		denominator = sum(weights)
	result = (Decimal(numerator) / Decimal(denominator)).quantize(
		Decimal("0.01"), rounding=ROUND_HALF_UP
	)
	return f"{result:.2f}"


def build_record(source):
	points = {subject: GRADE_POINTS[source[subject]] for subject in SUBJECT_CREDITS}
	all_points = list(points.values())
	theory_points = [points[subject] for subject in THEORY_SUBJECTS]
	lab_points = [points[subject] for subject in LAB_SUBJECTS]
	weights = list(SUBJECT_CREDITS.values())

	record = {
		"student_id": source["student_id"],
		"semester": "III",
		"section": "A",
		"academic_year": "2026",
		**{subject: source[subject] for subject in SUBJECT_CREDITS},
		"average_grade_point": score_mean(all_points),
		"theory_average": score_mean(theory_points),
		"lab_average": score_mean(lab_points),
		"credit_weighted_score": score_mean(all_points, weights),
		"low_grade_count": str(sum(point <= 5 for point in all_points)),
		"failed_subject_count": str(
			sum(source[subject] in ("U", "UA") for subject in SUBJECT_CREDITS)
		),
		"passed_subject_count": str(
			sum(source[subject] not in ("U", "UA") for subject in SUBJECT_CREDITS)
		),
		**{field: "" for field in MISSING_INDICATORS},
	}
	return record


def main():
	with SOURCE_PATH.open(newline="", encoding="utf-8") as source_file:
		reader = csv.DictReader(source_file)
		if tuple(reader.fieldnames or ()) != SOURCE_FIELDS:
			raise ValueError("Source CSV headers do not match the expected grade-only schema.")
		source_records = list(reader)

	student_ids = [record["student_id"] for record in source_records]
	if len(source_records) != EXPECTED_STUDENT_COUNT:
		raise ValueError(f"Expected {EXPECTED_STUDENT_COUNT} students; found {len(source_records)}.")
	if len(set(student_ids)) != len(student_ids):
		raise ValueError("Source CSV contains duplicate student IDs.")

	for record in source_records:
		if set(record) != set(SOURCE_FIELDS):
			raise ValueError(f"Unexpected source fields for {record.get('student_id', 'unknown')}.")
		if not record["student_id"].startswith("AIDS24"):
			raise ValueError(f"Unexpected student ID format: {record['student_id']}.")
		invalid_grades = {
			record[subject] for subject in SUBJECT_CREDITS
			if record[subject] not in GRADE_POINTS
		}
		if invalid_grades:
			raise ValueError(f"Invalid grades for {record['student_id']}: {sorted(invalid_grades)}")

	output_records = [build_record(record) for record in source_records]
	with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as output_file:
		writer = csv.DictWriter(output_file, fieldnames=OUTPUT_FIELDS)
		writer.writeheader()
		writer.writerows(output_records)

	print(f"Wrote {len(output_records)} anonymized records to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
	main()
