const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const regra = { category_a: 'quadro', category_b: 'pneus', spec_key: 'aro', description: 'Aros divergentes' };
function preparar(regras = [regra]) {
    const contexto = { module: { exports: {} }, require: nome => nome === '../public/js/conteudo-seguro' ? require('../public/js/conteudo-seguro') : nome === '../config/banco'
        ? { pool: { query: async () => ({ rows: regras }) } }
        : nome === './normalizarSpec' ? require('../models/normalizarSpec') : require(nome === '../config/produtoPublicavel' ? '../config/produtoPublicavel' : '../config/produtoDisponivel') };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/produtoModel.js'), 'utf8'), contexto);
    return contexto.module.exports;
}
function pecas(aroA, aroB) {
    return [
        { id: 'q', nome: 'Quadro', subcategoria: 'quadro', categoria: 'quadro', specs: { aro: aroA }, aro: aroA },
        { id: 'p', nome: 'Pneu', subcategoria: 'pneus', categoria: 'pneus', posicao: 'traseira', specs: { aro: aroB }, aro: aroB }
    ];
}

test('dados completos iguais retornam sem divergências somente nas regras verificadas', async () => {
    const r = await preparar().avaliarCompatibilidade(pecas(' 29 ', '29'));
    assert.equal(r.status, 'sem_divergencias');
    assert.equal(r.verificadas, 1);
    assert.equal(r.pendentes, 0);
    assert.equal(r.avisos.length, 0);
});

test('atributo ausente, nulo ou vazio sinaliza a peça e a especificação faltante', async () => {
    for (const valor of [undefined, null, '', '   ']) {
        const r = await preparar().avaliarCompatibilidade(pecas('29', valor));
        assert.equal(r.status, 'dados_insuficientes');
        assert.equal(r.verificadas, 0);
        assert.equal(r.pendentes, 1);
        assert.equal(r.faltantes[0].campo, 'aro');
        assert.equal(r.faltantes[0].ausentes[0].nome, 'Pneu');
        assert.equal(r.avisos.length, 0);
    }
});

test('ausência nas duas peças identifica ambas, sem afirmar incompatibilidade', async () => {
    const r = await preparar().avaliarCompatibilidade(pecas(undefined, undefined));
    assert.equal(r.status, 'dados_insuficientes');
    assert.equal(r.faltantes[0].ausentes.length, 2);
    assert.equal(r.avisos.length, 0);
});

test('divergência conhecida continua sendo incompatibilidade', async () => {
    const model = preparar();
    const r = await model.avaliarCompatibilidade(pecas('29', '26'));
    assert.equal(r.status, 'incompativel');
    assert.equal(r.verificadas, 1);
    assert.match(r.avisos[0], /Aros divergentes/);
    assert.match((await model.verificarCompatibilidade(pecas('29', '26')))[0], /Aros divergentes/);
});

test('incompatibilidade e dados insuficientes podem coexistir no mesmo relatório', async () => {
    const r = await preparar([regra, { ...regra, spec_key: 'padrao_freio' }])
        .avaliarCompatibilidade(pecas('29', '26'));
    assert.equal(r.status, 'incompativel');
    assert.equal(r.verificadas, 1);
    assert.equal(r.pendentes, 1);
    assert.equal(r.faltantes[0].campo, 'padrao_freio');
});

test('seleção vazia, peça isolada ou pares sem regra ficam como não verificados', async () => {
    const model = preparar();
    for (const selecao of [[], pecas('29', '29').slice(0, 1)]) {
        const r = await model.avaliarCompatibilidade(selecao);
        assert.equal(r.status, 'nao_verificada');
        assert.equal(r.pendentes, 0);
    }
    assert.equal((await preparar([]).avaliarCompatibilidade(pecas('29', '29'))).status, 'nao_verificada');
});

test('regra de aro e verificação adicional não duplicam a comparação do mesmo par', async () => {
    const selecao = pecas('29', undefined);
    selecao[1].categoria = 'rodas';
    selecao[1].subcategoria = 'rodas-traseira';
    const r = await preparar([{ ...regra, category_b: 'rodas' }]).avaliarCompatibilidade(selecao);
    assert.equal(r.pendentes, 1);
    assert.equal(r.faltantes.length, 1);
});

test('orçamento entrega relatório ao cliente e mantém avisos separados de dados faltantes', async () => {
    const model = preparar();
    model.buscarVariosPorId = async () => pecas('29', undefined).map(p => ({ ...p, preco: 100 }));
    const contexto = { module: { exports: {} }, console, require: nome =>
        nome === '../models/produtoModel' ? model
            : nome === '../models/completudeMontagem' ? require('../models/completudeMontagem') : {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/catalogoController.js'), 'utf8'), contexto);
    let resultado;
    await contexto.module.exports.calcularOrcamento({ body: { itens: [{ id: 'q' }, { id: 'p', posicao: 'traseira' }] } }, {
        json: dados => { resultado = dados; }, status: () => { throw new Error('Falha no orçamento'); }
    });
    assert.equal(resultado.total, 200);
    assert.equal(resultado.compatibilidade.status, 'dados_insuficientes');
    assert.equal(resultado.compatibilidade.faltantes[0].campo, 'aro');
    assert.equal(resultado.avisos.length, 0);
});
