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
    form.elements.usuario ? form.elements.usuario.value = 'pessoa' : form.elements.nome.value = 'Pessoa'; form.elements.senha.value = 'Teste123!';
    if (cadastro) { form.elements.email.value = 'teste@exemplo.com'; form.elements.confirmarSenha.value = 'Teste123!'; }
    return { doc, form, enviar: () => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })) };
}
const aguardar = () => new Promise(resolve => setImmediate(resolve));

test('Google abre no clique sem validar campos de senha e envia só token com CSRF, bloqueando envios concorrentes', async t => {
    const p = pagina(t, false, true); let abrir = 0, liberar, destino, requisicao;
    p.form.elements.usuario.value = ''; p.form.elements.senha.value = '';
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

test('falhas do servidor exibem diagnóstico específico sem expor o corpo bruto', async t => {
    for (const codigo of ['FIREBASE_BANCO_NAO_CONFIGURADO', 'FIREBASE_CREDENCIAL_INVALIDA', 'FIREBASE_SESSAO_INDISPONIVEL']) {
        const p = pagina(t, false, true);
        iniciar({ doc: p.doc, criarCliente: () => ({ google: async () => ({ user: { getIdToken: async () => 'jwt' } }) }),
            consultar: async (url, opcoes) => opcoes.body ? { ok: false, status: 503, json: async () => ({ codigo, erro: 'SEGREDO' }) }
                : { ok: true, json: async () => ({}) }, navegar: () => assert.fail('Não deve navegar') });
        await aguardar(); p.doc.getElementById('entrarGoogle').click(); await aguardar();
        assert.ok(p.doc.getElementById('erroFirebase').textContent.includes(codigo));
        assert.ok(!p.doc.getElementById('erroFirebase').textContent.includes('SEGREDO'));
    }
});

test('conflito de conta local oferece acesso original e troca de Google sem expor dados ou associar contas', async t => {
    for (const cadastro of [false, true]) {
        const p = pagina(t, cadastro, true); let saiu = 0, destino, acessos = 0;
        iniciar({ doc: p.doc, criarCliente: () => ({ google: async () => { acessos++; return { user: { getIdToken: async () => 'jwt' } }; }, sair: async () => { saiu++; } }),
            consultar: async (url, opcoes) => opcoes.body ? { ok: false, status: 409, json: async () => ({ codigo: 'CONTA_LOCAL_EXISTENTE', email: 'NAO_MOSTRAR' }) }
                : { ok: true, json: async () => ({}) }, navegar: url => { destino = url; } });
        await aguardar(); p.doc.getElementById('entrarGoogle').click(); await aguardar();
        assert.equal(p.doc.getElementById('ajudaConflitoGoogle').hidden, false);
        assert.match(p.doc.getElementById('erroFirebase').textContent, /usuário original/);
        assert.ok(!p.doc.body.textContent.includes('NAO_MOSTRAR')); assert.equal(saiu, 1);
        p.doc.getElementById('usarAcessoLocal').click();
        if (cadastro) assert.equal(destino, '/login#usuario'); else assert.equal(p.doc.activeElement.id, 'usuario');
        p.doc.getElementById('trocarContaGoogle').click(); await aguardar(); assert.equal(acessos, 2);
    }
});
