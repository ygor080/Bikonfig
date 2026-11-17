// Controlador separado do SDK para testar o fluxo sem acessar contas reais.
function iniciar({ doc = document, criarCliente, consultar = fetch, navegar = url => location.assign(url) }) {
    const form = doc.querySelector('form[data-firebase="true"]');
    if (!form) return;
    const botao = form.querySelector('[type="submit"]');
    const erro = doc.getElementById('erroFirebase');
    const status = doc.getElementById('statusFirebase');
    const cadastro = form.dataset.operacao === 'cadastro';
    const rotulo = botao.textContent;
    let ocupado = false, clientePromise;
    const campo = nome => form.elements.namedItem(nome).value;
    const mostrarErro = mensagem => { erro.textContent = mensagem; erro.hidden = false; erro.focus(); };
    async function cliente() {
        if (!clientePromise) clientePromise = (async () => {
            const resposta = await consultar('/auth/firebase/config', { credentials: 'same-origin' });
            if (!resposta.ok) throw new Error('config');
            return criarCliente(await resposta.json());
        })().catch(e => { clientePromise = null; throw e; });
        return clientePromise;
    }
    form.addEventListener('submit', async evento => {
        evento.preventDefault();
        if (ocupado || form.dataset.authBusy === 'true') return;
        erro.hidden = true;
        if (!form.reportValidity()) return;
        const senha = campo('senha');
        if (cadastro && (!/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/s.test(senha)
            || senha !== campo('confirmarSenha'))) {
            mostrarErro('Confira os requisitos da senha e a confirmação.'); return;
        }
        ocupado = true; form.dataset.authBusy = 'true'; botao.disabled = true; form.setAttribute('aria-busy', 'true');
        botao.textContent = cadastro ? 'Criando conta…' : 'Entrando…'; status.textContent = botao.textContent;
        try {
            const sdk = await cliente();
            let credencial;
            if (cadastro) {
                try { credencial = await sdk.cadastrar(campo('email').trim(), senha); }
                catch (e) {
                    // Permite retomar um cadastro interrompido comprovando a senha Firebase.
                    if (e.code !== 'auth/email-already-in-use') throw e;
                    credencial = await sdk.entrar(campo('email').trim(), senha);
                }
            } else credencial = await sdk.entrar(campo('email').trim(), senha);
            const idToken = await credencial.user.getIdToken();
            const resposta = await consultar('/auth/firebase/' + (cadastro ? 'register' : 'session'), {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json',
                    'x-csrf-token': doc.querySelector('meta[name="csrf-token"]').content },
                body: JSON.stringify({ idToken, ...(cadastro ? { nome: campo('nome').trim() } : {}) })
            });
            if (!resposta.ok) {
                const dados = await resposta.json().catch(() => ({}));
                throw Object.assign(new Error('servidor'), { code: dados.codigo || (resposta.status === 403 ? 'CSRF' : 'SERVIDOR') });
            }
            await sdk.sair().catch(() => {});
            status.textContent = 'Acesso autorizado. Abrindo sua conta…'; navegar('/home');
        } catch (e) {
            const mensagens = {
                'auth/invalid-credential': 'E-mail ou senha inválidos.', 'auth/wrong-password': 'E-mail ou senha inválidos.',
                'auth/user-not-found': 'E-mail ou senha inválidos.', 'auth/invalid-email': 'Informe um e-mail válido.',
                'auth/weak-password': 'A senha não atende à política do projeto. Escolha uma senha mais forte.',
                'auth/password-does-not-meet-requirements': 'A senha não atende à política do projeto. Escolha uma senha mais forte.',
                'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
                'auth/network-request-failed': 'Não foi possível conectar. Confira sua conexão e tente novamente.',
                CONTA_NAO_VINCULADA: 'Esta conta ainda não foi vinculada. Se você já usava o Bikonfig, utilize o acesso anterior.',
                CADASTRO_CONFLITO: 'Não foi possível concluir com esses dados. Tente outro usuário ou utilize o acesso anterior se já tinha uma conta.',
                CSRF: 'A página expirou. Atualize antes de tentar novamente.'
            };
            status.textContent = ''; mostrarErro(mensagens[e.code] || 'Não foi possível concluir agora. Tente novamente em alguns instantes.');
        } finally { ocupado = false; delete form.dataset.authBusy; botao.disabled = false; botao.textContent = rotulo; form.removeAttribute('aria-busy'); }
    });
    botao.disabled = false;
    require('./firebaseGoogleUi').iniciarGoogle({ doc, obterCliente: cliente, consultar, navegar });
}
module.exports = { iniciar };
