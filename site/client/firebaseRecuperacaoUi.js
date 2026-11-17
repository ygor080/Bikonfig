const CONFIRMACAO = 'Se houver uma conta apta à recuperação com esse e-mail, você receberá instruções para redefinir a senha. Confira também a pasta de spam. Aguarde um minuto antes de solicitar novamente.';

function iniciarRecuperacao({ doc, obterCliente }) {
    const form = doc.querySelector('form[data-operacao="recuperar"]');
    const botao = form.querySelector('[type="submit"]');
    const erro = doc.getElementById('erroFirebase'), status = doc.getElementById('statusFirebase');
    let ocupado = false, aguardando = false;
    form.addEventListener('submit', async evento => {
        evento.preventDefault();
        if (ocupado || aguardando) return;
        erro.hidden = true; status.textContent = '';
        if (!form.reportValidity()) return;
        ocupado = true; botao.disabled = true; botao.textContent = 'Solicitando…'; form.setAttribute('aria-busy', 'true');
        try {
            const sdk = await obterCliente();
            try { await sdk.recuperar(form.elements.namedItem('email').value.trim()); }
            catch (e) {
                // A resposta visível não confirma se o e-mail existe ou está desabilitado.
                if (!['auth/user-not-found', 'auth/user-disabled'].includes(e.code)) throw e;
            }
            status.textContent = CONFIRMACAO; status.focus(); aguardando = true;
            botao.textContent = 'Aguarde um minuto para reenviar';
            doc.defaultView.setTimeout(() => {
                aguardando = false; botao.disabled = false; botao.textContent = 'Enviar instruções';
            }, 60000);
        } catch (e) {
            const mensagens = {
                'auth/invalid-email': 'Informe um e-mail válido.',
                'auth/network-request-failed': 'Não foi possível conectar. Confira sua conexão e tente novamente.',
                'auth/too-many-requests': 'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.'
            };
            erro.textContent = mensagens[e.code] || 'Não foi possível solicitar a recuperação agora. Tente novamente mais tarde.';
            erro.hidden = false; erro.focus();
        } finally {
            ocupado = false; form.removeAttribute('aria-busy');
            if (!aguardando) { botao.disabled = false; botao.textContent = 'Enviar instruções'; }
        }
    });
    botao.disabled = false;
}
module.exports = { iniciarRecuperacao, CONFIRMACAO };
