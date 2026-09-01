const { pool } = require('../config/banco');
const bcrypt = require('bcryptjs');

class UsuarioModel {
    static async buscarPorNome(nome) {
        const { rows } = await pool.query('SELECT * FROM usuarios WHERE nome = $1 LIMIT 1', [nome]);
        return rows[0] || null;
    }

    static async buscarPorEmail(email) {
        const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1 LIMIT 1', [email]);
        return rows[0] || null;
    }

    static async buscarPorId(id) {
        const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 LIMIT 1', [id]);
        return rows[0] || null;
    }

    static async listarTodos() {
        const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY criado_em DESC');
        return rows;
    }

    static async cadastrar({ nome, email, senha }) {
        const usuarioExistente = await this.buscarPorNome(nome);
        if (usuarioExistente) return { erro: 'Esse nome de usuário já está em uso.' };
        const emailExistente = await this.buscarPorEmail(email);
        if (emailExistente) return { erro: 'Esse e-mail já está cadastrado.' };

        const senhaHash = await bcrypt.hash(senha, 10);
        const { rows } = await pool.query(
            'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email',
            [nome, email, senhaHash]
        );
        return { usuario: { ...rows[0], isAdmin: false } };
    }

    static async validarLogin(nome, senha) {
        const user = await this.buscarPorNome(nome);
        if (!user || !(await bcrypt.compare(senha, user.senha))) return null;
        await pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]);
        return { id: user.id, nome: user.nome, email: user.email, isAdmin: user.is_admin === true };
    }
}

module.exports = UsuarioModel;
