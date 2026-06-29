-- ── Firebase web config extract được từ target ───────────────
-- Append-only: mỗi lần scan firebase đều ghi lại config trích từ HTML/JS của host
-- (apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId). Bảng hiển thị
-- run mới nhất per target (xem rules/data-model.md R2+R6).

CREATE TABLE IF NOT EXISTS extracted_firebase_config (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id            UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id               UUID        REFERENCES jobs(id)    ON DELETE SET NULL,
    host                 TEXT,
    api_key              TEXT,
    auth_domain          TEXT,
    project_id           TEXT,
    storage_bucket       TEXT,
    messaging_sender_id  TEXT,
    app_id               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extracted_fb_config_ws  ON extracted_firebase_config(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_fb_config_job ON extracted_firebase_config(job_id);
