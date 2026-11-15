-- Fabricante independente da loja (sources). Produtos antigos permanecem sem fabricante.
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer TEXT;
