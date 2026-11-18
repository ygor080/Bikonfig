const express = require('express');
const session = require('express-session');
const path = require('path');
const { opcoesSessao } = require('./config/sessao');
const { parsersRequisicao, erroRequisicao } = require('./middleware/validacaoRequisicao');

function criarApp({ env = process.env, pool = require('./config/banco').pool, store, firebaseAuth } = {}) {
    const app = express();
    app.set('env', env.NODE_ENV || 'development');
    app.disable('x-powered-by');
    // Render encerra o HTTPS no proxy imediatamente à frente do servidor.
    if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
    const configFirebaseWeb = require('./config/firebase').lerConfigFirebase(env);
    app.use((req, res, next) => {
        res.locals.firebaseConexoes = configFirebaseWeb.webHabilitado === true;
        res.locals.firebaseAuthDomain = configFirebaseWeb.webHabilitado ? configFirebaseWeb.publica.authDomain : null;
        next();
    });
    app.use(require('./middleware/segurancaConteudo'));
    // Sem sessão: os probes do Render não devem criar ou consultar cookies.
    app.get('/healthz', require('./middleware/saude').criarVerificacaoSaude(pool));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.use(parsersRequisicao());
    app.use(express.static(path.join(__dirname, 'public')));

    const opcoes = opcoesSessao(env);
    const PgSession = require('connect-pg-simple')(session);
    opcoes.store = store || new PgSession({ pool, tableName: 'sessoes_site', createTableIfMissing: true });
    app.use(session(opcoes));
    app.use(require('./middleware/versaoSenha')({ env, pool }));
    app.locals.firebaseProjectId = configFirebaseWeb.habilitado ? configFirebaseWeb.projectId : null;
    const firebase = require('./middleware/autenticacaoFirebase').criarAutenticacaoFirebase({ env, auth: firebaseAuth });
    app.use(firebase.validarSessao);
    app.use(require('./middleware/csrf'));
    app.use((req, res, next) => {
        res.locals.firebaseDisponivel = firebase.webHabilitado;
        res.locals.sessaoFirebase = Boolean(req.session.firebaseAuth);
        next();
    });
    app.get('/auth/firebase/config', firebase.configurar);
    app.post('/auth/firebase/google', require('./middleware/limiteAutenticacao').criarLimiteAutenticacao(), firebase.entrarGoogle);
    app.use(require('./routes/recuperacaoSenhaRoutes').criarRotasRecuperacao({ env, pool }));
    app.use('/', require('./routes/authRoutes'));
    app.use('/catalogo', require('./routes/catalogoRoutes'));
    app.use('/admin', require('./routes/adminRoutes'));
    app.get('/', (req, res) => res.redirect(req.session.user ? '/home' : '/login'));
    app.get('/home', (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        res.render('home', { usuario: req.session.user, titulo: 'Home - Bikonfig' });
    });
    app.use(erroRequisicao);
    app.use((erro, req, res, next) => {
        if (res.headersSent) return next(erro);
        console.error('Falha ao processar requisição:', erro.code || erro.name || 'erro interno');
        res.status(500).send('Não foi possível concluir a solicitação. Tente novamente mais tarde.');
    });
    return app;
}

module.exports = { criarApp };
