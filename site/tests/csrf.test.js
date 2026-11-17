const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const csrf = require('../middleware/csrf');

async function iniciar(t) {
    const app = express();
    app.use(express.json(), express.urlencoded({ extended: false }));
    app.use(session({ secret: 'segredo-apenas-para-teste-csrf-0123456789', resave: false, saveUninitialized: false }));
    app.use(csrf);
    let alteracoes = 0;
    app.get('/pagina', (req, res) => res.json({ token: res.locals.csrfToken }));
    app.post('/acao', (req, res) => { alteracoes++; res.json({ body: req.body }); });
    app.post('/renovar', (req, res, next) => req.session.regenerate(erro => erro ? next(erro) : res.send('ok')));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function pagina(cookie) {
        const resposta = await fetch(base + '/pagina', { headers: cookie ? { cookie } : {} });
        assert.equal(resposta.headers.get('cache-control'), 'no-store');
        return { token: (await resposta.json()).token, cookie: resposta.headers.get('set-cookie')?.split(';')[0] || cookie };
    }
    return { base, pagina, alteracoes: () => alteracoes };
}

test('CSRF rejeita ausência, token de outra sessão, campos ambíguos e requisição cross-site', async t => {
    const r = await iniciar(t); const a = await r.pagina(); const b = await r.pagina();
    assert.match(a.token, /^[a-f0-9]{64}$/); assert.notEqual(a.token, b.token);
    assert.equal((await r.pagina(a.cookie)).token, a.token);
    const casos = [{}, { 'x-csrf-token': b.token }, { 'x-csrf-token': 'inválido' },
        { 'x-csrf-token': a.token, 'sec-fetch-site': 'cross-site' }];
    for (const headers of casos) {
        const res = await fetch(r.base + '/acao', { method: 'POST', headers: { cookie: a.cookie, ...headers } });
        assert.equal(res.status, 403); assert.equal((await res.json()).codigo, 'CSRF_INVALIDO');
    }
    for (const campo of [[a.token, a.token], { valor: a.token }, b.token]) {
        const res = await fetch(r.base + '/acao', { method: 'POST', headers: { cookie: a.cookie, 'x-csrf-token': a.token, 'content-type': 'application/json' }, body: JSON.stringify({ _csrf: campo }) });
        assert.equal(res.status, 403);
    }
    assert.equal(r.alteracoes(), 0);
});

test('CSRF aceita formulário e header válido, removendo o campo antes da validação dos dados', async t => {
    const r = await iniciar(t); const a = await r.pagina();
    const form = await fetch(r.base + '/acao', { method: 'POST', headers: { cookie: a.cookie }, body: new URLSearchParams({ _csrf: a.token, nome: 'Bike' }) });
    assert.equal(form.status, 200); assert.deepEqual(await form.json(), { body: { nome: 'Bike' } });
    const json = await fetch(r.base + '/acao', { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json', 'x-csrf-token': a.token }, body: JSON.stringify({ nome: 'Bike' }) });
    assert.equal(json.status, 200); assert.equal(r.alteracoes(), 2);
});

test('regenerar sessão invalida token anterior e páginas novas emitem outro token', async t => {
    const r = await iniciar(t); const a = await r.pagina();
    const renovada = await fetch(r.base + '/renovar', { method: 'POST', headers: { cookie: a.cookie, 'x-csrf-token': a.token } });
    assert.equal(renovada.status, 200);
    const b = await r.pagina(); assert.notEqual(a.token, b.token);
    const antiga = await fetch(r.base + '/acao', { method: 'POST', headers: { cookie: a.cookie, 'x-csrf-token': a.token } });
    assert.equal(antiga.status, 403); assert.equal(r.alteracoes(), 0);
});
