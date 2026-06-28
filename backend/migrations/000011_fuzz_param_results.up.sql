CREATE TABLE IF NOT EXISTS fuzz_param_results (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_id    UUID        REFERENCES targets(id) ON DELETE SET NULL,
    job_id       UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    url          TEXT        NOT NULL,
    method       TEXT        NOT NULL DEFAULT 'GET',
    params       JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuzz_param_results_workspace  ON fuzz_param_results(workspace_id);
CREATE INDEX IF NOT EXISTS idx_fuzz_param_results_target     ON fuzz_param_results(target_id);
CREATE INDEX IF NOT EXISTS idx_fuzz_param_results_url_method ON fuzz_param_results(url, method);
