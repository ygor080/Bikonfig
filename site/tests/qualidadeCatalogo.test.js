const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const contexto = { module: { exports: {} }, require: nome => nome === '../config/banco' ? { pool: {} } : require('../models/normalizarSpec') };
vm.runInNewContext(fs.readFileSync(require.resolve('../models/qualidadeCatalogoModel'), 'utf8'), contexto);
const { analisar } = contexto.module.exports;

test('diagnóstico distingue variantes e opções diferentes e apenas sinaliza identidades repetidas', () => {
    const base = { source_id: 1, canonical_url: 'https://loja.test/p', categoria: 'quadro', preco: 10, specs: { aro: 29 } };
    const produtos = [
        { ...base, id: 'm', external_variant_id: '1', variant_title: 'M', variant_options: { tamanho: 'M' } },
        { ...base, id: 'g', external_variant_id: '2', variant_title: 'G', variant_options: { tamanho: 'G' } },
        { ...base, id: 'g2', external_variant_id: '2', variant_title: 'G', variant_options: { tamanho: 'G' } },
        { ...base, id: 'sku', sku: 'OUTRO' }
    ];
    const resultado = analisar(produtos, []);
    assert.deepEqual(Array.from(resultado, p => p.id), ['g', 'g2']);
    assert.ok(resultado.every(p => p.pendencias.some(msg => msg.includes('conferir antes de unir'))));
    assert.equal(produtos[1].duplicate_of, undefined);
});

test('diagnóstico encontra categoria, specs e medidas ausentes ou ambíguas sem inventar valores', () => {
    const regras = [{ category_a: 'quadro', category_b: 'pneus', spec_key: 'aro' }];
    const resultado = analisar([
        { id: '1', source_id: 1, product_url: '/1', categoria: null, specs: {}, preco: null },
        { id: '2', source_id: 1, product_url: '/2', categoria: 'quadro', specs: { aro: '27.5/29' }, preco: 10 },
        { id: '3', source_id: 1, product_url: '/3', categoria: 'quadro', specs: { aro: 'ARO 29' }, preco: 10 }
    ], regras);
    assert.equal(resultado.length, 2);
    assert.ok(resultado[0].pendencias.includes('Sem categoria'));
    assert.ok(resultado[0].pendencias.includes('Sem especificações técnicas'));
    assert.ok(resultado[1].pendencias.some(msg => msg.includes('aro')));
});
