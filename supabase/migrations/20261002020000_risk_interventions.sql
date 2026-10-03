CREATE TABLE risk_interventions (
    source_prediction_id BIGINT PRIMARY KEY
        REFERENCES risk_predictions(prediction_id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    model_version TEXT NOT NULL,
    risk_level TEXT NOT NULL
        CHECK (risk_level IN ('Low', 'Medium', 'High')),
    risk_score NUMERIC(6, 5) NOT NULL
        CHECK (risk_score BETWEEN 0 AND 1),
    action_type TEXT NOT NULL
        CHECK (action_type IN ('human_check_in', 'monitor')),
    workflow_status TEXT NOT NULL
        CHECK (workflow_status IN (
            'intervention_pending', 'monitoring', 'follow_up_due', 'closed'
        )),
    notification_status TEXT NOT NULL
        CHECK (notification_status IN (
            'needs_contact_data', 'not_required', 'queued', 'sent', 'failed'
        )),
    follow_up_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX risk_interventions_follow_up_idx
    ON risk_interventions(follow_up_due_at)
    WHERE workflow_status = 'intervention_pending';

ALTER TABLE risk_interventions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE risk_interventions IS
    'Idempotent, pseudonymous intervention and monitoring queue populated by n8n.';
COMMENT ON COLUMN risk_interventions.notification_status IS
    'High-risk notices remain needs_contact_data until an approved recipient and channel are configured.';