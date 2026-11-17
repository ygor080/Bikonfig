const { pool } = require('../config/banco');
class ColetaModel {
    static async consultar() {
        const { rows: execucoes } = await pool.query(`SELECT id, target_url, started_at, finished_at, status,
            products_processed, error_code,
            (status = 'running' AND started_at < now() - interval '75 minutes') AS interrompida
            FROM scrape_runs ORDER BY started_at DESC, id DESC LIMIT 30`);
        const { rows: [precos] } = await pool.query(`SELECT MAX(price_checked_at) AS ultima_consulta,
            COUNT(*) FILTER (WHERE price_checked_at >= now() - interval '36 hours') AS atualizados
            FROM products WHERE is_active = true AND duplicate_of IS NULL`);
        return { execucoes, precos };
    }
}
module.exports = ColetaModel;
