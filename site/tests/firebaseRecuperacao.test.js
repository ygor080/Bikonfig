const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const { iniciar } = require('../client/firebaseAuthUi');
const { CONFIRMACAO } = require('../client/firebaseRecuperacaoUi');
const esperar = () => new Promise(resolve => setImmediate(resolve));
function pagina(t, disponivel = true) {
    const html = ejs.render(fs.readFileSync(path.join(__dirname, '../views/recuperarSenha.ejs'), 'utf8'),
        { csrfToken: 'csrf-teste', firebaseDisponivel: disponivel });
    const dom = new JSDOM(html); t.after(() => dom.window.close());
    const doc = dom.window.document, form = doc.querySelector('form');
    if (form) form.elements.email.value = 'pessoa@exemplo.com';
    return { doc, form, enviar: () => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })) };
}

test('recuperação envia só e-mail ao SDK sem autenticar, bloqueia duplicados e permite reenvio após intervalo', async t => {
    const p = pagina(t); let liberar, chamadas = [], timer;
    p.doc.defaultView.setTimeout = (fn, ms) => { timer = fn; assert.equal(ms, 60000); };
    const pendente = new Promise(resolve => { liberar = resolve; });
    iniciar({ doc: p.doc, criarCliente: () => ({ recuperar: async email => { chamadas.push(email); await pendente; } }),
        consultar: async (url, opcoes) => { assert.equal(url, '/auth/firebase/config'); assert.equal(opcoes.method, undefined); return { ok: true, json: async () => ({}) }; },
        navegar: () => assert.fail('Não deve iniciar sessão ou navegar') });
    p.enviar(); p.enviar(); await esperar(); assert.equal(chamadas.length, 1);
    assert.equal(p.form.getAttribute('aria-busy'), 'true'); liberar(); await esperar();
    assert.equal(p.doc.getElementById('statusFirebase').textContent, CONFIRMACAO);
    assert.equal(p.doc.activeElement.id, 'statusFirebase');
    p.enviar(); await esperar(); assert.equal(chamadas.length, 1);
    timer(); p.enviar(); await esperar(); assert.deepEqual(chamadas, ['pessoa@exemplo.com', 'pessoa@exemplo.com']);
});

test('e-mail existente, inexistente e conta desabilitada recebem a mesma confirmação', async t => {
    for (const code of [null, 'auth/user-not-found', 'auth/user-disabled']) {
        const p = pagina(t);
        iniciar({ doc: p.doc, criarCliente: () => ({ recuperar: async () => { if (code) throw { code, message: 'informação privada' }; } }),
            consultar: async () => ({ ok: true, json: async () => ({}) }) });
        p.enviar(); await esperar();
        assert.equal(p.doc.getElementById('statusFirebase').textContent, CONFIRMACAO);
        assert.equal(p.doc.getElementById('erroFirebase').hidden, true);
    }
});

test('e-mail inválido não consulta o SDK nem a configuração', async t => {
    const p = pagina(t); p.form.elements.email.value = 'invalido';
    iniciar({ doc: p.doc, criarCliente: () => assert.fail('SDK não deve ser chamado'), consultar: () => assert.fail('Configuração não deve ser consultada') });
    p.enviar(); await esperar(); assert.equal(p.form.querySelector('button').disabled, false);
});

test('falhas de rede, limite e indisponibilidade são acessíveis e permitem nova tentativa sem expor detalhes', async t => {
    for (const code of ['auth/network-request-failed', 'auth/too-many-requests', 'auth/internal-error']) {
        const p = pagina(t); let chamadas = 0;
        iniciar({ doc: p.doc, criarCliente: () => ({ recuperar: async () => { chamadas++; throw { code, message: '<script>segredo</script>' }; } }),
            consultar: async () => ({ ok: true, json: async () => ({}) }) });
        p.enviar(); await esperar();
        assert.equal(p.doc.activeElement.id, 'erroFirebase'); assert.equal(p.form.querySelector('button').disabled, false);
        assert.ok(!p.doc.getElementById('erroFirebase').textContent.includes('segredo'));
        assert.equal(p.form.hasAttribute('aria-busy'), false); p.enviar(); await esperar(); assert.equal(chamadas, 2);
    }
});

test('configuração indisponível pode ser carregada novamente sem recarregar a página', async t => {
    const p = pagina(t); let buscas = 0, recuperou = false;
    iniciar({ doc: p.doc, criarCliente: () => ({ recuperar: async () => { recuperou = true; } }),
        consultar: async () => ({ ok: ++buscas > 1, json: async () => ({}) }) });
    p.enviar(); await esperar(); assert.equal(recuperou, false);
    p.enviar(); await esperar(); assert.equal(recuperou, true); assert.equal(buscas, 2);
});

test('modo desabilitado explica a limitação das contas antigas e não carrega formulário ou SDK', t => {
    const p = pagina(t, false); assert.equal(p.form, null); assert.equal(p.doc.querySelector('script'), null);
    assert.match(p.doc.body.textContent, /ainda não está disponível/);
    assert.match(p.doc.body.textContent, /Contas com usuário e senha/);
});
