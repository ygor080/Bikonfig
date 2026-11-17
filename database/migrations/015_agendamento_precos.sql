BEGIN;
-- Não usar updated_at como data de consulta: ele também muda na revisão manual.
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS scrape_runs (
    id BIGSERIAL PRIMARY KEY,
    target_url TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
    products_processed INTEGER CHECK (products_processed >= 0),
    error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started ON scrape_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS scrape_job_locks (
    job_key TEXT PRIMARY KEY,
    owner UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
COMMIT;
