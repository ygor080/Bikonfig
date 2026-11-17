const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const authRoutes = require('./routes/authRoutes');
const catalogoRoutes = require('./routes/catalogoRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.disable('x-powered-by');
// Render encerra o HTTPS no proxy imediatamente à frente do servidor.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(require('./middleware/segurancaConteudo'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const { parsersRequisicao, erroRequisicao } = require('./middleware/validacaoRequisicao');
app.use(parsersRequisicao());
app.use(express.static('public'));

const { opcoesSessao } = require('./config/sessao');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('./config/banco');
const opcoes = opcoesSessao(process.env);
opcoes.store = new PgSession({ pool, tableName: 'sessoes_site', createTableIfMissing: true });
app.use(session(opcoes));

app.use('/', authRoutes);
app.use('/catalogo', catalogoRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/home');
    } else {
        res.redirect('/login');
    }
});

app.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('home', {
        usuario: req.session.user,
        titulo: 'Home - Bikonfig'
    });
});

app.use(erroRequisicao);
app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    console.error('Falha ao processar requisição:', erro.code || erro.name || 'erro interno');
    res.status(500).send('Não foi possível concluir a solicitação. Tente novamente mais tarde.');
});

async function iniciar() {
    app.listen(process.env.PORT || 3000, () => {
        console.log('Servidor rodando em http://localhost:' + (process.env.PORT || 3000));
    });
}

iniciar();
