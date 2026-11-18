const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

require('./config/observabilidade').instalarConsoleSeguro();
process.on('unhandledRejection',erro=>{require('./config/observabilidade').registrarErro('promessa_nao_tratada',erro);process.exit(1);});
process.on('uncaughtException',erro=>{require('./config/observabilidade').registrarErro('excecao_nao_tratada',erro);process.exit(1);});
const { criarApp } = require('./app');
const app = criarApp();
const pararEmails=require('./services/emailRecuperacao').iniciarEmails({ env: process.env, pool: require('./config/banco').pool });
const servidor=app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor rodando em http://localhost:' + (process.env.PORT || 3000));
});

process.on('SIGTERM',()=>{pararEmails();servidor.close(()=>{require('./config/banco').pool.end().finally(()=>process.exit(0));});setTimeout(()=>process.exit(1),10000).unref();});
