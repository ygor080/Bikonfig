const { opcoesSessao } = require('./sessao');
const ESTRUTURA = {
    categories: ['id', 'slug', 'name', 'parent_id'],
    sources: ['id', 'name', 'domain'],
    usuarios: ['id', 'nome', 'email', 'senha', 'is_admin', 'ultimo_login'],
    configuracoes: ['id', 'usuario_id', 'nome', 'tipo_montagem', 'criado_em'],
    configuracao_itens: ['id', 'configuracao_id', 'produto_id', 'posicao'],
    products: ['id', 'source_id', 'category_id', 'name', 'product_url', 'image_url', 'current_price', 'specs',
        'manufacturer', 'in_stock', 'stock_checked_at', 'canonical_url', 'duplicate_of', 'external_product_id',
        'external_variant_id', 'sku', 'variant_title', 'variant_options', 'needs_review', 'is_active', 'is_optional',
        'category_manually_reviewed', 'specs_manually_reviewed', 'manufacturer_manually_reviewed',
        'manual_reviewed_at', 'manual_reviewed_by', 'price_checked_at'],
    compatibility_rules: ['category_a', 'category_b', 'spec_key', 'description'],
    raw_scrapes: ['raw_description', 'raw_attributes', 'raw_variant_options'],
    scrape_runs: ['id', 'target_url', 'started_at', 'finished_at', 'status', 'products_processed', 'error_code'],
    scrape_job_locks: ['job_key', 'owner', 'expires_at']
};

function verificarAmbiente(env, local = false) {
    const pendencias = [];
    try { opcoesSessao(env); } catch { pendencias.push('SECRET ausente, de exemplo ou com menos de 32 bytes.'); }
    try {
        const url = new URL(env.DATABASE_URL);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || env.DATABASE_URL.includes('COLE_A_')) throw new Error();
    } catch { pendencias.push('DATABASE_URL ausente ou inválida.'); }
    if (!local && env.NODE_ENV !== 'production') pendencias.push('Configure NODE_ENV=production no Render.');
    return pendencias;
}

async function verificarBanco(pool) {
    const { rows } = await pool.query(`SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [Object.keys(ESTRUTURA)]);
    const presentes = new Set(rows.map(row => row.table_name + '.' + row.column_name));
    const faltantes = Object.entries(ESTRUTURA).flatMap(([tabela, colunas]) => colunas
        .filter(coluna => !presentes.has(tabela + '.' + coluna)).map(coluna => tabela + '.' + coluna));
    const { rows: [sessao] } = await pool.query(`SELECT to_regclass('sessoes_site') IS NOT NULL AS existe,
        has_schema_privilege(current_schema(), 'CREATE') AS pode_criar`);
    const pendencias = [];
    if (faltantes.length) pendencias.push('Estrutura incompleta: ' + faltantes.join(', '));
    if (!sessao.existe && !sessao.pode_criar) pendencias.push('Sessões: tabela ausente e usuário sem permissão para criá-la.');
    if (sessao.existe) {
        const { rows: [permissoes] } = await pool.query(`SELECT
            has_table_privilege('sessoes_site', 'SELECT') AND has_table_privilege('sessoes_site', 'INSERT')
            AND has_table_privilege('sessoes_site', 'UPDATE') AND has_table_privilege('sessoes_site', 'DELETE') AS permitido`);
        if (!permissoes.permitido) pendencias.push('Sessões: faltam permissões de leitura ou gravação.');
        // Valida os campos sem ler o conteúdo das sessões.
        await pool.query('SELECT sid, sess, expire FROM sessoes_site LIMIT 0');
    }
    return { pendencias, sessoes: sessao.existe ? 'tabela existente' : 'criação automática no primeiro uso' };
}

module.exports = { ESTRUTURA, verificarAmbiente, verificarBanco };
