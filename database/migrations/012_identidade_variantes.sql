-- Mantém produtos antigos e todos os vínculos. A reconciliação ocorre por fonte na recoleta.
BEGIN;
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
COMMIT;
