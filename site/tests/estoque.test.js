const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const publicavel = require('../config/produtoPublicavel');
const selecionavel = require('../config/produtoDisponivel');

test('produto ativo não é usado como evidência de estoque', async () => {
    const consultas = [];
    const contexto = { module: { exports: {} }, require: nome => {
        if (nome === '../config/banco') return { pool: { query: async sql => {
            consultas.push(sql);
            return { rows: [{ id: 'p', ativo: true, em_estoque: null, preco: 10, aro: null }] };
        } } };
        if (nome === './normalizarSpec') return require('../models/normalizarSpec');
        return nome === '../config/produtoPublicavel' ? publicavel : selecionavel;
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/produtoModel.js'), 'utf8'), contexto);
    const [produto] = await contexto.module.exports.listarTodos('');
    assert.equal(produto.ativo, true);
    assert.equal(produto.em_estoque, null);
    assert.match(consultas[0], /p\.in_stock AS em_estoque/);
    assert.doesNotMatch(consultas[0], /p\.is_active AS em_estoque/);
    assert.ok(selecionavel.includes(publicavel));
    assert.match(selecionavel, /p\.in_stock IS DISTINCT FROM false/);
});

function controller(produtos) {
    let salvou = false;
    const contexto = { module: { exports: {} }, console, require: nome => {
        if (nome === '../models/completudeMontagem') return require('../models/completudeMontagem');
        if (nome === '../models/produtoModel') return {
            buscarVariosPorId: async ids => produtos.filter(p => ids.includes(p.id)),
            avaliarCompatibilidade: async () => ({ avisos: [] })
        };
        if (nome === '../models/configuracaoModel') return {
            buscarPorId: async () => ({ id: 'c', nome: 'Montagem' }),
            listarItens: async () => [{ id: 'esgotado', nome: 'Pneu', posicao: 'dianteira' }],
            salvar: async () => { salvou = true; return { id: 'c', nome: 'Montagem' }; }
        };
        return function () { throw new Error('PDF não deve iniciar com produto esgotado'); };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/catalogoController.js'), 'utf8'), contexto);
    async function executar(acao, body) {
        let dados, status = 200;
        const res = { status(s) { status = s; return this; }, json(d) { dados = d; } };
        await contexto.module.exports[acao]({ body, params: { id: 'c' }, session: { user: { id: 'u' } } }, res);
        return { status, dados };
    }
    return { executar, salvou: () => salvou };
}

test('estoque desconhecido permite planejamento com aviso e pode ser salvo como montagem parcial', async () => {
    const c = controller([{ id: 'p', subcategoria: 'quadro', nome: 'Quadro', preco: 100, em_estoque: null }]);
    const r = await c.executar('calcularOrcamento', { ids: ['p'] });
    assert.equal(r.dados.total, 100);
    assert.ok(r.dados.avisos.some(a => a.includes('estoque desconhecida')));
    assert.equal((await c.executar('salvarConfiguracao', { nome: 'Parcial', itens: [{ id: 'p' }] })).status, 200);
    assert.equal(c.salvou(), true);
});

test('produto esgotado excluído pela consulta não conta no total nem no inventário e bloqueia exportação', async () => {
    const c = controller([]);
    const r = await c.executar('calcularOrcamento', { itens: [{ id: 'esgotado', posicao: 'dianteira' }] });
    assert.equal(r.dados.total, 0);
    assert.equal(r.dados.indisponiveis[0], 'esgotado');
    assert.equal(r.dados.completude.selecionados, 0);
    assert.equal((await c.executar('gerarPdf', { itens: [{ id: 'esgotado' }] })).status, 409);
    assert.equal((await c.executar('salvarConfiguracao', { nome: 'Teste', itens: [{ id: 'esgotado' }] })).status, 409);
    const montagem = await c.executar('carregarConfiguracao', {});
    assert.equal(montagem.dados.itens.length, 0);
    assert.equal(montagem.dados.indisponiveis[0].nome, 'Pneu');
});
