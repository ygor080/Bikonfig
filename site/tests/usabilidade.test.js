const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const codigo = nome => fs.readFileSync(require.resolve('../public/js/' + nome), 'utf8');
const esperar = () => new Promise(resolve => setImmediate(resolve));

async function abrir(t, configurador = false) {
    const html = configurador ? ejs.render(fs.readFileSync(require.resolve('../views/configurador.ejs'), 'utf8'), {
        usuario: { nome: 'Teste' }, categorias: [{ slug: 'quadro', nome: 'Quadro', subcategorias: [{ slug: 'quadro', nome: 'Quadro' }] }]
    }) : '<main><button id="origem">Abrir</button></main><button id="menuToggle" aria-expanded="false">Menu</button><nav id="navPrincipal"><a href="/home">Home</a></nav>';
    const dom = new JSDOM(html, { url: 'https://bikonfig.test/catalogo/configurador', runScripts: 'dangerously', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.eval(codigo('app'));
    if (configurador) {
        w.eval(codigo('conteudo-seguro'));
        w.eval(codigo('configurador'));
    }
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    await esperar();
    return w;
}

test('diálogo identifica seu título, contém o foco, bloqueia fundo e devolve foco ao fechar', async t => {
    const w = await abrir(t); const d = w.document;
    d.getElementById('origem').focus();
    const promessa = w.Bikonfig.confirmDialog({ titulo: 'Excluir montagem', perigo: true });
    const modal = d.querySelector('[role="dialog"]');
    assert.equal(d.getElementById(modal.getAttribute('aria-labelledby')).textContent, 'Excluir montagem');
    assert.equal(d.querySelector('main').inert, true);
    assert.equal(d.body.style.overflow, 'hidden');
    const cancelar = modal.querySelector('[data-acao="cancelar"]'), confirmar = modal.querySelector('[data-acao="confirmar"]');
    assert.equal(d.activeElement, cancelar);
    cancelar.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(d.activeElement, confirmar);
    confirmar.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(d.activeElement, cancelar);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(await promessa, false);
    assert.equal(d.activeElement.id, 'origem');
    assert.ok(!d.querySelector('main').inert); assert.equal(d.body.style.overflow, '');
});

test('prompt limita nome e Enter no botão cancelar não salva o formulário', async t => {
    const w = await abrir(t); const d = w.document;
    const promessa = w.Bikonfig.promptDialog({ titulo: 'Salvar montagem', valorInicial: 'Minha bike', maxLength: 100 });
    const input = d.querySelector('.bk-modal__input'); assert.equal(input.maxLength, 100); assert.equal(d.activeElement, input);
    const cancelar = d.querySelector('[data-acao="cancelar"]'); cancelar.focus();
    cancelar.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    cancelar.click(); assert.equal(await promessa, null);
});

test('menu fecha com Escape e restaura foco no botão de abertura', async t => {
    const w = await abrir(t); const d = w.document; const toggle = d.getElementById('menuToggle');
    toggle.click(); assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    d.querySelector('#navPrincipal a').focus();
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false'); assert.equal(d.activeElement, toggle);
});

test('categorias sincronizam expansão e visibilidade; atalhos apontam para seções existentes', async t => {
    const w = await abrir(t, true); const d = w.document;
    const btn = d.querySelector('.config-grupo-btn'); const lista = d.getElementById(btn.getAttribute('aria-controls'));
    assert.equal(btn.getAttribute('aria-expanded'), 'true'); assert.equal(lista.hidden, false);
    btn.click(); assert.equal(btn.getAttribute('aria-expanded'), 'false'); assert.equal(lista.hidden, true);
    btn.click(); assert.equal(lista.hidden, false);
    for (const link of d.querySelectorAll('.config-atalhos a')) assert.ok(d.querySelector(link.getAttribute('href')));
    assert.ok(d.getElementById('btnSalvarConfig').classList.contains('btn-principal'));
    assert.ok(!d.getElementById('btnLimparConfig').classList.contains('btn-principal'));
});
