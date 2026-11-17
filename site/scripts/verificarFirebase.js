const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { lerConfigFirebase } = require('../config/firebase');
const { verificarCredencial, verificarVinculos } = require('../config/verificacaoFirebase');

async function executar() {
    let pool;
    try {
        const config = lerConfigFirebase();
        if (!config.habilitado) {
            console.log(JSON.stringify({ status: 'desabilitado', mensagem: 'Preparação Firebase inativa. O login atual continua funcionando.' }, null, 2));
            return;
        }
        const pendencias = verificarCredencial(config, process.env);
        let banco;
        if (process.env.DATABASE_URL) {
            pool = require('../config/banco').pool;
            banco = await verificarVinculos(pool, config.projectId);
            pendencias.push(...banco.pendencias);
        } else pendencias.push('Configure DATABASE_URL para conferir a migração de vínculos.');
        console.log(JSON.stringify({ status: pendencias.length ? 'pendente' : 'preparacao_local_ok',
            projeto: config.projectId, dominiosDeclarados: config.dominios, pendencias, resumo: banco?.resumo,
            migracao: banco?.migracao, acessoAnteriorHabilitado: config.legadoHabilitado,
            observacao: 'Não comprova domínios no console ou permissões remotas; não importa usuários nem ativa o login Firebase.' }, null, 2));
        process.exitCode = pendencias.length ? 1 : 0;
    } catch {
        console.error('Preparação Firebase inválida. Confira as variáveis e a migração no guia, sem divulgar segredos.');
        process.exitCode = 1;
    } finally { if (pool) await pool.end(); }
}
executar();
