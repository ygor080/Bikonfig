-- NULL significa estoque desconhecido. is_active continua independente.
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_checked_at TIMESTAMPTZ;
