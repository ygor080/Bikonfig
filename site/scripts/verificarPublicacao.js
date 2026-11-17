const DESTINO = 'https://bikonfig.onrender.com';
async function verificarPublicacao(endereco = DESTINO, consultar = fetch) {
    const url = new URL(endereco);
    if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)
        || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        throw new Error('Use uma origem HTTPS sem credenciais, caminho ou parâmetros.');
    }
    const resultados = [];
    for (const [caminho, esperado] of [['/healthz', 200], ['/login', 200], ['/css/estilo.css', 200],
        ['/js/configurador.js', 200], ['/catalogo', 302], ['/admin/qualidade', 302], ['/logout', 405]]) {
        try {
            const res = await consultar(url.origin + caminho, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
            const texto = await res.text();
            let ok = res.status === esperado;
            if (caminho === '/healthz') ok &&= JSON.parse(texto).status === 'ok' && !res.headers.get('set-cookie');
            if (esperado === 302) ok &&= res.headers.get('location') === '/login';
            if (caminho === '/login') ok &&= /name="csrf-token" content="[a-f0-9]{64}"/.test(texto)
                && !!res.headers.get('content-security-policy') && res.headers.get('x-content-type-options') === 'nosniff';
            if (caminho === '/login') {
                const cookie = res.headers.get('set-cookie') || '';
                ok &&= /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)
                    && (url.protocol !== 'https:' || /; Secure/i.test(cookie));
            }
            if (caminho === '/logout') ok &&= res.headers.get('allow') === 'POST';
            resultados.push({ caminho, status: res.status, aprovado: ok });
        } catch { resultados.push({ caminho, aprovado: false, erro: 'Falha de rede ou resposta inesperada.' }); }
    }
    return { destino: url.origin, aprovado: resultados.every(r => r.aprovado), resultados };
}
if (require.main === module) {
    verificarPublicacao(process.argv[2]).then(resultado => {
        console.log(JSON.stringify(resultado, null, 2)); process.exitCode = resultado.aprovado ? 0 : 1;
    }).catch(() => { console.error('Endereço inválido ou verificação indisponível.'); process.exitCode = 1; });
}
module.exports = { verificarPublicacao };
