const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { cifrar, hashToken } = require('../config/recuperacaoSenha');
function criarRecuperacaoModel(pool, config) {
    return {
        async solicitar(email) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const { rows } = await client.query(`SELECT u.id, u.email FROM usuarios u WHERE lower(btrim(u.email)) = $1
                    AND NOT EXISTS (SELECT 1 FROM usuarios_identidades i WHERE i.usuario_id = u.id) FOR UPDATE`, [email]);
                if (rows.length !== 1) { await client.query('ROLLBACK'); return; }
                const usuario = rows[0];
                const recente = await client.query("SELECT 1 FROM recuperacoes_senha WHERE usuario_id=$1 AND criado_em > now()-interval '60 seconds' LIMIT 1", [usuario.id]);
                if (recente.rows.length) { await client.query('ROLLBACK'); return; }
                const token = randomBytes(32).toString('hex');
                const payload = cifrar({ email: usuario.email, link: config.base + '/redefinir-senha#' + token }, config.key);
                await client.query('UPDATE recuperacoes_senha SET usado_em=now(), email_payload=NULL WHERE usuario_id=$1 AND usado_em IS NULL', [usuario.id]);
                await client.query("INSERT INTO recuperacoes_senha(token_hash,usuario_id,expira_em,email_payload) VALUES($1,$2,now()+interval '30 minutes',$3)", [hashToken(token), usuario.id, payload]);
                await client.query("DELETE FROM recuperacoes_senha WHERE expira_em < now()-interval '1 day'");
                await client.query('COMMIT');
            } catch (e) { await client.query('ROLLBACK'); throw e; }
            finally { client.release(); }
        },
        async redefinir(token, senha) {
            if (!/^[a-f0-9]{64}$/.test(token || '')) return false;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // Bloqueia primeiro o usuário para serializar reenvios e consumo de links.
                const { rows: usuarios } = await client.query(`SELECT u.id FROM usuarios u JOIN recuperacoes_senha r ON r.usuario_id=u.id
                    WHERE r.token_hash=$1 AND NOT EXISTS(SELECT 1 FROM usuarios_identidades i WHERE i.usuario_id=u.id) FOR UPDATE OF u`, [hashToken(token)]);
                if (!usuarios.length) { await client.query('ROLLBACK'); return false; }
                const { rows } = await client.query('SELECT usuario_id FROM recuperacoes_senha WHERE token_hash=$1 AND usado_em IS NULL AND expira_em>now() FOR UPDATE', [hashToken(token)]);
                if (!rows.length) { await client.query('ROLLBACK'); return false; }
                const hash = await bcrypt.hash(senha, 10);
                await client.query('UPDATE usuarios SET senha=$1, senha_versao=senha_versao+1 WHERE id=$2', [hash, rows[0].usuario_id]);
                await client.query('UPDATE recuperacoes_senha SET usado_em=now(),email_payload=NULL WHERE usuario_id=$1 AND usado_em IS NULL', [rows[0].usuario_id]);
                await client.query('COMMIT'); return true;
            } catch (e) { await client.query('ROLLBACK'); throw e; }
            finally { client.release(); }
        }
    };
}
module.exports = { criarRecuperacaoModel };
