CREATE TABLE students (
    student_id TEXT PRIMARY KEY
        CHECK (student_id ~ '^AIDS[0-9]{4}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE course_catalog (
    subject_key TEXT PRIMARY KEY
        CHECK (subject_key IN (
            'dm', 'ai', 'fods', 'ds', 'oops', 'dpco',
            'data_science_lab', 'oops_lab'
        )),
    course_code TEXT NOT NULL UNIQUE,
    component_type TEXT NOT NULL
        CHECK (component_type IN ('theory', 'lab')),
    credits NUMERIC(4, 2) NOT NULL CHECK (credits > 0)
);

INSERT INTO course_catalog (subject_key, course_code, component_type, credits) VALUES
    ('dm', '241MAB301T', 'theory', 4),
    ('ai', '241ALC301J', 'theory', 3),
    ('fods', '241ADC301T', 'theory', 3),
    ('ds', '241CSC301J', 'theory', 4),
    ('oops', '241GES302T', 'theory', 3),
    ('dpco', '241GES301J', 'theory', 3),
    ('data_science_lab', '241ADC311L', 'lab', 2),
    ('oops_lab', '241GES311L', 'lab', 2);

CREATE TABLE grade_scale (
    grade_code TEXT PRIMARY KEY,
    grade_point NUMERIC(3, 1) NOT NULL CHECK (grade_point BETWEEN 0 AND 10),
    is_pass BOOLEAN NOT NULL
);

INSERT INTO grade_scale (grade_code, grade_point, is_pass) VALUES
    ('O', 10, TRUE),
    ('A+', 9, TRUE),
    ('A', 8, TRUE),
    ('B+', 7, TRUE),
    ('B', 6, TRUE),
    ('C', 5, TRUE),
    ('U', 0, FALSE),
    ('UA', 0, FALSE);

CREATE TABLE cohort_subject_summary (
    academic_year SMALLINT NOT NULL,
    semester TEXT NOT NULL
        CHECK (semester IN ('I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII')),
    subject_key TEXT NOT NULL REFERENCES course_catalog(subject_key),
    cohort_size SMALLINT NOT NULL CHECK (cohort_size > 0),
    passed_count SMALLINT NOT NULL CHECK (passed_count BETWEEN 0 AND cohort_size),
    pass_percentage NUMERIC(5, 2) GENERATED ALWAYS AS
        (ROUND(passed_count * 100.0 / cohort_size, 2)) STORED,
    PRIMARY KEY (academic_year, semester, subject_key)
);

INSERT INTO cohort_subject_summary
    (academic_year, semester, subject_key, cohort_size, passed_count) VALUES
    (2026, 'III', 'dm', 49, 47),
    (2026, 'III', 'ai', 49, 49),
    (2026, 'III', 'fods', 49, 48),
    (2026, 'III', 'ds', 49, 47),
    (2026, 'III', 'oops', 49, 47),
    (2026, 'III', 'dpco', 49, 47),
    (2026, 'III', 'data_science_lab', 49, 49),
    (2026, 'III', 'oops_lab', 49, 49);

CREATE TABLE academic_performance (
    performance_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    semester TEXT NOT NULL
        CHECK (semester IN ('I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII')),
    academic_year SMALLINT NOT NULL CHECK (academic_year BETWEEN 2000 AND 2200),
    section TEXT NOT NULL,

    dm_grade TEXT CHECK (dm_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')),
    ai_grade TEXT CHECK (ai_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')),
    fods_grade TEXT CHECK (fods_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')),
    ds_grade TEXT CHECK (ds_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')),
    oops_grade TEXT CHECK (oops_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')),
    dpco_grade TEXT CHECK (dpco_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')),
    data_science_lab_grade TEXT CHECK (
        data_science_lab_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')
    ),
    oops_lab_grade TEXT CHECK (
        oops_lab_grade IN ('O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'UA')
    ),

    average_grade_point NUMERIC(4, 2)
        CHECK (average_grade_point BETWEEN 0 AND 10),
    theory_average NUMERIC(4, 2) CHECK (theory_average BETWEEN 0 AND 10),
    lab_average NUMERIC(4, 2) CHECK (lab_average BETWEEN 0 AND 10),
    credit_weighted_score NUMERIC(4, 2)
        CHECK (credit_weighted_score BETWEEN 0 AND 10),
    low_grade_count SMALLINT CHECK (low_grade_count BETWEEN 0 AND 8),
    failed_subject_count SMALLINT CHECK (failed_subject_count BETWEEN 0 AND 8),
    passed_subject_count SMALLINT CHECK (passed_subject_count BETWEEN 0 AND 8),

    attendance_percentage NUMERIC(5, 2)
        CHECK (attendance_percentage BETWEEN 0 AND 100),
    internal_assessment_1 NUMERIC(5, 2)
        CHECK (internal_assessment_1 BETWEEN 0 AND 100),
    internal_assessment_2 NUMERIC(5, 2)
        CHECK (internal_assessment_2 BETWEEN 0 AND 100),
    internal_assessment_average NUMERIC(5, 2)
        CHECK (internal_assessment_average BETWEEN 0 AND 100),
    assignment_completion NUMERIC(5, 2)
        CHECK (assignment_completion BETWEEN 0 AND 100),
    assignment_submission_rate NUMERIC(5, 2)
        CHECK (assignment_submission_rate BETWEEN 0 AND 100),
    lab_attendance NUMERIC(5, 2) CHECK (lab_attendance BETWEEN 0 AND 100),
    previous_semester_score NUMERIC(4, 2)
        CHECK (previous_semester_score BETWEEN 0 AND 10),
    previous_failures SMALLINT CHECK (previous_failures >= 0),
    study_hours_per_week NUMERIC(5, 2) CHECK (study_hours_per_week >= 0),

    next_semester_result NUMERIC(4, 2)
        CHECK (next_semester_result BETWEEN 0 AND 10),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (student_id, semester, academic_year)
);

CREATE TABLE risk_predictions (
    prediction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    performance_id BIGINT NOT NULL
        REFERENCES academic_performance(performance_id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Moderate', 'High')),
    risk_probability NUMERIC(6, 5) NOT NULL
        CHECK (risk_probability BETWEEN 0 AND 1),
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX academic_performance_student_idx
    ON academic_performance(student_id, academic_year, semester);
CREATE INDEX risk_predictions_performance_idx
    ON risk_predictions(performance_id, predicted_at DESC);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_scale ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_subject_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_predictions ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN academic_performance.next_semester_result IS
    'Future-semester average grade point (0-10); null until the actual outcome is available.';
COMMENT ON TABLE risk_predictions IS
    'Model outputs are kept separate from observed features and future outcomes.';
COMMENT ON TABLE course_catalog IS
    'Populate credits from the source result sheet before calculating credit-weighted scores.';
COMMENT ON TABLE grade_scale IS
    'EduRisk prototype grade mapping; document and validate this mapping against institutional policy.';
COMMENT ON TABLE cohort_subject_summary IS
    'Cohort-level pass rates are descriptive statistics, not student-level model features.';