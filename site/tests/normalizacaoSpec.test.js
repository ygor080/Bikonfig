const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const normalizar = require('../models/normalizarSpec');

test('normaliza aro com prefixo, polegadas e separador decimal', () => {
    for (const valor of [29, '29', 'ARO 29', '29"', '29 polegadas', '29.0 in']) {
        assert.equal(normalizar(valor, 'aro'), '29');
    }
    assert.equal(normalizar('27,5', 'aro'), normalizar('27.50 polegadas', 'aro'));
    assert.notEqual(normalizar('27,5', 'aro'), normalizar('29', 'aro'));
});

test('normaliza velocidades sem aceitar relações ou listas como valor único', () => {
    for (const valor of [11, '11v', '11 velocidades', '11 speed', '11 vel.']) {
        assert.equal(normalizar(valor, 'velocidades'), '11');
    }
    assert.notEqual(normalizar('11v', 'velocidades'), normalizar('12v', 'velocidades'));
    for (const valor of ['2x11', '10/11v', '11-12', '11.5']) assert.equal(normalizar(valor, 'velocidades'), null);
});

test('normaliza unidades de eixo, decimais e separadores sem perder dimensões', () => {
    assert.equal(normalizar('12 mm', 'diametro_eixo'), normalizar('1,2 cm', 'diametro_eixo'));
    for (const valor of ['148 × 12 mm Boost', 'BOOST 148x12mm', '14,8 cm x 1,2 cm boost']) {
        assert.equal(normalizar(valor, 'diametro_eixo'), '148mmx12mm boost');
    }
    assert.notEqual(normalizar('142x12mm', 'diametro_eixo'), normalizar('148x12mm', 'diametro_eixo'));
    assert.notEqual(normalizar('12mm', 'diametro_eixo'), normalizar('148x12mm', 'diametro_eixo'));
    assert.notEqual(normalizar('148x12mm', 'diametro_eixo'), normalizar('148x12mm Boost', 'diametro_eixo'));
    assert.notEqual(normalizar('148x12mm Boost', 'diametro_eixo'), normalizar('148x12mm Super Boost', 'diametro_eixo'));
});

test('normaliza nomes de fixação preservando QR e eixo passante como padrões distintos', () => {
    assert.equal(normalizar('9mm fecho rápido', 'diametro_eixo'), normalizar('9 mm Quick Release', 'diametro_eixo'));
    assert.equal(normalizar('12mm eixo passante', 'diametro_eixo'), normalizar('12 mm thru axle', 'diametro_eixo'));
    assert.notEqual(normalizar('9 mm QR', 'diametro_eixo'), normalizar('9 mm thru-axle', 'diametro_eixo'));
    assert.equal(normalizar('12mm QR eixo passante', 'diametro_eixo'), null);
});

test('normaliza nomes de freio sem remover características adicionais', () => {
    for (const valor of ['Disco', 'freio a disco', 'Disc brake', 'disk']) assert.equal(normalizar(valor, 'padrao_freio'), 'disco');
    assert.equal(normalizar('V brake', 'padrao_freio'), normalizar('freio V-Brake', 'padrao_freio'));
    assert.notEqual(normalizar('disco', 'padrao_freio'), normalizar('v-brake', 'padrao_freio'));
    assert.notEqual(normalizar('disco hidráulico', 'padrao_freio'), normalizar('disco mecânico', 'padrao_freio'));
});

test('valores ausentes, inválidos e medidas ambíguas não viram comparações válidas', () => {
    for (const valor of [null, undefined, '', 'N/A', 'não informado', {}, [], true, NaN, Infinity]) {
        assert.equal(normalizar(valor, 'aro'), null);
    }
    for (const valor of ['29/27.5', '29 lixo', '700c', '29 x 2.1', '0', '-29']) assert.equal(normalizar(valor, 'aro'), null);
    assert.equal(normalizar('12mm ou 15mm', 'diametro_eixo'), null);
    assert.equal(normalizar('12', 'diametro_eixo'), '12'); // Não inventa unidade ausente.
});

test('regras e verificação adicional de aro usam a mesma normalização, sem modificar produtos', async () => {
    for (const regras of [[], [{ category_a: 'quadro', category_b: 'rodas', spec_key: 'aro', description: 'Aros diferentes' }]]) {
        const contexto = { module: { exports: {} }, require: nome => {
        if (nome === '../public/js/conteudo-seguro') return require('../public/js/conteudo-seguro');
            if (nome === '../config/banco') return { pool: { query: async () => ({ rows: regras }) } };
            if (nome === './normalizarSpec') return normalizar;
            return require(nome === '../config/produtoPublicavel' ? '../config/produtoPublicavel' : '../config/produtoDisponivel');
        } };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/produtoModel.js'), 'utf8'), contexto);
        const pecas = [
            { id: 'q', nome: 'Quadro', categoria: 'quadro', aro: 'ARO 27,5', specs: { aro: 'ARO 27,5' } },
            { id: 'r', nome: 'Roda', categoria: 'rodas', posicao: 'traseira', aro: '27.5"', specs: { aro: '27.5"' } }
        ];
        const original = JSON.stringify(pecas);
        const r = await contexto.module.exports.avaliarCompatibilidade(pecas);
        assert.equal(r.status, 'sem_divergencias');
        assert.equal(r.verificadas, 1);
        assert.equal(JSON.stringify(pecas), original);
        pecas[1].aro = pecas[1].specs.aro = '27.5 lixo';
        assert.equal((await contexto.module.exports.avaliarCompatibilidade(pecas)).status, 'dados_insuficientes');
    }
});
