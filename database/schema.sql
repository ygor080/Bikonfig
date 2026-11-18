CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS sources (
    id          SERIAL PRIMARY KEY,
    domain      TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS raw_scrapes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      INTEGER NOT NULL REFERENCES sources(id),
    product_url    TEXT NOT NULL,
    raw_name       TEXT,
    raw_price_text TEXT,
    raw_image_url  TEXT,
    raw_html_snippet TEXT,
    scraped_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_scrapes_url ON raw_scrapes(product_url);

CREATE TABLE IF NOT EXISTS products (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id         INTEGER NOT NULL REFERENCES sources(id),
    category_id       INTEGER REFERENCES categories(id),
    name              TEXT NOT NULL,
    product_url       TEXT NOT NULL,
    image_url         TEXT,
    current_price     NUMERIC(10, 2),
    specs             JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_confidence     REAL,
    needs_review      BOOLEAN NOT NULL DEFAULT true,
    is_optional       BOOLEAN NOT NULL DEFAULT false,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, product_url)
);

ALTER TABLE raw_scrapes ADD COLUMN IF NOT EXISTS raw_description TEXT NOT NULL DEFAULT '';
ALTER TABLE raw_scrapes ADD COLUMN IF NOT EXISTS raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE raw_scrapes ADD COLUMN IF NOT EXISTS raw_variant_options JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_checked_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS external_product_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS external_variant_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_options JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_products_canonical_url ON products(source_id, canonical_url);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_variant ON products(source_id, external_variant_id)
    WHERE external_variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_url_without_variant ON products(source_id, product_url)
    WHERE external_variant_id IS NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_source_id_product_url_key;
CREATE INDEX IF NOT EXISTS idx_products_needs_review ON products(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_products_is_optional ON products(is_optional);
CREATE INDEX IF NOT EXISTS idx_products_specs ON products USING GIN (specs);

CREATE TABLE IF NOT EXISTS price_history (
    id          BIGSERIAL PRIMARY KEY,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price       NUMERIC(10, 2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS compatibility_rules (
    id            SERIAL PRIMARY KEY,
    category_a    TEXT NOT NULL REFERENCES categories(slug),
    category_b    TEXT NOT NULL REFERENCES categories(slug),
    spec_key      TEXT NOT NULL,
    description   TEXT NOT NULL,
    UNIQUE (category_a, category_b, spec_key)
);

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE CHECK (char_length(nome) >= 3),
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_login TIMESTAMPTZ
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

INSERT INTO categories (slug, name, parent_id) VALUES
    ('quadro', 'Quadro', NULL),
    ('guidao', 'Guidão', NULL),
    ('rodas', 'Rodas', NULL),
    ('cambio-dianteiro', 'Câmbio Dianteiro', NULL),
    ('cambio-traseiro', 'Câmbio Traseiro', NULL),
    ('cassete', 'Cassete', NULL),
    ('corrente', 'Corrente', NULL),
    ('freios', 'Freios', NULL),
    ('selim', 'Selim', NULL),
    ('pneus', 'Pneus', NULL),
    ('pedivela', 'Pedivela', NULL),
    ('outros', 'Outros', NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'cambio-dianteiro-desviador', 'Desviador Dianteiro', id FROM categories WHERE slug = 'cambio-dianteiro'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'cambio-dianteiro-trocador', 'Trocador (Manete) Dianteiro', id FROM categories WHERE slug = 'cambio-dianteiro'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'cambio-dianteiro-cabo', 'Cabo e Capa Dianteiro', id FROM categories WHERE slug = 'cambio-dianteiro'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'cambio-traseiro-desviador', 'Desviador Traseiro', id FROM categories WHERE slug = 'cambio-traseiro'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'cambio-traseiro-trocador', 'Trocador (Manete) Traseiro', id FROM categories WHERE slug = 'cambio-traseiro'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'cambio-traseiro-cabo', 'Cabo e Capa Traseiro', id FROM categories WHERE slug = 'cambio-traseiro'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_rules (category_a, category_b, spec_key, description) VALUES
    ('cambio-traseiro-desviador', 'cassete', 'velocidades',
        'O câmbio traseiro e o cassete precisam ter o mesmo número de velocidades.'),
    ('cambio-traseiro-trocador', 'cassete', 'velocidades',
        'O trocador (manete) traseiro precisa ter o mesmo número de velocidades do cassete.'),
    ('cambio-traseiro-desviador', 'cambio-traseiro-trocador', 'velocidades',
        'O desviador e o trocador traseiros precisam ser do mesmo número de velocidades.'),
    ('cambio-dianteiro-desviador', 'pedivela', 'numero_coroas',
        'O câmbio dianteiro precisa ser compatível com o número de coroas do pedivela.'),
    ('rodas', 'quadro', 'aro', 'O aro da roda precisa bater com o aro suportado pelo quadro.'),
    ('rodas', 'pneus', 'aro', 'O aro do pneu precisa bater com o aro da roda.'),
    ('freios', 'rodas', 'padrao_freio', 'O padrão de freio (disco ou v-brake) precisa ser compatível com a roda.')
ON CONFLICT (category_a, category_b, spec_key) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'freios-dianteiro', 'Freio Dianteiro', id FROM categories WHERE slug = 'freios'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'freios-traseiro', 'Freio Traseiro', id FROM categories WHERE slug = 'freios'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-dianteira', 'Roda Dianteira', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-traseira', 'Roda Traseira', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'guidao-manoplas', 'Manoplas', id FROM categories WHERE slug = 'guidao'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'guidao-avanco', 'Avanço (Mesa)', id FROM categories WHERE slug = 'guidao'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'selim-canote', 'Canote de Selim', id FROM categories WHERE slug = 'selim'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'pedivela-movimento-central', 'Movimento Central', id FROM categories WHERE slug = 'pedivela'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'quadro-garfo', 'Garfo / Suspensão Dianteira', id FROM categories WHERE slug = 'quadro'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'quadro-amortecedor', 'Amortecedor Traseiro', id FROM categories WHERE slug = 'quadro'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'outros-pedal', 'Pedal', id FROM categories WHERE slug = 'outros'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_rules (category_a, category_b, spec_key, description) VALUES
    ('freios-dianteiro', 'rodas-dianteira', 'padrao_freio',
        'O padrão do freio dianteiro (disco ou v-brake) precisa ser compatível com a roda dianteira.'),
    ('freios-traseiro', 'rodas-traseira', 'padrao_freio',
        'O padrão do freio traseiro (disco ou v-brake) precisa ser compatível com a roda traseira.'),
    ('rodas-dianteira', 'quadro-garfo', 'aro',
        'O aro da roda dianteira precisa bater com o aro suportado pelo garfo/suspensão.')
ON CONFLICT (category_a, category_b, spec_key) DO NOTHING;

INSERT INTO categories (slug, name, parent_id) VALUES
    ('direcao', 'Direção (Caixa de Direção)', NULL),
    ('pedal', 'Pedal', NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-camara-ar', 'Câmara de Ar', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'freios-disco', 'Disco de Freio', id FROM categories WHERE slug = 'freios'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'freios-pastilha', 'Pastilha de Freio', id FROM categories WHERE slug = 'freios'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'freios-cabo', 'Cabo/Mangueira de Freio', id FROM categories WHERE slug = 'freios'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'guidao-fita', 'Fita de Guidão', id FROM categories WHERE slug = 'guidao'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'pedivela-coroa', 'Coroa', id FROM categories WHERE slug = 'pedivela'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_rules (category_a, category_b, spec_key, description) VALUES
    ('rodas-camara-ar', 'rodas', 'aro',
        'A câmara de ar precisa ter o aro compatível com a roda.'),
    ('rodas-camara-ar', 'pneus', 'aro',
        'A câmara de ar precisa ter o aro compatível com o pneu.'),
    ('freios-pastilha', 'freios-dianteiro', 'padrao_freio',
        'A pastilha precisa ser compatível com o padrão do freio dianteiro (disco ou v-brake).'),
    ('freios-pastilha', 'freios-traseiro', 'padrao_freio',
        'A pastilha precisa ser compatível com o padrão do freio traseiro (disco ou v-brake).'),
    ('freios-disco', 'rodas', 'padrao_freio',
        'O disco de freio só se aplica a rodas com padrão de freio a disco.')
ON CONFLICT (category_a, category_b, spec_key) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'freios-manete', 'Manete de Freio', id FROM categories WHERE slug = 'freios'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-aro', 'Aro', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-raio', 'Raio', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id) VALUES
    ('paralama', 'Paralama / Guarda-lama', NULL),
    ('bagageiro', 'Bagageiro', NULL),
    ('descanso', 'Descanso (Cavalete)', NULL),
    ('iluminacao', 'Iluminação', NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'iluminacao-farol', 'Farol Dianteiro', id FROM categories WHERE slug = 'iluminacao'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'iluminacao-lanterna', 'Lanterna Traseira', id FROM categories WHERE slug = 'iluminacao'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_rules (category_a, category_b, spec_key, description) VALUES
    ('rodas-aro', 'pneus', 'aro',
        'O aro da roda precisa bater com o aro do pneu.'),
    ('rodas-aro', 'quadro', 'aro',
        'O aro da roda precisa ser compatível com o aro suportado pelo quadro.'),
    ('freios-manete', 'freios-dianteiro', 'padrao_freio',
        'O manete precisa ser compatível com o padrão do freio dianteiro (disco ou v-brake).'),
    ('freios-manete', 'freios-traseiro', 'padrao_freio',
        'O manete precisa ser compatível com o padrão do freio traseiro (disco ou v-brake).')
ON CONFLICT (category_a, category_b, spec_key) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-cubo-dianteiro', 'Cubo Dianteiro', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'rodas-cubo-traseiro', 'Cubo Traseiro', id FROM categories WHERE slug = 'rodas'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_rules (category_a, category_b, spec_key, description) VALUES
    ('rodas-cubo-traseiro', 'cassete', 'padrao_freehub',
        'O padrão de encaixe do cassete precisa corresponder ao corpo do cubo traseiro.')
ON CONFLICT (category_a, category_b, spec_key) DO NOTHING;

INSERT INTO categories (slug, name, parent_id) VALUES
    ('fixacao-roda', 'Fixação da Roda (Eixo/Fecho Rápido)', NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'fixacao-roda-dianteiro', 'Eixo/Fecho Rápido Dianteiro', id FROM categories WHERE slug = 'fixacao-roda'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'fixacao-roda-traseiro', 'Eixo/Fecho Rápido Traseiro', id FROM categories WHERE slug = 'fixacao-roda'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'paralama-dianteiro', 'Paralama Dianteiro', id FROM categories WHERE slug = 'paralama'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'paralama-traseiro', 'Paralama Traseiro', id FROM categories WHERE slug = 'paralama'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, parent_id)
SELECT 'bagageiro-dianteiro', 'Bagageiro Dianteiro', id FROM categories WHERE slug = 'bagageiro'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (slug, name, parent_id)
SELECT 'bagageiro-traseiro', 'Bagageiro Traseiro', id FROM categories WHERE slug = 'bagageiro'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO compatibility_rules (category_a, category_b, spec_key, description) VALUES
    ('fixacao-roda-dianteiro', 'quadro-garfo', 'diametro_eixo',
        'O eixo/fecho rápido dianteiro precisa ter o diâmetro compatível com o garfo (ex: 9mm QR ou 15mm Boost).'),
    ('fixacao-roda-dianteiro', 'rodas-cubo-dianteiro', 'diametro_eixo',
        'O eixo/fecho rápido dianteiro precisa ter o diâmetro compatível com o cubo dianteiro.'),
    ('fixacao-roda-traseiro', 'quadro', 'diametro_eixo',
        'O eixo/fecho rápido traseiro precisa ter o diâmetro compatível com o encaixe traseiro do quadro (ex: 10mm QR ou 12mm Boost).'),
    ('fixacao-roda-traseiro', 'rodas-cubo-traseiro', 'diametro_eixo',
        'O eixo/fecho rápido traseiro precisa ter o diâmetro compatível com o cubo traseiro.')
ON CONFLICT (category_a, category_b, spec_key) DO NOTHING;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

BEGIN;

UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'pneus')
WHERE category_id IN (
    SELECT id FROM categories WHERE slug IN ('pneus-dianteiro', 'pneus-traseiro')
);

DELETE FROM compatibility_rules
WHERE category_a IN ('pneus-dianteiro', 'pneus-traseiro')
   OR category_b IN ('pneus-dianteiro', 'pneus-traseiro');

DELETE FROM categories WHERE slug IN ('pneus-dianteiro', 'pneus-traseiro');

COMMIT;

CREATE TABLE IF NOT EXISTS configuracoes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL CHECK (char_length(nome) >= 1),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_configuracoes_usuario ON configuracoes(usuario_id, criado_em DESC);

ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS tipo_montagem TEXT NOT NULL DEFAULT 'com-marchas';

CREATE TABLE IF NOT EXISTS configuracao_itens (
    id                BIGSERIAL PRIMARY KEY,
    configuracao_id   UUID NOT NULL REFERENCES configuracoes(id) ON DELETE CASCADE,
    produto_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    posicao           TEXT
);

CREATE INDEX IF NOT EXISTS idx_configuracao_itens_config ON configuracao_itens(configuracao_id);

-- Proteção de revisão manual (após a criação de usuarios).
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_manually_reviewed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS specs_manually_reviewed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_manually_reviewed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_reviewed_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_reviewed_by UUID REFERENCES usuarios(id) ON DELETE SET NULL;

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

-- Vínculo de identidade opcional: preserva os UUIDs usados nas montagens.
CREATE TABLE IF NOT EXISTS usuarios_identidades (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    firebase_project_id TEXT NOT NULL CHECK (char_length(firebase_project_id) BETWEEN 1 AND 128),
    firebase_uid TEXT NOT NULL CHECK (char_length(firebase_uid) BETWEEN 1 AND 128),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (firebase_project_id, firebase_uid),
    UNIQUE (usuario_id, firebase_project_id)
);
ALTER TABLE usuarios_identidades ENABLE ROW LEVEL SECURITY;

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
