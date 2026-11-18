const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
test('link local retira o token do endereço e só habilita troca com token de formato válido', async t => {
    for (const token of ['a'.repeat(64), 'invalido']) {
        const html = ejs.render(fs.readFileSync(require.resolve('../views/senhaLocal.ejs'), 'utf8'), {
            habilitado: true, etapa: 'redefinir', erro: null, mensagem: null, token: '', csrfToken: 'csrf' });
        const dom = new JSDOM(html, { url: 'https://site.test/redefinir-senha#' + token, runScripts: 'dangerously' });
        t.after(() => dom.window.close());
        dom.window.eval(fs.readFileSync(require.resolve('../public/js/senha-local.js'), 'utf8'));
        await new Promise(r => dom.window.document.addEventListener('DOMContentLoaded', r, { once: true }));
        assert.equal(dom.window.location.hash, '');
        assert.equal(dom.window.document.getElementById('confirmarRedefinicao').disabled, token==='invalido');
    }
});
