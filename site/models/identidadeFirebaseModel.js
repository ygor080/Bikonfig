const { pool } = require('../config/banco');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');

function validar(projectId, uid) {
    if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
        || typeof uid !== 'string' || !uid.length || uid.length > 128) throw new Error('Identidade Firebase inválida.');
}

class IdentidadeFirebaseModel {
    static async temVinculo(usuarioId, projectId) {
        const { rows } = await pool.query('SELECT 1 FROM usuarios_identidades WHERE usuario_id = $1 AND firebase_project_id = $2 LIMIT 1', [usuarioId, projectId]);
        return rows.length > 0;
    }

    static async migrar(projectId, uid, nome, senha, email) {
        validar(projectId, uid);
        const client = await pool.connect();
        const conflito = () => Object.assign(new Error('Não foi possível migrar a conta.'), { code: 'MIGRACAO_RECUSADA' });
        try {
            await client.query('BEGIN');
            const { rows: [usuario] } = await client.query('SELECT id, nome, email, senha, is_admin AS "isAdmin" FROM usuarios WHERE nome = $1 FOR UPDATE', [nome]);
            if (!usuario || !await bcrypt.compare(senha, usuario.senha)
                || usuario.email.trim().toLowerCase() !== email) throw conflito();
            // Não move vínculos existentes nem associa apenas pela coincidência de e-mail.
            await client.query(`INSERT INTO usuarios_identidades (usuario_id, firebase_project_id, firebase_uid)
                VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [usuario.id, projectId, uid]);
            const { rows } = await client.query(`SELECT usuario_id FROM usuarios_identidades
                WHERE usuario_id = $1 AND firebase_project_id = $2 AND firebase_uid = $3`, [usuario.id, projectId, uid]);
            if (rows.length !== 1) throw conflito();
            await client.query('COMMIT');
            const { senha: descartada, ...publico } = usuario;
            return publico;
        } catch (erro) { await client.query('ROLLBACK'); throw erro; }
        finally { client.release(); }
    }

    static async cadastrar(projectId, uid, nome, email) {
        validar(projectId, uid);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: vinculos } = await client.query(`SELECT u.id, u.nome, u.email, u.is_admin AS "isAdmin"
                FROM usuarios_identidades i JOIN usuarios u ON u.id = i.usuario_id
                WHERE i.firebase_project_id = $1 AND i.firebase_uid = $2`, [projectId, uid]);
            if (vinculos.length) { await client.query('COMMIT'); return vinculos[0]; }
            const { rows: conflito } = await client.query('SELECT id FROM usuarios WHERE lower(btrim(email)) = $1 OR nome = $2 LIMIT 1', [email, nome]);
            if (conflito.length) throw Object.assign(new Error('conflito'), { code: 'CADASTRO_CONFLITO' });
            // Mantém compatibilidade com senha NOT NULL sem guardar a senha Firebase.
            // O segredo aleatório de 256 bits é descartado; esta conta entra pelo Firebase.
            const placeholder = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
            const { rows: [usuario] } = await client.query('INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email', [nome, email, placeholder]);
            await client.query('INSERT INTO usuarios_identidades (usuario_id, firebase_project_id, firebase_uid) VALUES ($1, $2, $3)', [usuario.id, projectId, uid]);
            await client.query('COMMIT'); return { ...usuario, isAdmin: false };
        } catch (erro) {
            await client.query('ROLLBACK');
            if (erro.code === '23505') {
                // Reutiliza a conexão após rollback, inclusive em pools de tamanho 1.
                const { rows } = await client.query(`SELECT u.id, u.nome, u.email, u.is_admin AS "isAdmin"
                    FROM usuarios_identidades i JOIN usuarios u ON u.id = i.usuario_id
                    WHERE i.firebase_project_id = $1 AND i.firebase_uid = $2`, [projectId, uid]);
                const existente = rows[0];
                if (existente) return existente;
                throw Object.assign(new Error('conflito'), { code: 'CADASTRO_CONFLITO' });
            }
            throw erro;
        } finally { client.release(); }
    }

    static async buscar(projectId, uid) {
        validar(projectId, uid);
        const { rows } = await pool.query(`SELECT u.id, u.nome, u.email, u.is_admin AS "isAdmin"
            FROM usuarios_identidades i JOIN usuarios u ON u.id = i.usuario_id
            WHERE i.firebase_project_id = $1 AND i.firebase_uid = $2`, [projectId, uid]);
        return rows[0] || null;
    }

    // Utilitário interno. A rota pública usa migrar(), com prova das duas credenciais.
    static async vincular(usuarioId, projectId, uid) {
        validar(projectId, uid);
        await pool.query(`INSERT INTO usuarios_identidades (usuario_id, firebase_project_id, firebase_uid)
            VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [usuarioId, projectId, uid]);
        const { rows } = await pool.query(`SELECT usuario_id FROM usuarios_identidades
            WHERE usuario_id = $1 AND firebase_project_id = $2 AND firebase_uid = $3`, [usuarioId, projectId, uid]);
        return rows.length === 1;
    }
}
module.exports = IdentidadeFirebaseModel;
