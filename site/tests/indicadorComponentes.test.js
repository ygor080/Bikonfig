const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const esperar = () => new Promise(resolve => setImmediate(resolve));

async function abrir(t, relatorio, falha = false) {
    const html = ejs.render(fs.readFileSync(require.resolve('../views/configurador.ejs'), 'utf8'), {
        usuario: { nome: 'Teste' }, completudeInicial: require('../models/completudeMontagem').avaliarCompletude([]),
        categorias: [{ slug: 'quadro', nome: 'Quadro', subcategorias: [{ slug: 'quadro', nome: 'Quadro' },
            { slug: 'quadro-garfo', nome: 'Garfo' }, { slug: 'quadro-amortecedor', nome: 'Amortecedor traseiro' }] }]
    });
    const dom = new JSDOM(html, { url: 'https://bikonfig.test/catalogo/configurador', runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    const w = dom.window; w.console.error = () => {};
    const produto = { id: 'produto', nome: 'Quadro', subcategoria: 'quadro', preco: 100 };
    w.fetch = async url => ({ ok: !falha || url.includes('/api/pecas/'), json: async () =>
        url.includes('/api/pecas/') ? [produto] : { total: 100, avisos: [], completude: relatorio } });
    for (const nome of ['conteudo-seguro', 'configurador']) w.eval(fs.readFileSync(require.resolve('../public/js/' + nome), 'utf8'));
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true })); await esperar();
    return { w, d: w.document, selecionar: async () => {
        w.document.querySelector('.config-subitem-btn').click(); await esperar();
        w.document.querySelector('[data-selecionar]').click(); await esperar();
    } };
}

test('indicador fica compacto e detalhes fechados; clique abre e fecha sem perder a lista', async t => {
    const r = await abrir(t, { status: 'incompleta', selecionados: 1, total: 3,
        faltantes: [{ nome: 'Garfo' }, { nome: '<img src=x onerror=alert(1)>' }], confirmar: [], observacao: 'Confira com um profissional.' });
    const btn = r.d.getElementById('btnComponentesEssenciais'); const detalhes = r.d.getElementById('configCompletude');
    assert.equal(detalhes.hidden, true); assert.equal(btn.getAttribute('aria-expanded'), 'false');
    await r.selecionar();
    assert.equal(btn.dataset.estado, 'incompleta'); assert.match(btn.getAttribute('aria-label'), /2 componentes essenciais faltando/);
    assert.equal(detalhes.hidden, true); btn.click(); assert.equal(detalhes.hidden, false);
    assert.equal(btn.getAttribute('aria-expanded'), 'true'); assert.match(detalhes.textContent, /Garfo/);
    assert.equal(detalhes.querySelector('img'), null);
    btn.click(); assert.equal(detalhes.hidden, true);
    assert.match(r.d.getElementById('configEstadoComponentes').textContent, /2 componentes/);
});

test('bolinha vermelha acompanha o nome da categoria obrigatória e some ao atender o requisito', async t => {
    const r = await abrir(t, { status: 'incompleta', selecionados: 1, total: 2,
        faltantes: [{ chave: 'quadro-garfo', nome: 'Garfo', categorias: ['quadro-garfo'] }], confirmar: [] });
    const quadro = r.d.querySelector('[data-obrigatorio="quadro"]');
    const garfo = r.d.querySelector('[data-obrigatorio="quadro-garfo"]');
    assert.equal(quadro.hidden, false); assert.equal(garfo.hidden, false);
    assert.equal(r.d.querySelector('[data-obrigatorio="quadro-amortecedor"]').hidden, true);
    assert.ok(quadro.closest('.config-nome-categoria'));
    assert.equal(r.d.querySelector('.config-obrigatorio-grupo').hidden, false);
    await r.selecionar();
    assert.equal(quadro.hidden, true); assert.equal(garfo.hidden, false);
    assert.match(garfo.getAttribute('aria-label'), /Garfo/);
    assert.equal(r.d.querySelector('[data-check="quadro"]').classList.contains('marcado'), true);
    r.w.fetch = async () => ({ ok: true, json: async () => ({ total: 0, avisos: [],
        completude: require('../models/completudeMontagem').avaliarCompletude([]) }) });
    r.d.getElementById('btnLimparConfig').click(); await esperar();
    assert.equal(quadro.hidden, false);
});

test('indicador distingue confirmação, itens selecionados e falha sem afirmar compatibilidade', async t => {
    for (const [status, confirmar, esperado] of [['confirmacao_necessaria', [{ nome: 'Tubeless' }], 'confirmacao'], ['itens_selecionados', [], 'selecionados']]) {
        const r = await abrir(t, { status, selecionados: 3, total: 3, faltantes: [], confirmar, observacao: 'A lista não certifica compatibilidade ou segurança.' });
        await r.selecionar(); const btn = r.d.getElementById('btnComponentesEssenciais');
        assert.equal(btn.dataset.estado, esperado); assert.equal(r.d.getElementById('configCompletude').hidden, true);
        if (esperado === 'selecionados') assert.match(btn.getAttribute('aria-label'), /não certifica compatibilidade/);
        r.d.getElementById('btnLimparConfig').click();
        assert.equal(btn.dataset.estado, 'incompleta');
    }
    const r = await abrir(t, null, true); await r.selecionar();
    assert.equal(r.d.getElementById('btnComponentesEssenciais').dataset.estado, 'indisponivel');
    assert.match(r.d.getElementById('configEstadoComponentes').textContent, /indisponível/);
});
