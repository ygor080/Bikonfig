const test = require('node:test');
const assert = require('node:assert/strict');
const { verificarGooglePublicado } = require('../scripts/verificarGooglePublicado');
function consultarFake(dominio = true) {
    return async (url, opcoes) => {
        if (url.endsWith('/login')) return new Response('<meta name="csrf-token" content="' + 'a'.repeat(64) + '"><button id="entrarGoogle">Google</button>', {
            headers: { 'set-cookie': 'bikonfig.sid=COOKIE_PRIVADO; HttpOnly', 'content-security-policy': "script-src 'self' https://apis.google.com; frame-src https://projeto.firebaseapp.com;" } });
        if (url.endsWith('/config')) return Response.json({ apiKey: 'CHAVE_PUBLICA_NAO_IMPRIMIR', projectId: 'projeto', authDomain: 'projeto.firebaseapp.com' });
        if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
            assert.equal(opcoes.headers, undefined); return Response.json({ authorizedDomains: dominio ? ['site.test'] : [] });
        }
        assert.equal(url, 'https://site.test/auth/firebase/google');
        assert.deepEqual(JSON.parse(opcoes.body), { idToken: 'diagnostico-token-invalido' });
        return opcoes.headers['x-csrf-token'] ? Response.json({ codigo: 'FIREBASE_TOKEN_INVALIDO' }, { status: 401 })
            : Response.json({}, { status: 403 });
    };
}
test('verificação pública valida configuração e proteções sem imprimir chave, cookie ou token CSRF', async () => {
    const r = await verificarGooglePublicado('https://site.test', consultarFake());
    assert.equal(r.aprovado, true); assert.equal(r.resultados.length, 5);
    for (const segredo of ['CHAVE_PUBLICA_NAO_IMPRIMIR', 'COOKIE_PRIVADO', 'a'.repeat(64)]) assert.ok(!JSON.stringify(r).includes(segredo));
    assert.match(r.limite, /Não comprova/);
});
test('domínio ausente, falha de rede e resposta insegura não passam a verificação', async () => {
    assert.equal((await verificarGooglePublicado('https://site.test', consultarFake(false))).aprovado, false);
    assert.equal((await verificarGooglePublicado('https://site.test', async () => { throw new Error('SEGREDO'); })).aprovado, false);
    await assert.rejects(verificarGooglePublicado('https://usuario:senha@site.test'));
    await assert.rejects(verificarGooglePublicado('https://site.test/?token=privado'));
});
