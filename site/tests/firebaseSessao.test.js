const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sessao = require('../config/sessao');
const { criarAutenticacaoFirebase } = require('../middleware/autenticacaoFirebase');
const projeto = 'bikonfig-test';
const claims = sessao => ({ uid: 'firebase-uid', sub: 'firebase-uid', aud: projeto,
    iss: (sessao ? 'https://session.firebase.google.com/' : 'https://securetoken.google.com/') + projeto,
    auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'google.com' }, email_verified: true, admin: true, email: 'nao-usar@cliente.invalid' });

async function iniciar(t, habilitado = true, web = true) {
    const env = { SECRET: 'segredo-apenas-para-testes-firebase-123456', FIREBASE_ENABLED: String(habilitado),
        FIREBASE_PROJECT_ID: projeto, FIREBASE_WEB_API_KEY: 'AIza-chave-publica-de-testes-123456789',
        FIREBASE_AUTH_DOMAIN: projeto + '.firebaseapp.com', FIREBASE_WEB_APP_ID: '1:123456:web:abcdef',
        FIREBASE_AUTHORIZED_DOMAINS_JSON: '["localhost"]', FIREBASE_WEB_ENABLED: String(web) };
    const estado = { usuario: { id: 'id-do-banco', nome: 'Nome do banco', email: 'email@banco.invalid', isAdmin: false },
        idClaims: claims(false), cookieClaims: claims(true), chamadas: [] };
    const sdk = {
        verifyIdToken: async (token, revogado) => { estado.chamadas.push(['id', token, revogado]);
            if (estado.erroId) throw estado.erroId; return estado.idClaims; },
        createSessionCookie: async (token, opcoes) => { estado.chamadas.push(['criar', token, opcoes]); return 'jwt-sessao-nao-expor'; },
        verifySessionCookie: async (cookie, revogado) => { estado.chamadas.push(['sessao', cookie, revogado]);
            assert.equal(cookie, 'jwt-sessao-nao-expor'); assert.equal(revogado, true);
            if (estado.erroCookie) throw estado.erroCookie; return estado.cookieClaims; }
    };
    const store = new session.MemoryStore();
    const app = express(); app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, '../views'));
    app.use(express.json()); app.use(session(sessao.opcoesSessao(env, store)));
    const firebase = criarAutenticacaoFirebase({ env, auth: sdk, identidades: { buscar: async (p, uid) => {
        assert.equal(p, projeto); assert.equal(uid, 'firebase-uid'); return estado.usuario;
    }, cadastrar: async (...args) => {
        estado.cadastro = args;
        if (estado.erroCadastro) throw estado.erroCadastro;
        return estado.novoUsuario || estado.usuario;
    }, temVinculo: async () => estado.legadoVinculado === true,
    } });
    app.use(firebase.validarSessao); app.use(require('../middleware/csrf'));
    app.get('/login', (req, res) => res.json({ csrf: res.locals.csrfToken }));
    app.post('/auth/firebase/google', firebase.entrarGoogle);
    app.get('/auth/firebase/config', firebase.configurar);
    app.post('/legado', async (req, res) => { await sessao.autenticarSessao(req, estado.usuario); res.json({ ok: true }); });
    const contexto = { module: { exports: {} }, Buffer, require: nome => nome.includes('usuarioModel') ? {} : sessao };
    vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/authController'), 'utf8'), contexto);
    app.post('/logout', contexto.module.exports.logout);
    const auth = require('../middleware/auth');
    app.get('/catalogo/api/privado', auth.verificarLogin, (req, res) => res.json(req.session.user));
    app.get('/admin/restrito', auth.verificarAdmin, (req, res) => res.json({ ok: true }));
    app.use((erro, req, res, next) => res.status(500).json({ erro: 'Erro interno.' }));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const cookies = new Map(); let token;
    function cookie() { return [...cookies].map(([nome, valor]) => nome + '=' + valor).join('; '); }
    async function pedir(caminho, body, overrides = {}) {
        const res = await fetch(base + caminho, { redirect: 'manual', method: body ? 'POST' : 'GET',
            headers: { cookie: cookie(), ...(body ? { 'content-type': 'application/json', 'x-csrf-token': token || '' } : {}), ...overrides },
            body: body ? JSON.stringify(body) : undefined });
        for (const campo of res.headers.getSetCookie()) {
            const par = campo.split(';')[0], i = par.indexOf('='); const nome = par.slice(0, i), valor = par.slice(i + 1);
            if (valor) cookies.set(nome, valor); else cookies.delete(nome);
        }
        return res;
    }
    async function pagina() { const res = await pedir('/login'); assert.equal(res.status, 200); token = (await res.json()).csrf; }
    async function entrar() { await pagina(); return pedir('/auth/firebase/google', { idToken: 'id-token-nao-guardar' }); }
    return { estado, store, base, cookies, cookie, pedir, pagina, entrar };
}

test('Firebase cria sessão vinculada, renova SID e não guarda tokens no store ou no JSON', async t => {
    const r = await iniciar(t); await r.pagina(); const anterior = r.cookie();
    const resposta = await r.pedir('/auth/firebase/google', { idToken: 'id-token-nao-guardar' });
    assert.equal(resposta.status, 200); assert.deepEqual(await resposta.json(), { redirecionar: '/home' });
    const fb = resposta.headers.getSetCookie().find(c => c.startsWith('bikonfig.firebase='));
    assert.match(fb, /HttpOnly/); assert.match(fb, /SameSite=Lax/);
    assert.ok(r.estado.chamadas.some(c => c[0] === 'id' && c[2] === true));
    assert.equal(r.estado.chamadas.find(c => c[0] === 'criar')[2].expiresIn, 3600000);
    const privado = await r.pedir('/catalogo/api/privado'); assert.equal(privado.status, 200);
    assert.deepEqual(await privado.json(), r.estado.usuario);
    const todas = await new Promise((resolve, reject) => r.store.all((erro, dados) => erro ? reject(erro) : resolve(dados)));
    assert.ok(!JSON.stringify(todas).includes('id-token-nao-guardar'));
    assert.ok(!JSON.stringify(todas).includes('jwt-sessao-nao-expor'));
    const antiga = await fetch(r.base + '/catalogo/api/privado', { redirect: 'manual', headers: { cookie: anterior } });
    assert.equal(antiga.status, 302);
});

test('Firebase rejeita CSRF ausente, corpo extra e identidade não vinculada', async t => {
    const r = await iniciar(t); await r.pagina();
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' }, { 'x-csrf-token': '' })).status, 403);
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token', isAdmin: true })).status, 400);
    assert.equal(r.estado.chamadas.length, 0);
    r.estado.usuario = null;
    const res = await r.entrar(); assert.equal(res.status, 409); assert.equal((await res.json()).codigo, 'CONTA_NAO_VINCULADA');
    assert.equal(r.cookies.has('bikonfig.firebase'), false);
});

test('Firebase exige token válido do projeto e login recente, recusando autenticação futura', async t => {
    const r = await iniciar(t); await r.pagina();
    r.estado.erroId = { code: 'auth/id-token-revoked' };
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' })).status, 401);
    r.estado.erroId = null;
    for (const alteracao of [{ aud: 'outro-projeto' }, { iss: 'https://falso.invalid' },
        { auth_time: Math.floor(Date.now() / 1000) - 600 }, { auth_time: Math.floor(Date.now() / 1000) + 30 }]) {
        r.estado.idClaims = { ...claims(false), ...alteracao };
        assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' })).status, 401);
    }
    assert.equal(r.cookies.has('bikonfig.firebase'), false);
});

test('revogação ou ausência de cookie Firebase invalida sessão e impede acesso protegido', async t => {
    for (const modo of ['revogada', 'sem-cookie']) {
        const r = await iniciar(t); assert.equal((await r.entrar()).status, 200);
        if (modo === 'revogada') r.estado.erroCookie = { code: 'auth/session-cookie-revoked' };
        else r.cookies.delete('bikonfig.firebase');
        const res = await r.pedir('/catalogo/api/privado'); assert.equal(res.status, 401);
        assert.equal((await res.json()).codigo, 'SESSAO_EXPIRADA');
        assert.equal(r.cookies.has('bikonfig.firebase'), false); assert.equal(r.cookies.has('bikonfig.sid'), false);
    }
});

test('permissões vêm do banco; indisponibilidade temporária não apaga sessão e logout limpa cookies', async t => {
    const r = await iniciar(t); assert.equal((await r.entrar()).status, 200);
    assert.equal((await r.pedir('/admin/restrito')).status, 403); // claim admin=true é ignorado.
    r.estado.usuario.isAdmin = true; r.estado.cookieClaims.admin = false;
    assert.equal((await r.pedir('/admin/restrito')).status, 200);
    await r.pagina(); const anterior = r.cookie();
    r.estado.erroCookie = { code: 'app/network-error', message: 'SEGREDO' };
    const falha = await r.pedir('/catalogo/api/privado'); assert.equal(falha.status, 503);
    assert.ok(!(await falha.text()).includes('SEGREDO')); assert.equal(r.cookie(), anterior);
    r.estado.erroCookie = null; assert.equal((await r.pedir('/catalogo/api/privado')).status, 200);
    r.estado.erroCookie = { code: 'app/network-error' };
    const saiu = await r.pedir('/logout', {}); assert.equal(saiu.status, 302);
    assert.equal(r.cookies.size, 0);
    const copia = await fetch(r.base + '/catalogo/api/privado', { redirect: 'manual', headers: { cookie: anterior } });
    assert.equal(copia.status, 302);
});

test('Firebase desabilitado não chama SDK e mantém autenticação legada', async t => {
    const r = await iniciar(t, false); assert.equal((await r.entrar()).status, 503);
    assert.equal(r.estado.chamadas.length, 0);
    assert.equal((await r.pedir('/legado', {})).status, 200);
    assert.equal((await r.pedir('/catalogo/api/privado')).status, 200);
});


test('Google exige CSRF, provedor Google e e-mail verificado, rejeitando dados de identidade enviados pelo navegador', async t => {
    const r = await iniciar(t, true, true); await r.pagina();
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' }, { 'x-csrf-token': '' })).status, 403);
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token', isAdmin: true })).status, 400);
    for (const [provider, verificado] of [['password', true], ['google.com', false], ['google.com', undefined]]) {
        r.estado.idClaims.firebase = { sign_in_provider: provider }; r.estado.idClaims.email_verified = verificado;
        assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' })).status, 401);
    }
    assert.equal(r.estado.cadastro, undefined); assert.ok(!r.cookies.has('bikonfig.firebase'));
});

test('primeiro acesso Google cria conta com dados validados; acesso vinculado preserva usuário e permissões do banco', async t => {
    const r = await iniciar(t, true, true); await r.pagina();
    const usuario = r.estado.usuario; r.estado.usuario = null; r.estado.novoUsuario = usuario;
    Object.assign(r.estado.idClaims, { firebase: { sign_in_provider: 'google.com' }, email_verified: true,
        email: 'Google@EXEMPLO.com', name: 'Pessoa Google' });
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' })).status, 200);
    assert.equal(r.estado.cadastro[0], projeto); assert.equal(r.estado.cadastro[1], 'firebase-uid');
    assert.match(r.estado.cadastro[2], /^Pessoa Google-[a-f0-9]{16}$/); assert.equal(r.estado.cadastro[3], 'google@exemplo.com');
    r.estado.usuario = usuario; r.estado.cadastro = undefined; await r.pagina();
    assert.equal((await r.pedir('/auth/firebase/google', { idToken: 'token' })).status, 200);
    assert.equal(r.estado.cadastro, undefined);
    assert.equal((await (await r.pedir('/catalogo/api/privado')).json()).isAdmin, false);
});

test('sessão legada é invalidada depois do vínculo, sem permitir contornar a senha Firebase', async t => {
    const r = await iniciar(t); await r.pagina();
    assert.equal((await r.pedir('/legado', {})).status, 200);
    assert.equal((await r.pedir('/catalogo/api/privado')).status, 200);
    r.estado.legadoVinculado = true;
    const invalida = await r.pedir('/catalogo/api/privado');
    assert.equal(invalida.status, 401); assert.equal((await invalida.json()).codigo, 'SESSAO_EXPIRADA');
    assert.ok(!r.cookies.has('bikonfig.sid'));
});
