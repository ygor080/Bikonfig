function iniciarGoogle({ doc, obterCliente, consultar, navegar }) {
    const botao = doc.getElementById('entrarGoogle');
    if (!botao) return;
    const form = doc.querySelector('form.form-login');
    const enviar = form.querySelector('[type="submit"]');
    const erro = doc.getElementById('erroFirebase'), status = doc.getElementById('statusFirebase');
    const ajuda = doc.getElementById('ajudaConflitoGoogle');
    doc.getElementById('usarAcessoLocal')?.addEventListener('click', () => {
        const usuario = form.elements.namedItem('usuario');
        if (usuario) { usuario.focus(); usuario.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
        else navegar('/login#usuario');
    });
    doc.getElementById('trocarContaGoogle')?.addEventListener('click', () => botao.click());
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
        if (ajuda) ajuda.hidden = true;
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
                throw Object.assign(new Error('servidor'), { code: dados.codigo || (resposta.status === 403 ? 'CSRF' : resposta.status === 429 ? 'MUITAS_TENTATIVAS' : 'SERVIDOR') });
            }
            await sdk.sair().catch(() => {});
            status.textContent = 'Acesso autorizado. Abrindo sua conta…'; navegar('/home');
        } catch (e) {
            try { await sdk?.sair?.(); } catch { /* Não substitui o erro original por falha de limpeza. */ }
            if (ajuda) ajuda.hidden = !['CONTA_LOCAL_EXISTENTE', 'CADASTRO_CONFLITO', 'auth/account-exists-with-different-credential'].includes(e.code);
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
                CONTA_LOCAL_EXISTENTE: 'Esse e-mail já pertence a uma conta com usuário e senha. Use seu usuário original ou selecione outra conta Google. Suas montagens continuam na conta original.',
                FIREBASE_BANCO_NAO_CONFIGURADO: 'O acesso Google ainda precisa ser configurado no servidor (código: FIREBASE_BANCO_NAO_CONFIGURADO). Avise o responsável pelo site.',
                FIREBASE_BANCO_INDISPONIVEL: 'Não foi possível consultar sua conta no servidor (código: FIREBASE_BANCO_INDISPONIVEL). Tente novamente mais tarde.',
                FIREBASE_CREDENCIAL_INVALIDA: 'O servidor não conseguiu validar o acesso Google (código: FIREBASE_CREDENCIAL_INVALIDA). Avise o responsável pelo site.',
                FIREBASE_SESSAO_INDISPONIVEL: 'O servidor não conseguiu salvar sua sessão (código: FIREBASE_SESSAO_INDISPONIVEL). Tente novamente mais tarde.',
                FIREBASE_INDISPONIVEL: 'Não foi possível comunicar com o serviço de autenticação (código: FIREBASE_INDISPONIVEL). Tente novamente mais tarde.',
                FIREBASE_TOKEN_INVALIDO: 'Não foi possível validar o acesso. Atualize a página e selecione sua conta Google novamente.',
                LOGIN_RECENTE_NECESSARIO: 'Selecione sua conta Google novamente para autorizar um acesso recente.',
                FIREBASE_DESABILITADO: 'O acesso Google está desabilitado no servidor. Avise o responsável pelo site.',
                GOOGLE_IDENTIDADE_INVALIDA: 'Selecione uma conta Google com e-mail confirmado.',
                MUITAS_TENTATIVAS: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.',
                CSRF: 'A página expirou. Atualize antes de tentar novamente.'
            };
            const codigo = typeof e.code === 'string' && /^auth\/[a-z0-9.-]{1,70}$/.test(e.code) ? e.code : 'GOOGLE_ERRO_DESCONHECIDO';
            status.textContent = ''; mostrarErro(mensagens[e.code] || `Não foi possível entrar com Google (código: ${codigo}). Tente novamente e informe esse código ao responsável pelo site.`);
        } finally {
            delete form.dataset.authBusy; form.removeAttribute('aria-busy'); botao.disabled = false; enviar.disabled = false;
        }
    });
}
module.exports = { iniciarGoogle };
