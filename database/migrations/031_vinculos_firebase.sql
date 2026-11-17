BEGIN;
CREATE TABLE IF NOT EXISTS usuarios_identidades (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    firebase_project_id TEXT NOT NULL CHECK (char_length(firebase_project_id) BETWEEN 1 AND 128),
    firebase_uid TEXT NOT NULL CHECK (char_length(firebase_uid) BETWEEN 1 AND 128),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (firebase_project_id, firebase_uid),
    UNIQUE (usuario_id, firebase_project_id)
);
ALTER TABLE usuarios_identidades ENABLE ROW LEVEL SECURITY;
COMMIT;
