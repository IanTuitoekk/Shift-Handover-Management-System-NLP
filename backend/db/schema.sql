CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE users (
    user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name      VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(50) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IncidentTaxonomy (per class diagram)
CREATE TABLE incident_taxonomy (
    taxonomy_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version      INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IncidentTaxonomy.categories realised as a child table (one-to-many)
CREATE TABLE incident_categories (
    category_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taxonomy_id    UUID NOT NULL REFERENCES incident_taxonomy(taxonomy_id) ON DELETE CASCADE,
    category_name  VARCHAR(100) NOT NULL UNIQUE
);

-- HandoverSubmission (raw input)
CREATE TABLE handover_submissions (
    submission_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(user_id), -- NOT NULL once auth is wired into submission flow
    input_type          VARCHAR(20) NOT NULL CHECK (input_type IN ('text', 'voice')),
    content              TEXT NOT NULL,
    language_variant     VARCHAR(20),
    shift                VARCHAR(100),
    processing_status    VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HandoverReport (NLP-processed output)
CREATE TABLE handover_reports (
    report_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id         UUID NOT NULL REFERENCES handover_submissions(submission_id) ON DELETE CASCADE,
    summary               TEXT,
    category_id           UUID REFERENCES incident_categories(category_id),
    category_confidence   NUMERIC(5,4),
    generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- entities: List on HandoverReport
CREATE TABLE report_entities (
    id            SERIAL PRIMARY KEY,
    report_id     UUID NOT NULL REFERENCES handover_reports(report_id) ON DELETE CASCADE,
    entity_type   VARCHAR(30) NOT NULL
                  CHECK (entity_type IN ('AIRCRAFT', 'COMPONENT', 'ROLE', 'LOCATION', 'TASK', 'TIME')),
    entity_text   TEXT NOT NULL,
    confidence    NUMERIC(5,4)
);

-- TaskRegister
CREATE TABLE task_register (
    task_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     UUID NOT NULL REFERENCES handover_reports(report_id) ON DELETE CASCADE,
    description   TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    assigned_to   UUID REFERENCES users(user_id),
    resolved_by   UUID REFERENCES users(user_id),
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NotificationService
CREATE TABLE notifications (
    notif_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     UUID NOT NULL REFERENCES handover_reports(report_id) ON DELETE CASCADE,
    recipient_id  UUID REFERENCES users(user_id),
    message       TEXT NOT NULL,
    is_read       BOOLEAN NOT NULL DEFAULT false,
    read_at       TIMESTAMPTZ,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Remove per-notification read tracking (doesn't work for broadcasts)
ALTER TABLE notifications DROP COLUMN IF EXISTS is_read;
ALTER TABLE notifications DROP COLUMN IF EXISTS read_at;

-- Join table: tracks each user's read status independently
CREATE TABLE notification_reads (
    notif_id   UUID NOT NULL REFERENCES notifications(notif_id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notif_id, user_id)
);

CREATE TABLE revoked_tokens (
    token      TEXT PRIMARY KEY,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE INDEX idx_notification_reads_user ON notification_reads(user_id);
CREATE INDEX idx_submissions_user ON handover_submissions(user_id);
CREATE INDEX idx_submissions_status ON handover_submissions(processing_status);
CREATE INDEX idx_reports_submission ON handover_reports(submission_id);
CREATE INDEX idx_reports_category ON handover_reports(category_id);
CREATE INDEX idx_report_entities_report ON report_entities(report_id);
CREATE INDEX idx_categories_taxonomy ON incident_categories(taxonomy_id);
CREATE INDEX idx_tasks_report ON task_register(report_id);
CREATE INDEX idx_tasks_status ON task_register(status);
CREATE INDEX idx_notifications_report ON notifications(report_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);