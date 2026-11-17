const { pool } = require('../config/banco');

function validar(projectId, uid) {
    if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
        || typeof uid !== 'string' || !uid.length || uid.length > 128) throw new Error('Identidade Firebase inválida.');
}

class IdentidadeFirebaseModel {
    static async buscar(projectId, uid) {
        validar(projectId, uid);
        const { rows } = await pool.query(`SELECT u.id, u.nome, u.email, u.is_admin AS "isAdmin"
            FROM usuarios_identidades i JOIN usuarios u ON u.id = i.usuario_id
            WHERE i.firebase_project_id = $1 AND i.firebase_uid = $2`, [projectId, uid]);
        return rows[0] || null;
    }

    // Chamada interna futura: somente após comprovar posse das duas identidades.
    // Não existe rota HTTP para vincular contas nesta etapa.
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
