const test = require('node:test');
const assert = require('node:assert/strict');
const { verificarPublicacao } = require('../scripts/verificarPublicacao');

test('verificação pública detecta cookies inseguros e não inclui corpo ou segredos no relatório', async () => {
    const segredo = 'valor-que-nao-deve-ser-publicado';
    const resposta = async url => {
        const caminho = new URL(url).pathname;
        if (caminho === '/healthz') return new Response('{"status":"ok"}');
        if (caminho === '/catalogo' || caminho === '/admin/qualidade') return new Response('', { status: 302, headers: { location: '/login' } });
        if (caminho === '/logout') return new Response('', { status: 405, headers: { allow: 'POST' } });
        if (caminho === '/login') return new Response('<meta name="csrf-token" content="' + 'a'.repeat(64) + '">' + segredo,
            { headers: { 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff', 'set-cookie': 'sid=' + segredo + '; HttpOnly; SameSite=Lax' } });
        return new Response('');
    };
    const resultado = await verificarPublicacao('https://bikonfig.test', resposta);
    assert.equal(resultado.aprovado, false);
    assert.equal(resultado.resultados.find(r => r.caminho === '/login').aprovado, false);
    assert.ok(!JSON.stringify(resultado).includes(segredo));
});

test('verificação pública rejeita destinos com credenciais ou parâmetros e relata falha de rede', async () => {
    for (const url of ['https://usuario:senha@bikonfig.test', 'https://bikonfig.test?token=1', 'http://bikonfig.test', 'https://bikonfig.test/login']) {
        await assert.rejects(verificarPublicacao(url, () => assert.fail('Não deve consultar')));
    }
    const resultado = await verificarPublicacao('https://bikonfig.test', async () => { throw new Error('segredo'); });
    assert.equal(resultado.aprovado, false); assert.equal(resultado.resultados.length, 7);
    assert.ok(!JSON.stringify(resultado).includes('segredo'));
});
