// O catálogo pode exibir ofertas sem estoque, identificadas e sem ação de seleção.
module.exports = 'p.is_active = true AND p.needs_review = false AND p.current_price IS NOT NULL AND p.current_price > 0';
