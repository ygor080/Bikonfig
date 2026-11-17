const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { avaliarCompletude, tipoValido } = require('../models/completudeMontagem');

const p = (subcategoria, posicao, specs = {}) => ({ id: subcategoria, subcategoria, posicao, specs });
const falta = (r, chave) => r.faltantes.some(f => f.chave === chave);
function montagem() {
    const pecas = ['quadro', 'quadro-garfo', 'direcao', 'guidao', 'guidao-avanco', 'selim', 'selim-canote',
        'pedivela-movimento-central', 'pedal', 'corrente', 'guidao-manoplas', 'cassete',
        'cambio-traseiro-desviador', 'cambio-traseiro-trocador'].map(c => p(c));
    pecas.push(p('pedivela', null, { numero_coroas: 1 }));
    for (const lado of ['dianteira', 'traseira']) {
        pecas.push(p('rodas', lado), p('pneus', lado), p('fixacao-roda', lado), p('rodas-camara-ar', lado),
            p('freios', lado, { padrao_freio: 'v-brake' }));
    }
    return pecas;
}

test('seleção vazia ou apenas acessórios mostra componentes principais faltantes', () => {
    for (const pecas of [[], [p('iluminacao-farol')]]) {
        const r = avaliarCompletude(pecas);
        assert.equal(r.status, 'incompleta');
        assert.equal(r.selecionados, 0);
        assert.ok(falta(r, 'quadro'));
        assert.ok(falta(r, 'roda-dianteira'));
        assert.ok(falta(r, 'roda-traseira'));
    }
});

test('inventário principal selecionado não afirma segurança ou compatibilidade integral', () => {
    const r = avaliarCompletude(montagem());
    assert.equal(r.status, 'itens_selecionados');
    assert.equal(r.faltantes.length, 0);
    assert.equal(r.confirmar.length, 0);
    assert.match(r.observacao, /não certifica compatibilidade ou segurança/);
});

test('uma peça em uma roda não preenche a outra, mas duas aplicações do mesmo produto preenchem', () => {
    assert.ok(falta(avaliarCompletude([p('pneus', 'dianteira')]), 'pneu-traseira'));
    const r = avaliarCompletude([p('pneus', 'dianteira'), p('pneus', 'traseira')]);
    assert.equal(falta(r, 'pneu-dianteira'), false);
    assert.equal(falta(r, 'pneu-traseira'), false);
});

test('roda completa dispensa avulsas; montagem avulsa precisa de aro, cubo e raios do mesmo lado', () => {
    assert.equal(falta(avaliarCompletude([p('rodas-dianteira')]), 'roda-dianteira'), false);
    const avulsas = [p('rodas-aro', 'dianteira'), p('rodas-cubo-dianteiro')];
    assert.ok(falta(avaliarCompletude(avulsas), 'roda-dianteira'));
    avulsas.push(p('rodas-raio', 'dianteira'));
    const r = avaliarCompletude(avulsas);
    assert.equal(falta(r, 'roda-dianteira'), false);
    assert.ok(falta(r, 'roda-traseira'));
});

test('conjuntos só cobrem componentes inclusos ou um par explicitamente informado', () => {
    assert.ok(falta(avaliarCompletude([p('rodas')]), 'roda-dianteira'));
    const r = avaliarCompletude([p('rodas', null, { vendido_em_par: true, componentes_inclusos: ['fixacao-roda'] })]);
    assert.equal(falta(r, 'roda-dianteira'), false);
    assert.equal(falta(r, 'roda-traseira'), false);
    assert.equal(falta(r, 'fixacao-dianteira'), false);
});

test('transmissão 1x dispensa câmbio dianteiro; múltiplas coroas exigem câmbio e comando', () => {
    const pecas = montagem();
    assert.equal(falta(avaliarCompletude(pecas), 'cambio-dianteiro'), false);
    pecas.find(p => p.subcategoria === 'pedivela').specs.numero_coroas = 2;
    const r = avaliarCompletude(pecas);
    assert.ok(falta(r, 'cambio-dianteiro'));
    assert.ok(falta(r, 'trocador-dianteiro'));
    delete pecas.find(p => p.subcategoria === 'pedivela').specs.numero_coroas;
    assert.ok(avaliarCompletude(pecas).confirmar.some(c => c.chave === 'numero-coroas'));
});

test('single-speed não exige câmbios; suspensão total exige amortecedor traseiro', () => {
    const r = avaliarCompletude([], 'single-speed');
    assert.equal(falta(r, 'cambio-traseiro'), false);
    assert.equal(falta(r, 'cassete'), false);
    assert.ok(falta(r, 'transmissao-single-speed'));
    assert.equal(falta(avaliarCompletude([p('rodas-cubo-traseiro', null, { tipo_transmissao: 'single-speed' })], 'single-speed'), 'transmissao-single-speed'), false);
    assert.ok(falta(avaliarCompletude(montagem(), 'suspensao-total'), 'amortecedor'));
    assert.equal(falta(avaliarCompletude([...montagem(), p('quadro-amortecedor')], 'suspensao-total'), 'amortecedor'), false);
});

test('tubeless exige confirmação; freio a disco exige rotor separado ou incluso', () => {
    const r = avaliarCompletude([p('pneus', 'dianteira', { tubeless: true }), p('freios-dianteiro', null, { padrao_freio: 'disco' })]);
    assert.equal(falta(r, 'camara-dianteira'), false);
    assert.ok(r.confirmar.some(c => c.chave === 'tubeless-dianteira'));
    assert.ok(falta(r, 'disco-dianteira'));
    assert.equal(falta(avaliarCompletude([p('freios-dianteiro', null, { padrao_freio: 'disco', inclui_disco: true })]), 'disco-dianteira'), false);
});

test('tipo de montagem inválido é rejeitado', () => {
    assert.equal(tipoValido('qualquer'), false);
    assert.throws(() => avaliarCompletude([], 'qualquer'), /inválido/);
});

test('orçamento avalia apenas produtos disponíveis e aceita seleção vazia', async () => {
    const contexto = { module: { exports: {} }, console, require: nome => {
        if (nome === '../public/js/conteudo-seguro') return require('../public/js/conteudo-seguro');
        if (nome === '../models/completudeMontagem') return require('../models/completudeMontagem');
        if (nome === '../models/produtoModel') return {
            buscarVariosPorId: async () => [{ ...p('quadro'), preco: 100 }],
            avaliarCompatibilidade: async () => ({ avisos: [] })
        };
        return {};
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/catalogoController.js'), 'utf8'), contexto);
    let resultado;
    const executar = body => contexto.module.exports.calcularOrcamento({ body }, {
        json: r => { resultado = r; }, status: () => { throw new Error('Erro inesperado'); }
    });
    await executar({ itens: [{ id: 'quadro' }, { id: 'pneus', posicao: 'dianteira' }], tipoMontagem: 'single-speed' });
    assert.equal(falta(resultado.completude, 'quadro'), false);
    assert.ok(falta(resultado.completude, 'pneu-dianteira'));
    assert.equal(resultado.completude.tipo, 'single-speed');
    await executar({ itens: [] });
    assert.equal(resultado.completude.selecionados, 0);
});

test('modelo persiste tipo de montagem e conserva isolamento por usuário na reabertura', async () => {
    const consultas = [];
    const query = async (sql, valores) => { consultas.push({ sql, valores }); return { rows: [{ id: 'c', nome: 'Bike', tipo_montagem: 'single-speed' }] }; };
    const contexto = { module: { exports: {} }, require: nome => nome === '../public/js/conteudo-seguro' ? require('../public/js/conteudo-seguro') : nome === '../config/banco'
        ? { pool: { connect: async () => ({ query, release() {} }), query } } : '' };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/configuracaoModel.js'), 'utf8'), contexto);
    await contexto.module.exports.salvar('u', 'Bike', [], 'single-speed');
    assert.equal(consultas.find(c => c.sql.startsWith('INSERT INTO configuracoes')).valores[2], 'single-speed');
    const c = await contexto.module.exports.buscarPorId('c', 'u');
    assert.equal(c.tipo_montagem, 'single-speed');
    assert.match(consultas.at(-1).sql, /usuario_id = \$2/);
});
