const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const { iniciar } = require('../client/firebaseAuthUi');
const esperar = () => new Promise(resolve => setImmediate(resolve));
function pagina(t, disponivel = true) {
    const html = ejs.render(fs.readFileSync(path.join(__dirname, '../views/migrarConta.ejs'), 'utf8'),
        { csrfToken: 'csrf-teste', firebaseDisponivel: disponivel });
    const dom = new JSDOM(html); t.after(() => dom.window.close());
    const doc = dom.window.document, form = doc.querySelector('form');
    if (form) {
        form.elements.usuario.value = 'antigo'; form.elements.senha.value = 'SenhaAntiga123!';
        form.elements.consentimento.checked = true; form.elements.email.value = 'pessoa@teste.com';
        form.elements.firebaseSenha.value = 'SenhaNova123!'; form.elements.confirmarFirebase.value = 'SenhaNova123!';
    }
    return { doc, form, enviar: () => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })),
        marcarExistente: () => { form.elements.existente.checked = true; form.elements.existente.dispatchEvent(new dom.window.Event('change')); } };
}

test('migração cria acesso Firebase e envia senha antiga apenas à rota de vínculo, sem IDs ou permissões', async t => {
    const p = pagina(t); let credenciais, corpo, destino;
    iniciar({ doc: p.doc, criarCliente: () => ({ cadastrar: async (...args) => { credenciais = args; return { user: { getIdToken: async () => 'jwt' } }; }, sair: async () => {} }),
        consultar: async (url, opcoes) => { if (opcoes.body) { assert.equal(url, '/auth/firebase/link'); assert.equal(opcoes.headers['x-csrf-token'], 'csrf-teste'); corpo = JSON.parse(opcoes.body); }
            return { ok: true, json: async () => ({}) }; }, navegar: url => { destino = url; } });
    p.enviar(); await esperar();
    assert.deepEqual(credenciais, ['pessoa@teste.com', 'SenhaNova123!']);
    assert.deepEqual(corpo, { idToken: 'jwt', usuario: 'antigo', senha: 'SenhaAntiga123!' });
    assert.equal(destino, '/home'); assert.equal(p.form.elements.senha.value, '');
});

test('migração retoma acesso Firebase existente sem tentar recriar a identidade', async t => {
    const p = pagina(t); p.marcarExistente(); let entrou = false;
    iniciar({ doc: p.doc, criarCliente: () => ({ entrar: async () => { entrou = true; return { user: { getIdToken: async () => 'jwt' } }; },
        cadastrar: () => assert.fail('Não deve criar outra identidade'), sair: async () => {} }),
        consultar: async () => ({ ok: true, json: async () => ({}) }), navegar: () => {} });
    p.enviar(); await esperar(); assert.equal(entrou, true);
});

test('Google exige consentimento e senha antiga, dispensa senha Firebase e bloqueia duplicados', async t => {
    const p = pagina(t); p.form.elements.email.value = ''; p.form.elements.firebaseSenha.value = ''; p.form.elements.confirmarFirebase.value = '';
    let abriu = 0, liberar;
    const pendente = new Promise(resolve => { liberar = resolve; });
    iniciar({ doc: p.doc, criarCliente: () => ({ google: () => { abriu++; return pendente; }, sair: async () => {} }),
        consultar: async () => ({ ok: true, json: async () => ({}) }), navegar: () => {} });
    await esperar(); const google = p.doc.getElementById('migrarGoogle');
    p.form.elements.consentimento.checked = false; google.click(); assert.equal(abriu, 0);
    p.form.elements.consentimento.checked = true; google.click(); assert.equal(abriu, 1);
    google.click(); p.enviar(); assert.equal(abriu, 1);
    liberar({ user: { getIdToken: async () => 'jwt' } }); await esperar(); assert.equal(p.form.hasAttribute('aria-busy'), false);
});

test('falha de vínculo informa conflito sem interpretar HTML e permite nova tentativa', async t => {
    const p = pagina(t); p.marcarExistente(); let tentativas = 0;
    iniciar({ doc: p.doc, criarCliente: () => ({ entrar: async () => { tentativas++; return { user: { getIdToken: async () => 'jwt' } }; } }),
        consultar: async (url, opcoes) => opcoes.body ? { ok: false, status: 409, json: async () => ({ codigo: 'MIGRACAO_RECUSADA', erro: '<script>segredo</script>' }) }
            : { ok: true, json: async () => ({}) }, navegar: () => assert.fail('Não deve navegar') });
    p.enviar(); await esperar(); assert.equal(p.doc.activeElement.id, 'erroFirebase');
    assert.ok(!p.doc.getElementById('erroFirebase').textContent.includes('segredo'));
    p.enviar(); await esperar(); assert.equal(tentativas, 2);
});

test('modo desabilitado não oferece formulário de migração nem carrega SDK', t => {
    const p = pagina(t, false); assert.equal(p.form, null); assert.equal(p.doc.querySelector('script'), null);
});


test('e-mail não confirmado solicita verificação e mantém a conta antiga sem enviar vínculo', async t => {
    const p = pagina(t); let verificou = false;
    iniciar({ doc: p.doc, criarCliente: () => ({ cadastrar: async () => ({ user: { emailVerified: false } }), verificarEmail: async () => { verificou = true; } }),
        consultar: async (url, opcoes) => { assert.ok(!opcoes.body); return { ok: true, json: async () => ({}) }; }, navegar: () => assert.fail('Não deve navegar') });
    p.enviar(); await esperar(); assert.equal(verificou, true);
    assert.match(p.doc.getElementById('statusFirebase').textContent, /Confirme seu e-mail/);
    assert.equal(p.form.elements.existente.checked, true);
});
