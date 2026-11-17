const { lerConfigFirebase, obterFirebaseAuth } = require('../config/firebase');
const { autenticarSessao, NOME_COOKIE, NOME_COOKIE_FIREBASE } = require('../config/sessao');
const INVALIDOS = new Set(['auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
    'auth/id-token-expired', 'auth/id-token-revoked', 'auth/session-cookie-expired', 'auth/session-cookie-revoked',
    'auth/invalid-session-cookie', 'auth/user-disabled', 'auth/user-not-found']);
const DURACAO = 3600000;

async function comPrazo(operacao) {
    let timer;
    try {
        return await Promise.race([Promise.resolve().then(operacao), new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), 10000);
        })]);
    } finally { clearTimeout(timer); }
}
function erroInvalido() { return Object.assign(new Error('invalid'), { code: 'auth/invalid-id-token' }); }
function lerCookieFirebase(req) {
    const valores = (req.headers.cookie || '').split(';').map(parte => parte.trim())
        .filter(parte => parte.startsWith(NOME_COOKIE_FIREBASE + '='));
    if (valores.length !== 1) throw erroInvalido();
    try { return decodeURIComponent(valores[0].slice(NOME_COOKIE_FIREBASE.length + 1)); }
    catch { throw erroInvalido(); }
}
function validarClaims(claims, projeto, sessao = false) {
    const emissor = sessao ? 'https://session.firebase.google.com/' : 'https://securetoken.google.com/';
    if (!claims || typeof claims.uid !== 'string' || !claims.uid.length || claims.uid.length > 128
        || claims.sub !== claims.uid || claims.aud !== projeto || claims.iss !== emissor + projeto) throw erroInvalido();
}

function criarAutenticacaoFirebase({ env = process.env, auth, identidades } = {}) {
    const config = lerConfigFirebase(env);
    const opcoesCookie = { path: '/', httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' };
    const obterAuth = () => auth || obterFirebaseAuth(env);
    const obterIdentidades = () => identidades || require('../models/identidadeFirebaseModel');
    const indisponivel = res => res.status(503).json({ erro: 'Autenticação Firebase indisponível. Tente novamente mais tarde.', codigo: 'FIREBASE_INDISPONIVEL' });

    async function invalidar(req, res) {
        await new Promise((resolve, reject) => req.session.destroy(erro => erro ? reject(erro) : resolve()));
        res.clearCookie(NOME_COOKIE, opcoesCookie);
        res.clearCookie(NOME_COOKIE_FIREBASE, opcoesCookie);
        res.setHeader('Cache-Control', 'no-store');
        if (req.path.startsWith('/catalogo/api/') || req.path.startsWith('/auth/') || !['GET', 'HEAD'].includes(req.method)) {
            return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.', codigo: 'SESSAO_EXPIRADA' });
        }
        return res.redirect('/login');
    }

    async function autenticar(req, res, cadastro = false) {
        if (!config.habilitado) return res.status(503).json({ erro: 'Integração Firebase ainda desabilitada.', codigo: 'FIREBASE_DESABILITADO' });
        if (cadastro && !config.webHabilitado) return res.status(503).json({ erro: 'Cadastro Firebase ainda desabilitado.' });
        if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(chave => !(cadastro ? ['idToken', 'nome'] : ['idToken']).includes(chave))
            || typeof req.body.idToken !== 'string' || !req.body.idToken.length || req.body.idToken.length > 16384) {
            return res.status(400).json({ erro: 'Informe apenas um ID token Firebase válido.' });
        }
        const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
        if (cadastro && (nome.length < 3 || nome.length > 40)) return res.status(400).json({ erro: 'Informe um usuário entre 3 e 40 caracteres.' });
        let claims, sessionCookie;
        try {
            const sdk = obterAuth();
            claims = await comPrazo(() => sdk.verifyIdToken(req.body.idToken, true));
            validarClaims(claims, config.projectId);
            const idade = Date.now() / 1000 - claims.auth_time;
            if (!Number.isInteger(claims.auth_time) || idade < 0 || idade > 300) {
                return res.status(401).json({ erro: 'Entre novamente no Firebase antes de iniciar a sessão.', codigo: 'LOGIN_RECENTE_NECESSARIO' });
            }
            sessionCookie = await comPrazo(() => sdk.createSessionCookie(req.body.idToken, { expiresIn: DURACAO }));
            if (typeof sessionCookie !== 'string' || !sessionCookie.length) throw new Error('invalid_session');
        } catch (erro) {
            if (INVALIDOS.has(erro.code)) return res.status(401).json({ erro: 'Não foi possível validar sua identidade.', codigo: 'FIREBASE_TOKEN_INVALIDO' });
            return indisponivel(res);
        }
        let usuario;
        try {
            if (cadastro) {
                if (claims.firebase?.sign_in_provider !== 'password' || typeof claims.email !== 'string'
                    || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(claims.email.trim())) {
                    return res.status(401).json({ erro: 'Use uma identidade Firebase de e-mail e senha para concluir este cadastro.' });
                }
                usuario = await obterIdentidades().cadastrar(config.projectId, claims.uid, nome, claims.email.trim().toLowerCase());
            } else usuario = await obterIdentidades().buscar(config.projectId, claims.uid);
        } catch (erro) {
            if (erro.code === 'CADASTRO_CONFLITO') return res.status(409).json({ erro: 'Não foi possível concluir com esses dados. Se você já tinha uma conta, use o acesso anterior até a migração.', codigo: 'CADASTRO_CONFLITO' });
            return indisponivel(res);
        }
        if (!usuario) return res.status(409).json({ erro: 'Esta identidade ainda não está vinculada a uma conta do Bikonfig.', codigo: 'CONTA_NAO_VINCULADA' });
        // O navegador recebe o JWT de sessão apenas em cookie HttpOnly.
        // O store guarda somente a identidade vinculada, sem tokens Firebase.
        await autenticarSessao(req, usuario, { projectId: config.projectId, uid: claims.uid });
        res.cookie(NOME_COOKIE_FIREBASE, sessionCookie, { ...opcoesCookie, maxAge: DURACAO });
        res.json({ redirecionar: '/home' });
    }
    return {
        webHabilitado: config.habilitado && config.webHabilitado,
        entrar: (req, res) => autenticar(req, res),
        cadastrar: (req, res) => autenticar(req, res, true),
        configurar(req, res) {
            if (!config.habilitado || !config.webHabilitado) return res.status(404).json({ erro: 'Configuração web indisponível.' });
            res.json(config.publica);
        },
        async validarSessao(req, res, next) {
            const sessao = req.session.firebaseAuth;
            if (!sessao || req.path === '/logout' && req.method === 'POST'
                || ['/auth/firebase/session', '/auth/firebase/register'].includes(req.path)) return next();
            if (!config.habilitado || sessao.projectId !== config.projectId) return invalidar(req, res);
            let claims;
            try {
                const cookie = lerCookieFirebase(req);
                claims = await comPrazo(() => obterAuth().verifySessionCookie(cookie, true));
                validarClaims(claims, config.projectId, true);
                if (claims.uid !== sessao.uid) throw erroInvalido();
            } catch (erro) {
                if (INVALIDOS.has(erro.code)) return invalidar(req, res);
                return indisponivel(res);
            }
            let usuario;
            try { usuario = await obterIdentidades().buscar(config.projectId, claims.uid); }
            catch { return indisponivel(res); }
            if (!usuario || usuario.id !== req.session.user?.id) return invalidar(req, res);
            // Nome, proprietário e administração vêm do banco, nunca dos claims do cliente.
            req.session.user = { id: usuario.id, nome: usuario.nome, email: usuario.email, isAdmin: usuario.isAdmin === true };
            next();
        }
    };
}
module.exports = { criarAutenticacaoFirebase };
