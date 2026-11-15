-- Aplicar antes de publicar a etapa 8 em uma base existente.
ALTER TABLE configuracoes
    ADD COLUMN IF NOT EXISTS tipo_montagem TEXT NOT NULL DEFAULT 'com-marchas';
