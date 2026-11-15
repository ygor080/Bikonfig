const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.join(__dirname, '../controllers/catalogoController.js'), 'utf8');

function controlador(itensSalvos, produtos) {
    const dependencias = {
        '../models/configuracaoModel': {
            buscarPorId: async () => ({ id: 'config', nome: 'Minha bike' }),
            listarItens: async () => itensSalvos
        },
        '../models/produtoModel': {
            buscarVariosPorId: async ids => produtos.filter(p => ids.includes(p.id)),
            avaliarCompatibilidade: async () => ({ status: 'nao_verificada', verificadas: 0, pendentes: 0, faltantes: [], avisos: [] })
        },
        pdfkit: function () {}
    };
    const contexto = { module: { exports: {} }, require: nome => nome === '../models/completudeMontagem'
        ? require('../models/completudeMontagem') : dependencias[nome], console };
    vm.runInNewContext(codigo, contexto);
    return contexto.module.exports;
}

async function chamar(acao, body = {}) {
    let resultado;
    await acao({ params: { id: 'config' }, session: { user: { id: 'usuario' } }, body }, {
        json: dados => { resultado = JSON.parse(JSON.stringify(dados)); },
        status: codigo => { throw new Error(`Status inesperado: ${codigo}`); }
    });
    return resultado;
}

test('reabre o mesmo pneu nas duas posições e mantém o orçamento das duas unidades', async () => {
    const controller = controlador([
        { id: 'pneu', posicao: 'dianteira' },
        { id: 'pneu', posicao: 'traseira' }
    ], [{ id: 'pneu', nome: 'Pneu', preco: 100, subcategoria: 'pneus', imagemFallback: '/img/pecas/pneu.svg' }]);
    const montagem = await chamar(controller.carregarConfiguracao);
    assert.deepEqual(montagem.itens.map(p => [p.id, p.posicao]), [
        ['pneu', 'dianteira'], ['pneu', 'traseira']
    ]);
    const orcamento = await chamar(controller.calcularOrcamento, { ids: montagem.itens.map(p => p.id) });
    assert.equal(orcamento.pecas.length, 2);
    assert.equal(orcamento.total, 200);
    montagem.itens.forEach(item => assert.equal(item.imagemFallback, '/img/pecas/pneu.svg'));
});

test('preserva posições e ordem dos itens mesmo quando a consulta retorna produtos em outra ordem', async () => {
    const controller = controlador([
        { id: 'quadro', posicao: null },
        { id: 'pneu', posicao: 'dianteira' },
        { id: 'pneu', posicao: 'traseira' }
    ], [{ id: 'pneu', preco: 100 }, { id: 'quadro', preco: 500 }]);
    const montagem = await chamar(controller.carregarConfiguracao);
    assert.deepEqual(montagem.itens.map(p => [p.id, p.posicao]), [
        ['quadro', null], ['pneu', 'dianteira'], ['pneu', 'traseira']
    ]);
});

test('mantém o tratamento de produtos não retornados e de configurações vazias', async () => {
    const controller = controlador([{ id: 'ausente', posicao: null }], []);
    assert.deepEqual((await chamar(controller.carregarConfiguracao)).itens, []);
    assert.deepEqual((await chamar(controlador([], []).carregarConfiguracao)).itens, []);
});
