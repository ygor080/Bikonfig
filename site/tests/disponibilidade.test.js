const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filtro = require('../config/produtoDisponivel');

function carregar(arquivo, dependencias) {
    const contexto = { module: { exports: {} }, require: nome => {
        if (nome === '../models/completudeMontagem') return require('../models/completudeMontagem');
        assert.ok(nome in dependencias, `Dependência não simulada: ${nome}`);
        return dependencias[nome];
    }, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, arquivo), 'utf8'), contexto);
    return contexto.module.exports;
}

function preparar() {
    let salvou = false;
    const itens = [
        { id: 'ativo', posicao: null, nome: 'Quadro' },
        { id: 'inativo', posicao: 'dianteira', nome: 'Pneu antigo' },
        { id: 'inativo', posicao: 'traseira', nome: 'Pneu antigo' }
    ];
    const produtos = [{ id: 'ativo', nome: 'Quadro', preco: 500 }];
    const controller = carregar('../controllers/catalogoController.js', {
        '../models/produtoModel': {
            buscarVariosPorId: async ids => produtos.filter(p => ids.includes(p.id)),
            avaliarCompatibilidade: async p => { assert.equal(p.length, 1); return { status: 'nao_verificada', verificadas: 0, pendentes: 0, faltantes: [], avisos: [] }; }
        },
        '../models/configuracaoModel': {
            buscarPorId: async () => ({ id: 'config', nome: 'Montagem' }),
            listarItens: async () => itens,
            salvar: async () => { salvou = true; return { id: 'nova', nome: 'Montagem' }; }
        },
        pdfkit: function () { throw new Error('PDF não deve iniciar com itens indisponíveis'); }
    });
    async function chamar(acao, body = {}) {
        let status = 200, dados;
        const res = {
            status(codigo) { status = codigo; return this; },
            json(valor) { dados = JSON.parse(JSON.stringify(valor)); }
        };
        await controller[acao]({ params: { id: 'config' }, session: { user: { id: 'usuario' } }, body }, res);
        return { status, dados };
    }
    return { chamar, salvou: () => salvou };
}

test('todas as consultas públicas de produto compartilham o mesmo filtro de disponibilidade', async () => {
    const consultas = [];
    const model = carregar('../models/produtoModel.js', {
        './normalizarSpec': require('../models/normalizarSpec'),
        '../config/banco': { pool: { query: async sql => { consultas.push(sql); return { rows: [] }; } } },
        '../config/produtoDisponivel': filtro
    });
    await model.listarTodos('');
    await model.listarPorSubcategoria('pneus');
    await model.buscarPorId('id');
    await model.buscarVariosPorId(['id']);
    assert.equal(consultas.length, 4);
    consultas.forEach(sql => assert.ok(sql.includes(filtro)));
    assert.match(filtro, /is_active = true/);
    assert.match(filtro, /needs_review = false/);
    assert.match(filtro, /current_price > 0/);
});

test('reabertura sinaliza as duas posições indisponíveis sem perder itens disponíveis', async () => {
    const { dados } = await preparar().chamar('carregarConfiguracao');
    assert.equal(dados.itens.length, 1);
    assert.deepEqual(dados.indisponiveis, [
        { id: 'inativo', nome: 'Pneu antigo', posicao: 'dianteira' },
        { id: 'inativo', nome: 'Pneu antigo', posicao: 'traseira' }
    ]);
});

test('orçamento exclui indisponíveis, avisa e conta unidades disponíveis repetidas', async () => {
    const { dados } = await preparar().chamar('calcularOrcamento', { ids: ['ativo', 'inativo', 'ativo'] });
    assert.equal(dados.total, 1000);
    assert.equal(dados.pecas.length, 2);
    assert.deepEqual(dados.indisponiveis, ['inativo']);
    assert.ok(dados.avisos.some(a => a.includes('somente as peças disponíveis')));
});

test('PDF recusa seleção parcialmente ou totalmente indisponível antes de gerar documento', async () => {
    for (const ids of [['ativo', 'inativo'], ['inativo']]) {
        const r = await preparar().chamar('gerarPdf', { itens: ids.map(id => ({ id })) });
        assert.equal(r.status, 409);
        assert.deepEqual(r.dados.indisponiveis, ['inativo']);
    }
});

test('salvar recusa peças indisponíveis e aceita seleção disponível', async () => {
    const p = preparar();
    assert.equal((await p.chamar('salvarConfiguracao', { nome: 'Teste', itens: [{ id: 'inativo' }] })).status, 409);
    assert.equal(p.salvou(), false);
    assert.equal((await p.chamar('salvarConfiguracao', { nome: 'Teste', itens: [{ id: 'ativo' }] })).status, 200);
    assert.equal(p.salvou(), true);
});

test('lista de montagens usa total apenas das peças disponíveis e informa pendências', async () => {
    let consulta;
    const model = carregar('../models/configuracaoModel.js', {
        '../config/produtoDisponivel': filtro,
        '../config/banco': { pool: { query: async sql => {
            consulta = sql;
            return { rows: [{ id: 'c', total_pecas: '3', total_indisponiveis: '2', total_preco: '500' }] };
        } } }
    });
    const [config] = await model.listarPorUsuario('usuario');
    assert.ok(consulta.includes(`SUM(p.current_price) FILTER (WHERE ${filtro})`));
    assert.equal(config.totalIndisponiveis, 2);
    assert.equal(config.totalPreco, 500);
});
