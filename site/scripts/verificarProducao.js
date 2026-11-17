const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { verificarAmbiente, verificarBanco } = require('../config/verificacaoProducao');

async function executar() {
    const local = process.argv.includes('--local');
    const pendencias = verificarAmbiente(process.env, local);
    let pool;
    let banco;
    try {
        if (!pendencias.some(item => item.startsWith('DATABASE_URL'))) {
            pool = require('../config/banco').pool;
            banco = await verificarBanco(pool);
            pendencias.push(...banco.pendencias);
        }
    } catch {
        pendencias.push('Falha na consulta ao banco. Confira conexão, permissões e estrutura; nenhum segredo foi exibido.');
    } finally { if (pool) await pool.end(); }
    console.log(JSON.stringify({ escopo: local ? 'ambiente local; não comprova configuração do Render' : 'ambiente de execução',
        status: pendencias.length ? 'pendente' : 'ok', pendencias, sessoes: banco?.sessoes }, null, 2));
    process.exitCode = pendencias.length ? 1 : 0;
}
executar().catch(() => { console.error('Não foi possível concluir a verificação.'); process.exitCode = 1; });
