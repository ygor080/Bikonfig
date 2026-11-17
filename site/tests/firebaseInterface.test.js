const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('node:fs');
const path = require('node:path');
const { iniciar } = require('../client/firebaseAuthUi');

function pagina(t, cadastro = false, google = false) {
    const html = ejs.render(fs.readFileSync(path.join(__dirname, '../views/' + (cadastro ? 'cadastro' : 'login') + '.ejs'), 'utf8'),
        { erro: null, valores: {}, csrfToken: 'csrf-teste', firebaseUi: true, firebaseDisponivel: true });
    const dom = new JSDOM(html); t.after(() => dom.window.close());
    const doc = dom.window.document, form = doc.querySelector('form');
    if (!google) doc.getElementById('entrarGoogle').remove();
    form.elements.email.value = 'teste@exemplo.com'; form.elements.senha.value = 'Teste123!';
    if (cadastro) { form.elements.nome.value = 'Pessoa'; form.elements.confirmarSenha.value = 'Teste123!'; }
    return { doc, form, enviar: () => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })) };
}
const aguardar = () => new Promise(resolve => setImmediate(resolve));

test('interface usa e-mail, bloqueia envio duplicado e troca apenas token por sessão com CSRF', async t => {
    const p = pagina(t); let liberar, chamadas = [], destino;
    const pendente = new Promise(resolve => { liberar = resolve; });
    iniciar({ doc: p.doc, criarCliente: () => ({ entrar: async () => { await pendente; return { user: { getIdToken: async () => 'jwt' } }; }, sair: async () => {} }),
        consultar: async (url, opcoes) => { chamadas.push([url, opcoes]); return { ok: true, json: async () => ({}) }; }, navegar: url => { destino = url; } });
    p.enviar(); p.enviar(); await aguardar();
    assert.equal(p.form.getAttribute('aria-busy'), 'true'); assert.equal(chamadas.length, 1);
    liberar(); await aguardar();
    assert.equal(destino, '/home'); assert.equal(chamadas.length, 2);
    assert.deepEqual(JSON.parse(chamadas[1][1].body), { idToken: 'jwt' });
    assert.equal(chamadas[1][1].headers['x-csrf-token'], 'csrf-teste');
    assert.equal(p.form.hasAttribute('aria-busy'), false);
});

test('cadastro interrompido pode ser retomado com senha Firebase e envia apenas nome e token', async t => {
    const p = pagina(t, true); let autenticou = false, enviado;
    iniciar({ doc: p.doc, criarCliente: () => ({ cadastrar: async () => { throw { code: 'auth/email-already-in-use' }; },
        entrar: async () => { autenticou = true; return { user: { getIdToken: async () => 'jwt' } }; }, sair: async () => {} }),
        consultar: async (url, opcoes) => { if (opcoes.body) enviado = JSON.parse(opcoes.body); return { ok: true, json: async () => ({}) }; }, navegar: () => {} });
    p.enviar(); await aguardar();
    assert.equal(autenticou, true); assert.deepEqual(enviado, { idToken: 'jwt', nome: 'Pessoa' });
});

test('erro de credenciais é genérico, acessível e libera nova tentativa sem redirecionar', async t => {
    const p = pagina(t); let redirecionou = false;
    iniciar({ doc: p.doc, criarCliente: () => ({ entrar: async () => { throw { code: 'auth/user-not-found', message: '<script>segredo</script>' }; } }),
        consultar: async () => ({ ok: true, json: async () => ({}) }), navegar: () => { redirecionou = true; } });
    p.enviar(); await aguardar();
    assert.equal(p.doc.getElementById('erroFirebase').textContent, 'E-mail ou senha inválidos.');
    assert.equal(p.doc.activeElement.id, 'erroFirebase'); assert.equal(redirecionou, false);
    assert.equal(p.form.querySelector('[type="submit"]').disabled, false);
});

test('senha fraca ou confirmação divergente não acessa o Firebase', async t => {
    const p = pagina(t, true); let acessou = false;
    iniciar({ doc: p.doc, criarCliente: () => { acessou = true; }, consultar: async () => { acessou = true; } });
    p.form.elements.confirmarSenha.value = 'Outra123!'; p.enviar(); await aguardar();
    assert.equal(acessou, false); assert.equal(p.doc.getElementById('erroFirebase').hidden, false);
});


test('Google abre no clique sem validar campos de senha e envia só token com CSRF, bloqueando envios concorrentes', async t => {
    const p = pagina(t, false, true); let abrir = 0, liberar, destino, requisicao;
    p.form.elements.email.value = ''; p.form.elements.senha.value = '';
    const pendente = new Promise(resolve => { liberar = resolve; });
    iniciar({ doc: p.doc, criarCliente: () => ({ google: () => { abrir++; return pendente; }, sair: async () => {} }),
        consultar: async (url, opcoes) => { if (opcoes.body) requisicao = [url, opcoes]; return { ok: true, json: async () => ({}) }; },
        navegar: url => { destino = url; } });
    await aguardar();
    const google = p.doc.getElementById('entrarGoogle'); assert.equal(google.disabled, false);
    google.click(); assert.equal(abrir, 1); google.click(); p.enviar(); assert.equal(abrir, 1);
    assert.equal(p.form.querySelector('[type="submit"]').disabled, true);
    liberar({ user: { getIdToken: async () => 'token-google' } }); await aguardar();
    assert.equal(destino, '/home'); assert.equal(requisicao[0], '/auth/firebase/google');
    assert.deepEqual(JSON.parse(requisicao[1].body), { idToken: 'token-google' });
    assert.equal(requisicao[1].headers['x-csrf-token'], 'csrf-teste');
    assert.equal(p.form.getAttribute('aria-busy'), null);
});

test('cancelamento, popup bloqueado e conflito Google permitem tentar novamente e exibem mensagens seguras', async t => {
    for (const code of ['auth/popup-closed-by-user', 'auth/popup-blocked', 'auth/account-exists-with-different-credential', 'CADASTRO_CONFLITO']) {
        const p = pagina(t, true, true); let acessos = 0;
        iniciar({ doc: p.doc, criarCliente: () => ({ google: async () => { acessos++; if (code !== 'CADASTRO_CONFLITO') throw { code, message: '<script>segredo</script>' };
            return { user: { getIdToken: async () => 'jwt' } }; } }),
            consultar: async (url, opcoes) => opcoes.body ? { ok: false, status: 409, json: async () => ({ codigo: code }) } : { ok: true, json: async () => ({}) },
            navegar: () => assert.fail('Não deve navegar em falha') });
        await aguardar(); const b = p.doc.getElementById('entrarGoogle'); b.click(); await aguardar();
        assert.equal(b.disabled, false); assert.equal(p.doc.activeElement.id, 'erroFirebase');
        assert.ok(!p.doc.getElementById('erroFirebase').textContent.includes('segredo'));
        b.click(); await aguardar(); assert.equal(acessos, 2);
    }
});
