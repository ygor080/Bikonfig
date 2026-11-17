function iniciarGoogle({ doc, obterCliente, consultar, navegar }) {
    const botao = doc.getElementById('entrarGoogle');
    if (!botao) return;
    const form = doc.querySelector('form.form-login');
    const enviar = form.querySelector('[type="submit"]');
    const erro = doc.getElementById('erroFirebase'), status = doc.getElementById('statusFirebase');
    let sdk;
    const mostrarErro = mensagem => { erro.textContent = mensagem; erro.hidden = false; erro.focus(); };
    // Pré-carrega antes do clique: o popup precisa abrir durante o gesto do usuário.
    obterCliente().then(cliente => { sdk = cliente; botao.disabled = false; }).catch(() => {
        botao.disabled = false;
        mostrarErro('Não foi possível preparar o acesso Google. Clique no botão para tentar novamente.');
    });
    botao.addEventListener('click', async () => {
        if (form.dataset.authBusy === 'true') return;
        erro.hidden = true;
        form.dataset.authBusy = 'true'; form.setAttribute('aria-busy', 'true');
        botao.disabled = true; enviar.disabled = true; status.textContent = 'Conectando ao Google…';
        try {
            if (!sdk) {
                sdk = await obterCliente();
                status.textContent = 'Tudo pronto. Clique em Entrar com Google novamente.';
                return;
            }
            const credencial = await sdk.google();
            const idToken = await credencial.user.getIdToken();
            const resposta = await consultar('/auth/firebase/google', {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json',
                    'x-csrf-token': doc.querySelector('meta[name="csrf-token"]').content },
                body: JSON.stringify({ idToken })
            });
            if (!resposta.ok) {
                const dados = await resposta.json().catch(() => ({}));
                throw Object.assign(new Error('servidor'), { code: dados.codigo || (resposta.status === 403 ? 'CSRF' : 'SERVIDOR') });
            }
            await sdk.sair().catch(() => {});
            status.textContent = 'Acesso autorizado. Abrindo sua conta…'; navegar('/home');
        } catch (e) {
            const mensagens = {
                'auth/popup-closed-by-user': 'A janela do Google foi fechada. Você pode tentar novamente.',
                'auth/cancelled-popup-request': 'O acesso Google foi cancelado. Tente novamente.',
                'auth/popup-blocked': 'Seu navegador bloqueou a janela. Permita popups para este site e tente novamente.',
                'auth/unauthorized-domain': 'Este domínio ainda não está autorizado no Firebase. Avise o responsável pelo site.',
                'auth/operation-not-allowed': 'O acesso Google ainda não está habilitado no Firebase.',
                'auth/account-exists-with-different-credential': 'Este e-mail usa outra forma de acesso. Entre pelo método original; as contas não serão vinculadas automaticamente.',
                'auth/network-request-failed': 'Não foi possível conectar. Confira sua conexão e tente novamente.',
                'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
                CADASTRO_CONFLITO: 'Já existe uma conta com esses dados. Entre com seu usuário e senha. O Google não será vinculado automaticamente.',
                CSRF: 'A página expirou. Atualize antes de tentar novamente.'
            };
            status.textContent = ''; mostrarErro(mensagens[e.code] || 'Não foi possível entrar com Google agora. Tente novamente em alguns instantes.');
        } finally {
            delete form.dataset.authBusy; form.removeAttribute('aria-busy'); botao.disabled = false; enviar.disabled = false;
        }
    });
}
module.exports = { iniciarGoogle };
