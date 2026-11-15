const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function modelo(rows = []) {
    const consultas = [];
    const contexto = { module: { exports: {} }, require: nome => {
        if (nome === '../config/banco') return { pool: { query: async (sql, valores) => {
            consultas.push({ sql, valores }); return { rows };
        } } };
        if (nome === './normalizarSpec') return require('../models/normalizarSpec');
        return require(nome === '../config/produtoPublicavel' ? '../config/produtoPublicavel' : '../config/produtoDisponivel');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/produtoModel.js'), 'utf8'), contexto);
    return { model: contexto.module.exports, consultas };
}

test('busca consulta nome, fabricante e loja com parâmetros e mantém campos separados', async () => {
    const { model, consultas } = modelo([{ id: 'p', nome: 'Produto', fabricante: 'Shimano', loja: 'Loja A', preco: 10, aro: null }]);
    const [produto] = await model.listarTodos('Shimano');
    assert.equal(produto.fabricante, 'Shimano');
    assert.equal(produto.loja, 'Loja A');
    assert.match(consultas[0].sql, /p\.manufacturer ILIKE \$1/);
    assert.match(consultas[0].sql, /s\.name ILIKE \$1/);
    assert.match(consultas[0].sql, /s\.name AS loja/);
    assert.doesNotMatch(consultas[0].sql, /s\.name AS marca/);
    assert.equal(consultas[0].valores[0], '%Shimano%');
});

test('fabricante ausente não recebe o nome da loja', async () => {
    const { model } = modelo([{ id: 'p', nome: 'Produto', fabricante: null, loja: 'Loja A', preco: 10, aro: null }]);
    const produto = await model.buscarPorId('p');
    assert.equal(produto.fabricante, null);
    assert.equal(produto.loja, 'Loja A');
});

test('revisão grava fabricante independentemente da fonte e permite limpar o campo', async () => {
    const { model, consultas } = modelo();
    await model.aprovarProduto('p', { fabricante: ' Shimano ' });
    assert.match(consultas[0].sql, /manufacturer = \$1/);
    assert.doesNotMatch(consultas[0].sql, /UPDATE sources/);
    assert.equal(consultas[0].valores[0], 'Shimano');
    await model.aprovarProduto('p', { fabricante: '' });
    assert.equal(consultas[1].valores[0], null);
    await model.aprovarProduto('p', {});
    assert.doesNotMatch(consultas[2].sql, /manufacturer =/);
});

test('admin valida fabricante e encaminha correção para aprovação', async () => {
    const aprovados = [];
    const contexto = { module: { exports: {} }, require: () => ({ aprovarProduto: async (...args) => aprovados.push(args) }) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8'), contexto);
    const executar = fabricante => contexto.module.exports.aprovarProduto({ params: { id: 'p' }, body: { categoria: 'quadro', fabricante } }, { redirect() {} });
    await executar('Shimano');
    assert.equal(aprovados[0][1].fabricante, 'Shimano');
    await executar({ nome: 'Inválido' });
    await executar('x'.repeat(201));
    assert.equal(aprovados.length, 1);
});
