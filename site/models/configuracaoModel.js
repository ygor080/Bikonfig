const { pool } = require('../config/banco');

class ConfiguracaoModel {
    static async salvar(usuarioId, nome, itens) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                'INSERT INTO configuracoes (usuario_id, nome) VALUES ($1, $2) RETURNING id, nome, criado_em',
                [usuarioId, nome]
            );
            const configuracao = rows[0];

            for (const item of itens) {
                await client.query(
                    'INSERT INTO configuracao_itens (configuracao_id, produto_id, posicao) VALUES ($1, $2, $3)',
                    [configuracao.id, item.id, item.posicao || null]
                );
            }

            await client.query('COMMIT');
            return configuracao;
        } catch (erro) {
            await client.query('ROLLBACK');
            throw erro;
        } finally {
            client.release();
        }
    }

    static async listarPorUsuario(usuarioId) {
        const { rows } = await pool.query(
            `SELECT
                c.id, c.nome, c.criado_em,
                COUNT(ci.id) AS total_pecas,
                COALESCE(SUM(p.current_price), 0) AS total_preco
             FROM configuracoes c
             LEFT JOIN configuracao_itens ci ON ci.configuracao_id = c.id
             LEFT JOIN products p ON p.id = ci.produto_id
             WHERE c.usuario_id = $1
             GROUP BY c.id
             ORDER BY c.criado_em DESC`,
            [usuarioId]
        );

        return rows.map(row => ({
            id: row.id,
            nome: row.nome,
            criadoEm: row.criado_em,
            totalPecas: Number(row.total_pecas),
            totalPreco: Number(row.total_preco)
        }));
    }

    static async buscarPorId(id, usuarioId) {
        const { rows } = await pool.query(
            'SELECT id, nome, criado_em FROM configuracoes WHERE id = $1 AND usuario_id = $2',
            [id, usuarioId]
        );
        return rows[0] || null;
    }

    static async listarItens(configuracaoId) {
        const { rows } = await pool.query(
            'SELECT produto_id, posicao FROM configuracao_itens WHERE configuracao_id = $1',
            [configuracaoId]
        );
        return rows.map(row => ({ id: row.produto_id, posicao: row.posicao }));
    }

    static async excluir(id, usuarioId) {
        const { rowCount } = await pool.query(
            'DELETE FROM configuracoes WHERE id = $1 AND usuario_id = $2',
            [id, usuarioId]
        );
        return rowCount > 0;
    }
}

module.exports = ConfiguracaoModel;
