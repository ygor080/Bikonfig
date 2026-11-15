const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const regra = (a, b, campo) => ({ category_a: a, category_b: b, spec_key: campo, description: 'Valores divergentes.' });
function preparar(regras) {
    const contexto = { module: { exports: {} }, require: nome => {
        if (nome === '../config/banco') return { pool: { query: async () => ({ rows: regras }) } };
        if (nome === './normalizarSpec') return require('../models/normalizarSpec');
        return require(nome === '../config/produtoPublicavel' ? '../config/produtoPublicavel' : '../config/produtoDisponivel');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/produtoModel.js'), 'utf8'), contexto);
    return contexto.module.exports;
}
const peca = (id, subcategoria, categoria, specs, posicao) => ({ id, nome: id, subcategoria, categoria, specs, posicao, preco: 100 });

test('rodas dianteira e traseira diferentes são comparadas com garfo e quadro correspondentes', async () => {
    const model = preparar([regra('rodas', 'quadro', 'aro'), regra('rodas-dianteira', 'quadro-garfo', 'aro')]);
    const pecas = [peca('Quadro', 'quadro', 'quadro', { aro: 27.5 }),
        peca('Garfo', 'quadro-garfo', 'quadro', { aro: 29 }),
        peca('Roda frente', 'rodas-dianteira', 'rodas', { aro: 29 }),
        peca('Roda trás', 'rodas-traseira', 'rodas', { aro: 27.5 })];
    const r = await model.avaliarCompatibilidade(pecas);
    assert.equal(r.status, 'sem_divergencias');
    assert.equal(r.verificadas, 2);
});

test('pneus são comparados somente com a roda da mesma posição', async () => {
    const r = await preparar([regra('rodas', 'pneus', 'aro')]).avaliarCompatibilidade([
        peca('Frente', 'rodas-dianteira', 'rodas', { aro: 29 }),
        peca('Trás', 'rodas-traseira', 'rodas', { aro: 27.5 }),
        peca('Pneu frente', 'pneus', 'pneus', { aro: 29 }, 'dianteira'),
        peca('Pneu trás', 'pneus', 'pneus', { aro: 27.5 }, 'traseira')
    ]);
    assert.equal(r.status, 'sem_divergencias');
    assert.equal(r.verificadas, 2);
});

test('mesmo produto nas duas posições mantém comparações distintas e aviso identifica lado e valores', async () => {
    const r = await preparar([regra('rodas', 'pneus', 'aro'), regra('pneus', 'rodas', 'aro')]).avaliarCompatibilidade([
        peca('Frente', 'rodas-dianteira', 'rodas', { aro: 29 }),
        peca('Trás', 'rodas-traseira', 'rodas', { aro: 26 }),
        peca('Pneu', 'pneus', 'pneus', { aro: 29 }, 'dianteira'),
        peca('Pneu', 'pneus', 'pneus', { aro: 29 }, 'traseira')
    ]);
    assert.equal(r.verificadas, 2);
    assert.equal(r.avisos.length, 1);
    assert.equal(r.divergencias.length, 1);
    assert.match(r.avisos[0], /Trás \(traseira\): 26/);
    assert.match(r.avisos[0], /Pneu \(traseira\): 29/);
    assert.equal(r.divergencias[0].campo, 'aro');
});

test('cubos, câmaras e aros avulsos não são tratados como rodas completas por herança', async () => {
    const r = await preparar([regra('freios', 'rodas', 'padrao_freio')]).avaliarCompatibilidade([
        peca('Freio', 'freios-dianteiro', 'freios', { padrao_freio: 'disco' }),
        peca('Cubo', 'rodas-cubo-dianteiro', 'rodas', {}),
        peca('Câmara', 'rodas-camara-ar', 'rodas', {}, 'dianteira'),
        peca('Aro', 'rodas-aro', 'rodas', {}, 'dianteira')
    ]);
    assert.equal(r.status, 'nao_verificada');
});

test('posição ausente gera dados insuficientes, sem supor comparação cruzada', async () => {
    const r = await preparar([regra('rodas', 'pneus', 'aro')]).avaliarCompatibilidade([
        peca('Roda', 'rodas-dianteira', 'rodas', { aro: 29 }),
        peca('Pneu', 'pneus', 'pneus', { aro: 26 })
    ]);
    assert.equal(r.status, 'dados_insuficientes');
    assert.equal(r.faltantes[0].campo, 'posicao');
    assert.equal(r.avisos.length, 0);
});

test('freios e eixos não são comparados com o lado oposto, mesmo com posição enviada incorretamente', async () => {
    for (const campo of ['padrao_freio', 'diametro_eixo']) {
        const r = await preparar([regra('freios-dianteiro', 'rodas-traseira', campo)]).avaliarCompatibilidade([
            peca('Freio', 'freios-dianteiro', 'freios', { [campo]: 'disco' }, 'traseira'),
            peca('Roda', 'rodas-traseira', 'rodas', { [campo]: 'v-brake' })
        ]);
        assert.equal(r.status, 'nao_verificada');
    }
});

test('regras antigas de transmissão são corrigidas sem confundir velocidades e número de coroas', async () => {
    const model = preparar([regra('cambio-dianteiro-desviador', 'pedivela', 'velocidades')]);
    const pecas = [peca('Câmbio', 'cambio-dianteiro-desviador', 'cambio-dianteiro', { velocidades: 11, numero_coroas: 2 }),
        peca('Pedivela', 'pedivela', 'pedivela', { velocidades: 10, numero_coroas: '2 coroas' })];
    assert.equal((await model.avaliarCompatibilidade(pecas)).status, 'sem_divergencias');
    delete pecas[0].specs.numero_coroas;
    const r = await model.avaliarCompatibilidade(pecas);
    assert.equal(r.status, 'dados_insuficientes');
    assert.equal(r.faltantes[0].campo, 'numero_coroas');
});

test('encaixe do cassete no cubo usa padrão do freehub, sem inferência por velocidades', async () => {
    const model = preparar([regra('rodas-cubo-traseiro', 'cassete', 'velocidades')]);
    const pecas = [peca('Cubo', 'rodas-cubo-traseiro', 'rodas', { velocidades: 11, padrao_freehub: 'HG spline M' }),
        peca('Cassete', 'cassete', 'cassete', { velocidades: 10, padrao_freehub: 'hg spline m' })];
    assert.equal((await model.avaliarCompatibilidade(pecas)).status, 'sem_divergencias');
    pecas[1].specs.padrao_freehub = 'Micro Spline';
    assert.equal((await model.avaliarCompatibilidade(pecas)).status, 'incompativel');
});

test('orçamento recebe posições e conserva as duas aplicações do mesmo produto', async () => {
    const model = preparar([]);
    let recebidas;
    model.buscarVariosPorId = async () => [peca('Pneu', 'pneus', 'pneus', { aro: 29 })];
    model.avaliarCompatibilidade = async pecas => { recebidas = pecas; return { avisos: [] }; };
    const contexto = { module: { exports: {} }, console, require: nome => nome === '../models/produtoModel' ? model
        : nome === '../models/completudeMontagem' ? require('../models/completudeMontagem') : {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/catalogoController.js'), 'utf8'), contexto);
    let resultado;
    await contexto.module.exports.calcularOrcamento({ body: { itens: [
        { id: 'Pneu', posicao: 'dianteira' }, { id: 'Pneu', posicao: 'traseira' }
    ] } }, { json: dados => { resultado = dados; }, status: () => { throw new Error('Falha'); } });
    assert.equal(recebidas.length, 2);
    assert.equal(recebidas[0].posicao, 'dianteira');
    assert.equal(recebidas[1].posicao, 'traseira');
    assert.equal(resultado.total, 200);
});

test('eixos dianteiro e traseiro usam somente garfo e quadro do lado correspondente', async () => {
    const r = await preparar([
        regra('fixacao-roda-dianteiro', 'quadro-garfo', 'diametro_eixo'),
        regra('fixacao-roda-traseiro', 'quadro', 'diametro_eixo')
    ]).avaliarCompatibilidade([
        peca('Eixo frente', 'fixacao-roda-dianteiro', 'fixacao-roda', { diametro_eixo: '110x15mm boost' }),
        peca('Garfo', 'quadro-garfo', 'quadro', { diametro_eixo: '110x15mm boost' }),
        peca('Eixo trás', 'fixacao-roda-traseiro', 'fixacao-roda', { diametro_eixo: '148x12mm boost' }),
        peca('Quadro', 'quadro', 'quadro', { diametro_eixo: '148x12mm boost' })
    ]);
    assert.equal(r.status, 'sem_divergencias');
    assert.equal(r.verificadas, 2);
});

test('regra antiga entre coroa avulsa e câmbio dianteiro é suspensa sem presumir equivalência', async () => {
    const r = await preparar([regra('pedivela-coroa', 'cambio-dianteiro-desviador', 'velocidades')]).avaliarCompatibilidade([
        peca('Coroa', 'pedivela-coroa', 'pedivela', { velocidades: 11 }),
        peca('Câmbio', 'cambio-dianteiro-desviador', 'cambio-dianteiro', { velocidades: 2 })
    ]);
    assert.equal(r.status, 'nao_verificada');
    assert.equal(r.avisos.length, 0);
});
