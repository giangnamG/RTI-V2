CREATE TABLE IF NOT EXISTS dir_fuzz_results (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id      UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id         UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    base_url       TEXT        NOT NULL,
    path           TEXT        NOT NULL,
    url            TEXT        NOT NULL,
    status_code    INTEGER     NOT NULL DEFAULT 0,
    content_length INTEGER     NOT NULL DEFAULT 0,
    content_type   TEXT,
    words          INTEGER     NOT NULL DEFAULT 0,
    lines          INTEGER     NOT NULL DEFAULT 0,
    redirect_url   TEXT,
    is_interesting BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dir_fuzz_results_workspace    ON dir_fuzz_results(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dir_fuzz_results_target       ON dir_fuzz_results(target_id);
CREATE INDEX IF NOT EXISTS idx_dir_fuzz_results_base_url     ON dir_fuzz_results(base_url);
CREATE INDEX IF NOT EXISTS idx_dir_fuzz_results_interesting  ON dir_fuzz_results(workspace_id, is_interesting);
