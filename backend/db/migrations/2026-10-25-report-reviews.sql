-- Supervisor review of the model's analysis. Safe to run more than once.
-- A review replaces a report's category and entities with the supervisor's (so filters, stats and
-- insights use the corrected data) and keeps what the model originally said in report_reviews.
ALTER TABLE handover_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE handover_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS report_reviews (
    report_id                  UUID PRIMARY KEY REFERENCES handover_reports(report_id) ON DELETE CASCADE,
    -- The model's output, captured at the first review and never changed afterwards.
    model_category_id          UUID REFERENCES incident_categories(category_id),
    model_category_confidence  NUMERIC(5,4),
    model_entities             JSONB NOT NULL DEFAULT '[]',
    first_reviewed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    review_count               INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_reports_reviewed ON handover_reports(reviewed_at);
