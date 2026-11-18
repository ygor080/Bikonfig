const { pool } = require('../config/banco');
const PRODUTO_DISPONIVEL_SQL = require('../config/produtoDisponivel');
const versaoConfiguracao = require('./versaoConfiguracao');
const conflito = () => Object.assign(new Error('Montagem alterada em outra aba.'), { code:'CONFIGURACAO_CONFLITO' });

class ConfiguracaoModel {
    static async atualizar(id, usuarioId, nome, itens, tipoMontagem = 'com-marchas', versao) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (versao) {
                const {rows:atuais}=await client.query('SELECT id,nome,tipo_montagem FROM configuracoes WHERE id=$1 AND usuario_id=$2 FOR UPDATE',[id,usuarioId]);
                if (!atuais.length) { await client.query('ROLLBACK'); return null; }
                const {rows:aplicacoes}=await client.query('SELECT produto_id AS id,posicao FROM configuracao_itens WHERE configuracao_id=$1 ORDER BY id',[id]);
                if (versaoConfiguracao(atuais[0],aplicacoes)!==versao) throw conflito();
            }
            // O UPDATE autoriza e bloqueia a montagem antes de substituir seus itens.
            const { rows } = await client.query(
                'UPDATE configuracoes SET nome = $3, tipo_montagem = $4 WHERE id = $1 AND usuario_id = $2 RETURNING id, nome',
                [id, usuarioId, nome, tipoMontagem]
            );
            if (!rows.length) { await client.query('ROLLBACK'); return null; }
            await client.query('DELETE FROM configuracao_itens WHERE configuracao_id = $1', [id]);
            for (const item of itens) {
                await client.query('INSERT INTO configuracao_itens (configuracao_id, produto_id, posicao) VALUES ($1, $2, $3)',
                    [id, item.id, item.posicao || null]);
            }
            await client.query('COMMIT');
            return rows[0];
        } catch (erro) {
            await client.query('ROLLBACK');
            throw erro;
        } finally { client.release(); }
    }

    static async salvar(usuarioId, nome, itens, tipoMontagem = 'com-marchas', chaveCriacao) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (chaveCriacao) {
                const {rows:novas}=await client.query('INSERT INTO configuracoes(id,usuario_id,nome,tipo_montagem) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id,nome,criado_em',[chaveCriacao,usuarioId,nome,tipoMontagem]);
                if (!novas.length) {
                    const {rows:existentes}=await client.query('SELECT id,nome,tipo_montagem FROM configuracoes WHERE id=$1 AND usuario_id=$2 FOR UPDATE',[chaveCriacao,usuarioId]);
                    if (!existentes.length) throw conflito();
                    const {rows:aplicacoes}=await client.query('SELECT produto_id AS id,posicao FROM configuracao_itens WHERE configuracao_id=$1',[chaveCriacao]);
                    if (versaoConfiguracao(existentes[0],aplicacoes)!==versaoConfiguracao({nome,tipoMontagem},itens)) throw conflito();
                    await client.query('COMMIT'); return existentes[0];
                }
                for (const item of itens) await client.query('INSERT INTO configuracao_itens(configuracao_id,produto_id,posicao) VALUES($1,$2,$3)',[chaveCriacao,item.id,item.posicao||null]);
                await client.query('COMMIT'); return novas[0];
            }

            const { rows } = await client.query(
                'INSERT INTO configuracoes (usuario_id, nome, tipo_montagem) VALUES ($1, $2, $3) RETURNING id, nome, criado_em',
                [usuarioId, nome, tipoMontagem]
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
                COUNT(ci.id) FILTER (WHERE NOT COALESCE((${PRODUTO_DISPONIVEL_SQL}), false)) AS total_indisponiveis,
                COALESCE(SUM(p.current_price) FILTER (WHERE ${PRODUTO_DISPONIVEL_SQL}), 0) AS total_preco
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
            totalIndisponiveis: Number(row.total_indisponiveis),
            totalPreco: Number(row.total_preco)
        }));
    }

    static async buscarPorId(id, usuarioId) {
        const { rows } = await pool.query(
            'SELECT id, nome, criado_em, tipo_montagem FROM configuracoes WHERE id = $1 AND usuario_id = $2',
            [id, usuarioId]
        );
        return rows[0] || null;
    }

    static async listarItens(configuracaoId) {
        const { rows } = await pool.query(
            `SELECT ci.produto_id, ci.posicao, p.name AS nome
             FROM configuracao_itens ci
             LEFT JOIN products p ON p.id = ci.produto_id
             WHERE ci.configuracao_id = $1 ORDER BY ci.id`,
            [configuracaoId]
        );
        return rows.map(row => ({ id: row.produto_id, posicao: row.posicao, nome: row.nome }));
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
