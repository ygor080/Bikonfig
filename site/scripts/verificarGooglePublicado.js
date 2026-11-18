// Verificação pública: não entra em contas, não cria usuários nem imprime tokens/chaves.
async function verificarGooglePublicado(endereco = 'https://bikonfig.onrender.com', consultar = fetch) {
    const origem = new URL(endereco);
    if (origem.username || origem.password || origem.search || origem.hash || !['', '/'].includes(origem.pathname)
        || !(origem.protocol === 'https:' || origem.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origem.hostname))) throw new Error('Origem inválida.');
    const resultados = [];
    const pedir = (url, opcoes = {}) => consultar(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...opcoes });
    try {
        const login = await pedir(origem.origin + '/login');
        const html = await login.text();
        const csrf = html.match(/name="csrf-token" content="([a-f0-9]{64})"/)?.[1];
        const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
        resultados.push({ verificacao: 'tela_google', aprovado: login.status === 200 && html.includes('id="entrarGoogle"') && !!csrf });
        const resposta = await pedir(origem.origin + '/auth/firebase/config');
        if (resposta.status !== 200) throw new Error('Configuração indisponível.');
        const config = await resposta.json();
        if (typeof config.apiKey !== 'string' || typeof config.projectId !== 'string'
            || typeof config.authDomain !== 'string' || !/^[a-z0-9.-]+$/.test(config.authDomain)) throw new Error('Configuração inválida.');
        const csp = login.headers.get('content-security-policy') || '';
        resultados.push({ verificacao: 'politica_popup', aprovado: csp.includes('https://apis.google.com')
            && csp.includes('frame-src https://' + config.authDomain + ';') && !csp.includes('unsafe-inline') });
        const projeto = await pedir('https://identitytoolkit.googleapis.com/v1/projects?key=' + encodeURIComponent(config.apiKey));
        const dados = await projeto.json();
        resultados.push({ verificacao: 'dominio_autorizado', aprovado: projeto.status === 200
            && Array.isArray(dados.authorizedDomains) && dados.authorizedDomains.includes(origem.hostname) });
        if (!csrf || !cookie) throw new Error('Sessão de verificação indisponível.');
        const opcoes = { method: 'POST', headers: { cookie, origin: origem.origin, 'content-type': 'application/json' },
            body: JSON.stringify({ idToken: 'diagnostico-token-invalido' }) };
        const semCsrf = await pedir(origem.origin + '/auth/firebase/google', opcoes);
        resultados.push({ verificacao: 'csrf_obrigatorio', aprovado: semCsrf.status === 403 });
        const invalido = await pedir(origem.origin + '/auth/firebase/google', {
            ...opcoes, headers: { ...opcoes.headers, 'x-csrf-token': csrf } });
        const erro = await invalido.json().catch(() => ({}));
        resultados.push({ verificacao: 'token_invalido_recusado', aprovado: invalido.status === 401
            && erro.codigo === 'FIREBASE_TOKEN_INVALIDO' && !invalido.headers.getSetCookie().some(c => /^bikonfig\.firebase=[^;]/.test(c)) });
    } catch {
        resultados.push({ verificacao: 'servicos_publicos', aprovado: false, erro: 'Verificação indisponível ou configuração inesperada.' });
    }
    return { destino: origem.origin, aprovado: resultados.every(r => r.aprovado), resultados,
        limite: 'Não comprova credencial privada, criação da sessão com uma conta real, logout ou montagens. Esses fluxos exigem validação autenticada.' };
}
if (require.main === module) verificarGooglePublicado(process.argv[2]).then(r => {
    console.log(JSON.stringify(r, null, 2)); process.exitCode = r.aprovado ? 0 : 1;
}).catch(() => { console.error('Use uma origem HTTPS válida, sem credenciais ou parâmetros.'); process.exitCode = 1; });
module.exports = { verificarGooglePublicado };
