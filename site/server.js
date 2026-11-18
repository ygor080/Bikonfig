const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { criarApp } = require('./app');
const app = criarApp();
require('./services/emailRecuperacao').iniciarEmails({ env: process.env, pool: require('./config/banco').pool });
app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor rodando em http://localhost:' + (process.env.PORT || 3000));
});
