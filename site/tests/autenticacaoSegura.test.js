const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { opcoesSessao, autenticarSessao, NOME_COOKIE, NOME_COOKIE_FIREBASE } = require('../config/sessao');
const { criarLimiteAutenticacao } = require('../middleware/limiteAutenticacao');
const secret = '0123456789abcdef0123456789abcdef0123456789abcdef';

test('controlador aguarda salvar a sessão no login e no cadastro e trata falha no logout', async () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const identidade = { id: 1, nome: 'Teste', email: 'teste@exemplo.com', isAdmin: false };
    const contexto = { module: { exports: {} }, Buffer, require: nome => {
        if (nome === '../config/sessao') return { autenticarSessao, NOME_COOKIE, NOME_COOKIE_FIREBASE };
        return { validarLogin: async () => identidade, cadastrar: async () => ({ usuario: identidade }) };
    } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/authController'), 'utf8'), contexto);
    const controller = contexto.module.exports;
    for (const acao of ['processarLogin', 'processarCadastro']) {
        const eventos = [];
        const req = { body: { usuario: 'Teste', nome: 'Teste', email: 'teste@exemplo.com', senha: 'Senha123!', confirmarSenha: 'Senha123!' } };
        req.session = { regenerate: cb => { eventos.push('regenerate'); cb(); }, save: cb => { eventos.push('save'); setImmediate(cb); } };
        const res = { redirect: destino => { eventos.push(destino); } };
        await controller[acao](req, res);
        assert.deepEqual(eventos, ['regenerate', 'save', '/home']);
        assert.equal(req.session.user.id, 1);
    }
    const falha = new Error('destroy');
    let recebida;
    controller.logout({ session: { destroy: cb => cb(falha) } }, {}, err => { recebida = err; });
    assert.equal(recebida, falha);
    let removido = false;
    let destino;
    controller.logout({ session: { destroy: cb => cb() }, app: { get: () => 'production' } }, {
        clearCookie: (nome, opcoes) => { assert.ok([NOME_COOKIE, 'bikonfig.firebase'].includes(nome)); assert.equal(opcoes.secure, true); removido = true; },
        redirect: url => { destino = url; }
    });
    assert.equal(removido, true);
    assert.equal(destino, '/login');
});

test('cookie Secure em produção depende de HTTPS pelo proxy confiável', async t => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(session(opcoesSessao({ SECRET: secret, NODE_ENV: 'production' }, new session.MemoryStore())));
    app.get('/', (req, res) => { req.session.teste = true; res.send('ok'); });
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(url)).headers.get('set-cookie'), null);
    const resposta = await fetch(url, { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(resposta.headers.get('set-cookie'), /; Secure/);
});

test('configuração exige segredo forte e protege cookies em produção e desenvolvimento', () => {
    for (const SECRET of [undefined, '', 'curta', 'troque-esta-chave-de-sessao-por-uma-string-longa-e-aleatoria']) {
        assert.throws(() => opcoesSessao({ SECRET }));
    }
    const prod = opcoesSessao({ SECRET: secret, NODE_ENV: 'production' });
    assert.equal(prod.cookie.secure, true);
    assert.equal(prod.cookie.httpOnly, true);
    assert.equal(prod.cookie.sameSite, 'lax');
    assert.equal(prod.cookie.maxAge, 3600000);
    assert.equal(prod.saveUninitialized, false);
    assert.equal(opcoesSessao({ SECRET: secret }).cookie.secure, false);
});

test('erros ao regenerar ou salvar sessão impedem autenticação bem-sucedida', async () => {
    await assert.rejects(autenticarSessao({ session: { regenerate: cb => cb(new Error('regenerate')) } }, {}), /regenerate/);
    const req = { session: { regenerate: cb => cb(), save: cb => cb(new Error('save')) } };
    await assert.rejects(autenticarSessao(req, { id: 1 }), /save/);
});

test('HTTP renova sessão no login, persiste somente identidade e invalida sessão antiga', async t => {
    const app = express();
    const store = new session.MemoryStore();
    app.use(session(opcoesSessao({ SECRET: secret }, store)));
    app.get('/anonima', (req, res) => { req.session.anterior = true; res.send('ok'); });
    app.post('/login', async (req, res) => {
        await autenticarSessao(req, { id: 1, nome: 'teste', email: 'a@b.com', isAdmin: false, senha: 'NUNCA SALVAR' });
        res.send('ok');
    });
    app.get('/identidade', (req, res) => res.json(req.session.user || null));
    app.post('/logout', (req, res, next) => req.session.destroy(err => {
        if (err) return next(err);
        res.clearCookie(NOME_COOKIE, { path: '/' }); res.send('ok');
    }));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const anonima = await fetch(base + '/anonima');
    const antiga = anonima.headers.get('set-cookie').split(';')[0];
    const login = await fetch(base + '/login', { method: 'POST', headers: { cookie: antiga } });
    const setCookie = login.headers.get('set-cookie');
    const nova = setCookie.split(';')[0];
    assert.notEqual(nova, antiga);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.equal(await (await fetch(base + '/identidade', { headers: { cookie: antiga } })).json(), null);
    assert.deepEqual(await (await fetch(base + '/identidade', { headers: { cookie: nova } })).json(), { id: 1, nome: 'teste', email: 'a@b.com', isAdmin: false });
    const sessoes = await new Promise((resolve, reject) => store.all((err, all) => err ? reject(err) : resolve(all)));
    assert.ok(!JSON.stringify(sessoes).includes('NUNCA SALVAR'));
    assert.ok(!JSON.stringify(sessoes).includes('anterior'));
    await fetch(base + '/logout', { method: 'POST', headers: { cookie: nova } });
    assert.equal(await (await fetch(base + '/identidade', { headers: { cookie: nova } })).json(), null);
});

test('limite retorna 429 e Retry-After sem confiar em IP fornecido pelo cliente', async t => {
    const app = express();
    app.post('/login', criarLimiteAutenticacao(2), (req, res) => res.send('ok'));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/login`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 200);
    assert.equal((await fetch(url, { method: 'POST' })).status, 200);
    const bloqueada = await fetch(url, { method: 'POST' });
    assert.equal(bloqueada.status, 429);
    assert.ok(Number(bloqueada.headers.get('retry-after')) > 0);
});

test('store PostgreSQL grava e recupera uma sessão por meio de consultas parametrizadas', async () => {
    const PgSession = require('connect-pg-simple')(session);
    const queries = [];
    const valor = { cookie: { expires: new Date(Date.now() + 3600000) }, user: { id: 1 } };
    const pool = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [{ sess: valor }] }; } };
    const store = new PgSession({ pool, tableName: 'sessoes_site', pruneSessionInterval: false });
    try {
        await new Promise((resolve, reject) => store.set('identificador', valor, err => err ? reject(err) : resolve()));
        const recebida = await new Promise((resolve, reject) => store.get('identificador', (err, sess) => err ? reject(err) : resolve(sess)));
        assert.deepEqual(recebida, valor);
        assert.equal(queries.length, 2);
        assert.ok(queries.every(q => q.sql.includes('sessoes_site') && q.params.includes('identificador')));
        assert.ok(queries.every(q => !q.sql.includes('identificador')));
    } finally { store.close(); }
});
