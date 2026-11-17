const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { criarVerificacaoSaude } = require('../middleware/saude');
const { verificarAmbiente } = require('../config/verificacaoProducao');

test('verificação de ambiente aponta configuração inválida sem devolver segredos', () => {
    const segredo = 'segredo-exclusivo-de-testes-com-32-bytes-ou-mais';
    const env = { SECRET: segredo, DATABASE_URL: 'postgres://usuario:senha@localhost/bikonfig', NODE_ENV: 'production' };
    assert.deepEqual(verificarAmbiente(env), []);
    assert.ok(verificarAmbiente({ ...env, NODE_ENV: 'development' }).some(p => p.includes('NODE_ENV')));
    assert.deepEqual(verificarAmbiente({ ...env, NODE_ENV: 'development' }, true), []);
    for (const banco of [undefined, 'https://servidor', 'postgres://']) {
        const resultado = verificarAmbiente({ ...env, DATABASE_URL: banco, SECRET: 'curta' });
        assert.equal(resultado.length, 2);
        assert.ok(!JSON.stringify(resultado).includes(segredo));
        assert.ok(!JSON.stringify(resultado).includes('usuario:senha'));
    }
});

test('saúde verifica banco sem autenticação e retorna 503 sem detalhes em falha ou timeout', async t => {
    const app = express();
    app.get('/ok', criarVerificacaoSaude({ query: async sql => { assert.equal(sql, 'SELECT 1'); } }));
    app.get('/falha', criarVerificacaoSaude({ query: async () => { throw new Error('postgres://usuario:senha@host'); } }));
    app.get('/lento', criarVerificacaoSaude({ query: () => new Promise(() => {}) }, 20));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const caminho of ['/ok', '/falha', '/lento']) {
        const resposta = await fetch(base + caminho);
        assert.equal(resposta.status, caminho === '/ok' ? 200 : 503);
        assert.equal(resposta.headers.get('cache-control'), 'no-store');
        assert.equal(resposta.headers.get('set-cookie'), null);
        assert.deepEqual(await resposta.json(), { status: caminho === '/ok' ? 'ok' : 'indisponivel' });
    }
});
