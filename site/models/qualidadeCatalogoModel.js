const { pool } = require('../config/banco');
const normalizarSpec = require('./normalizarSpec');

function analisar(produtos, regras) {
    const identidades = new Map();
    const resultados = produtos.map(p => {
        const pendencias = [];
        const campos = [...new Set(regras.filter(r => [r.category_a, r.category_b].includes(p.categoria)).map(r => r.spec_key))];
        const specs = p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {};
        if (!p.categoria) pendencias.push('Sem categoria');
        if (!Object.keys(specs).length) pendencias.push('Sem especificações técnicas');
        const ausentes = campos.filter(campo => !Object.hasOwn(specs, campo) || normalizarSpec(specs[campo], campo) === null);
        if (ausentes.length) pendencias.push('Especificações a conferir: ' + ausentes.join(', '));
        if (p.external_variant_id && !p.sku && !p.variant_title && !Object.keys(p.variant_options || {}).length) {
            pendencias.push('Variante sem detalhes de identificação');
        }
        if (p.duplicate_of) pendencias.push('Vinculado como duplicata; fora da seleção');
        if (p.preco === null || !Number.isFinite(Number(p.preco)) || Number(p.preco) <= 0) pendencias.push('Preço inválido ou ausente');
        const identidade = JSON.stringify([p.source_id, p.canonical_url || p.product_url,
            p.external_variant_id || '', p.sku || '', p.variant_title || '',
            Object.entries(p.variant_options || {}).sort(([a], [b]) => a.localeCompare(b))]);
        if (!identidades.has(identidade)) identidades.set(identidade, []);
        const resultado = { ...p, pendencias };
        identidades.get(identidade).push(resultado);
        return resultado;
    });
    for (const grupo of identidades.values()) {
        if (grupo.length > 1) grupo.forEach(p => p.pendencias.push('Identidade de oferta repetida na amostra; conferir antes de unir registros'));
    }
    return resultados.filter(p => p.pendencias.length);
}

class QualidadeCatalogoModel {
    static async consultar() {
        const { rows: [totais] } = await pool.query(`SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE category_id IS NULL) AS sem_categoria,
            COUNT(*) FILTER (WHERE needs_review) AS revisar,
            COUNT(*) FILTER (WHERE duplicate_of IS NOT NULL) AS duplicados FROM products`);
        const { rows: produtos } = await pool.query(`SELECT p.id, p.name AS nome, p.source_id, s.name AS loja,
            c.slug AS categoria, p.specs, p.current_price AS preco, p.is_active AS ativo,
            p.product_url, p.canonical_url, p.external_variant_id, p.sku, p.variant_title, p.variant_options, p.duplicate_of
            FROM products p JOIN sources s ON s.id = p.source_id LEFT JOIN categories c ON c.id = p.category_id
            ORDER BY (p.category_id IS NULL) DESC, p.needs_review DESC, p.updated_at DESC, p.id LIMIT 500`);
        const { rows: regras } = await pool.query('SELECT category_a, category_b, spec_key FROM compatibility_rules');
        return { totais, amostrados: produtos.length, pendentes: analisar(produtos, regras) };
    }
}
module.exports = { QualidadeCatalogoModel, analisar };
