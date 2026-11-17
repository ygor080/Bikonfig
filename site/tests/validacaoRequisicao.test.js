const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const vm = require('node:vm');
const fs = require('node:fs');
const v = require('../middleware/validacaoRequisicao');
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function servidor(t, app) {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.on('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
}

test('HTTP rejeita seleções malformadas antes do handler e mantém seleção vazia e duas rodas', async t => {
    const app = express(); app.use(v.parsersRequisicao());
    let chamadas = 0;
    for (const modo of ['orcamento', 'salvar', 'pdf']) app.post('/' + modo, v.validarSelecao(modo), (req, res) => { chamadas++; res.json(req.body); });
    app.use(v.erroRequisicao);
    const base = await servidor(t, app);
    const enviar = (modo, body) => fetch(base + '/' + modo, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const invalidos = [null, [], {}, { itens: {} }, { itens: [null] }, { itens: [{ id: {} }] },
        { itens: [{ id: 'abc' }] }, { itens: [{ id, posicao: 'lateral' }] }, { itens: [{ id, preco: 1 }] },
        { itens: Array.from({ length: 101 }, () => ({ id })) }, { itens: [], tipoMontagem: null },
        { itens: [{ id }], ids: [] }, { ids: [1] }, { itens: [], usuarioId: id }];
    for (const body of invalidos) assert.equal((await enviar('orcamento', body)).status, 400, JSON.stringify(body));
    assert.equal(chamadas, 0);
    assert.equal((await enviar('orcamento', { itens: [] })).status, 200);
    assert.equal((await enviar('orcamento', { ids: [id] })).status, 200);
    const itens = [{ id: id.toUpperCase(), posicao: 'dianteira' }, { id: id.toUpperCase(), posicao: 'traseira' }];
    const resposta = await enviar('orcamento', { itens, ids: itens.map(p => p.id) });
    assert.equal(resposta.status, 200);
    assert.deepEqual((await resposta.json()).itens, itens.map(p => ({ ...p, id })));
    for (const modo of ['salvar', 'pdf']) assert.equal((await enviar(modo, { itens: [], ...(modo === 'salvar' ? { nome: 'Bike' } : {}) })).status, 400);
    for (const nome of ['', ' '.repeat(5), 'a'.repeat(101), {}, 'a\0b']) assert.equal((await enviar('salvar', { itens: [{ id }], nome })).status, 400);
    assert.equal((await enviar('salvar', { itens: [{ id }], nome: 'Bicicleta d’Ávila 🚲' })).status, 200);
});

test('parsers retornam 400, 413 e 415 sem expor o corpo recebido', async t => {
    const app = express(); app.use(v.parsersRequisicao()); app.post('/', (req, res) => res.json({ ok: true })); app.use(v.erroRequisicao);
    const base = await servidor(t, app);
    const casos = [
        ['application/json', '{"segredo":', 400],
        ['application/json', JSON.stringify({ texto: 'a'.repeat(66000) }), 413],
        ['application/x-www-form-urlencoded', Array.from({ length: 21 }, (_, i) => `a${i}=1`).join('&'), 413],
        ['application/json; charset=iso-8859-1', '{}', 415]
    ];
    for (const [tipo, body, status] of casos) {
        const resposta = await fetch(base, { method: 'POST', headers: { 'content-type': tipo }, body });
        assert.equal(resposta.status, status);
        const texto = await resposta.text(); assert.ok(!texto.includes('segredo')); assert.ok(!texto.includes('SyntaxError'));
    }
});

test('rotas reais validam UUID, busca e revisão antes de executar controllers', async t => {
    const app = express(); app.use(v.parsersRequisicao());
    const chamadas = [];
    const controller = new Proxy({}, { get: (_, nome) => (req, res) => { chamadas.push(nome); res.json({ ok: true }); } });
    for (const [arquivo, caminho] of [['catalogoRoutes', '/catalogo'], ['adminRoutes', '/admin']]) {
        const contexto = { module: { exports: {} }, require: nome => {
            if (nome === 'express') return express;
            if (nome.includes('validacaoRequisicao')) return v;
            if (nome.includes('middleware/auth')) return { verificarLogin: (req, res, next) => next(), verificarAdmin: (req, res, next) => next() };
            return controller;
        } };
        vm.runInNewContext(fs.readFileSync(require.resolve('../routes/' + arquivo), 'utf8'), contexto);
        app.use(caminho, contexto.module.exports);
    }
    const base = await servidor(t, app);
    for (const path of ['/catalogo/api/configuracoes/invalido', '/catalogo/api/pecas/invalido!', '/catalogo?busca=a&busca=b', '/catalogo?busca=' + 'a'.repeat(201)]) {
        assert.equal((await fetch(base + path)).status, 400);
    }
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const path of ['/catalogo/api/configuracoes/invalido/excluir', '/admin/revisao/invalido/rejeitar']) assert.equal((await post(path, {})).status, 400);
    for (const body of [{ categoria: {} }, { categoria: 'quadro', fabricante: [] }, { categoria: 'quadro', specsTexto: {} }, { categoria: 'quadro', specsTexto: 'x'.repeat(20001) }]) {
        assert.equal((await post('/admin/revisao/' + id + '/aprovar', body)).status, 400);
    }
    assert.deepEqual(chamadas, []);
    assert.equal((await post('/admin/revisao/' + id + '/aprovar', { categoria: 'quadro', fabricante: '', specsTexto: 'aro: 29' })).status, 200);
    assert.equal((await fetch(base + '/catalogo/api/configuracoes/' + id)).status, 200);
    assert.equal((await post('/catalogo/api/configuracoes', { nome: 'Bike', itens: [{ id }] })).status, 200);
    assert.deepEqual(chamadas, ['aprovarProduto', 'carregarConfiguracao', 'salvarConfiguracao']);
});
