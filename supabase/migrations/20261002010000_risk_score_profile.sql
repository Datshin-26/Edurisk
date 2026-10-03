ALTER TABLE risk_predictions
    ADD COLUMN IF NOT EXISTS student_id TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'risk_predictions'
          AND column_name = 'performance_id'
    ) THEN
        UPDATE public.risk_predictions AS prediction
        SET student_id = performance.student_id
        FROM public.academic_performance AS performance
        WHERE prediction.performance_id = performance.performance_id
          AND prediction.student_id IS NULL;

        ALTER TABLE public.risk_predictions
            ALTER COLUMN performance_id DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'risk_predictions'
          AND column_name = 'risk_probability'
    ) THEN
        ALTER TABLE public.risk_predictions
            ALTER COLUMN risk_probability DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE risk_predictions
    ALTER COLUMN student_id SET NOT NULL;

ALTER TABLE risk_predictions
    ADD COLUMN IF NOT EXISTS risk_score NUMERIC(6, 5)
        CHECK (risk_score BETWEEN 0 AND 1);

DO $$
DECLARE
    check_constraint RECORD;
BEGIN
    FOR check_constraint IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.risk_predictions'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%risk_level%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.risk_predictions DROP CONSTRAINT %I',
            check_constraint.conname
        );
    END LOOP;
END $$;

ALTER TABLE risk_predictions
    ADD CONSTRAINT risk_predictions_risk_level_check
    CHECK (risk_level IN ('Low', 'Medium', 'High'));

COMMENT ON COLUMN risk_predictions.risk_score IS
    'Cohort-relative anomaly percentile, not a calibrated probability of future failure.';

CREATE INDEX IF NOT EXISTS risk_predictions_student_idx
    ON risk_predictions(student_id, predicted_at DESC);