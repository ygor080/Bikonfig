BEGIN;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_versao INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS recuperacoes_senha (
    token_hash TEXT PRIMARY KEY CHECK (char_length(token_hash) = 64),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em TIMESTAMPTZ NOT NULL,
    usado_em TIMESTAMPTZ,
    email_payload TEXT,
    enviado_em TIMESTAMPTZ,
    tentativas INTEGER NOT NULL DEFAULT 0,
    proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT now(),
    bloqueado_ate TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recuperacoes_usuario ON recuperacoes_senha(usuario_id, criado_em DESC);
ALTER TABLE recuperacoes_senha ENABLE ROW LEVEL SECURITY;
COMMIT;
