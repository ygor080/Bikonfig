const fs = require('node:fs');
const { createPrivateKey } = require('node:crypto');

function verificarCredencial(config, env, ler = arquivo => fs.readFileSync(arquivo, 'utf8')) {
    if (!env.GOOGLE_APPLICATION_CREDENTIALS) return ['Configure GOOGLE_APPLICATION_CREDENTIALS no servidor.'];
    try {
        const raw = ler(env.GOOGLE_APPLICATION_CREDENTIALS);
        if (raw.length > 65536) throw new Error();
        const credencial = JSON.parse(raw);
        if (credencial.type !== 'service_account' || credencial.project_id !== config.projectId
            || typeof credencial.client_email !== 'string' || !credencial.client_email.endsWith('.iam.gserviceaccount.com')
            || createPrivateKey(credencial.private_key).asymmetricKeyType !== 'rsa') throw new Error();
        return [];
    } catch { return ['Credencial ausente, inválida ou de outro projeto. Confira o Secret File sem publicar seu conteúdo.']; }
}

async function verificarVinculos(pool) {
    const { rows: [tabela] } = await pool.query("SELECT to_regclass('usuarios_identidades') IS NOT NULL AS existe");
    if (!tabela.existe) return { pendencias: ['Aplique database/migrations/031_vinculos_firebase.sql antes de usar os vínculos.'] };
    const { rows: [acesso] } = await pool.query(`SELECT row_security_active('usuarios_identidades'::regclass) AS rls_ativo,
        has_table_privilege('usuarios_identidades', 'SELECT') AND has_table_privilege('usuarios_identidades', 'INSERT') AS permitido`);
    if (acesso.rls_ativo || !acesso.permitido) return { pendencias: ['Use uma conexão confiável do backend com acesso aos vínculos. A tabela não deve ser liberada ao cliente anônimo.'] };
    await pool.query('SELECT usuario_id, firebase_project_id, firebase_uid, criado_em FROM usuarios_identidades LIMIT 0');
    const { rows: [resumo] } = await pool.query(`SELECT COUNT(*) AS usuarios,
        COUNT(*) FILTER (WHERE senha ~ $1) AS com_bcrypt,
        (SELECT COUNT(*) FROM usuarios_identidades) AS vinculos,
        (SELECT COUNT(*) FROM (SELECT lower(btrim(email)) FROM usuarios GROUP BY lower(btrim(email)) HAVING COUNT(*) > 1) d) AS grupos_email_repetido
        FROM usuarios`, ['^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$']);
    return { pendencias: [], resumo };
}
module.exports = { verificarCredencial, verificarVinculos };
