function iniciarMigracao({ doc, obterCliente, consultar, navegar }) {
    const form = doc.querySelector('form[data-operacao="migrar"]');
    const enviar = form.querySelector('[type="submit"]'), google = doc.getElementById('migrarGoogle');
    const erro = doc.getElementById('erroFirebase'), status = doc.getElementById('statusFirebase');
    const campo = nome => form.elements.namedItem(nome);
    let sdk, ocupado = false;
    obterCliente().then(cliente => { sdk = cliente; google.disabled = false; }).catch(() => {
        google.disabled = false;
    });
    campo('existente').addEventListener('change', () => { campo('confirmarFirebase').disabled = campo('existente').checked; });
    async function executar(comGoogle) {
        if (ocupado) return;
        erro.hidden = true; status.textContent = '';
        if (![campo('usuario'), campo('senha'), campo('consentimento')].every(c => c.reportValidity())) return;
        if (!comGoogle && !form.reportValidity()) return;
        if (!comGoogle && !campo('existente').checked && (campo('firebaseSenha').value !== campo('confirmarFirebase').value
            || !/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/s.test(campo('firebaseSenha').value))) {
            erro.textContent = 'Confirme a nova senha: mínimo de 8 caracteres, maiúscula, minúscula, número e caractere especial.';
            erro.hidden = false; erro.focus(); return;
        }
        ocupado = true; enviar.disabled = true; google.disabled = true; form.setAttribute('aria-busy', 'true');
        status.textContent = 'Comprovando os dois acessos…';
        try {
            if (comGoogle && !sdk) {
                sdk = await obterCliente(); status.textContent = 'Tudo pronto. Clique em Migrar com Google novamente.'; return;
            }
            // No Google, chama o popup no mesmo clique, sem aguardar configuração de rede.
            const credencial = comGoogle ? await sdk.google() : await (async () => {
                sdk = await obterCliente();
                const metodo = campo('existente').checked ? 'entrar' : 'cadastrar';
                return sdk[metodo](campo('email').value.trim(), campo('firebaseSenha').value);
            })();
            if (credencial.user.emailVerified === false) {
                await sdk.verificarEmail(credencial.user);
                status.textContent = 'Confirme seu e-mail pelo link enviado pelo Firebase. Depois, marque “Já tenho acesso Firebase” e entre novamente para concluir a migração. A conta antiga ainda não foi alterada.';
                campo('existente').checked = true; campo('confirmarFirebase').disabled = true;
                return;
            }
            const idToken = await credencial.user.getIdToken();
            const resposta = await consultar('/auth/firebase/link', { method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': doc.querySelector('meta[name="csrf-token"]').content },
                body: JSON.stringify({ idToken, usuario: campo('usuario').value.trim(), senha: campo('senha').value }) });
            if (!resposta.ok) {
                const dados = await resposta.json().catch(() => ({}));
                throw Object.assign(new Error('migração'), { code: dados.codigo || (resposta.status === 403 ? 'CSRF' : 'SERVIDOR') });
            }
            campo('senha').value = ''; campo('firebaseSenha').value = ''; campo('confirmarFirebase').value = '';
            await sdk.sair().catch(() => {}); navegar('/home');
        } catch (e) {
            const mensagens = {
                MIGRACAO_RECUSADA: 'Confira usuário e senha antigos e use o mesmo e-mail da conta original. Um vínculo existente não pode ser substituído.',
                EMAIL_VERIFICADO_NECESSARIO: 'Confirme o e-mail pelo link do Firebase e entre novamente para concluir a migração.',
                'auth/email-already-in-use': 'Esse e-mail já tem acesso Firebase. Marque “Já tenho acesso Firebase” e informe a senha dele, ou use Google.',
                'auth/invalid-credential': 'Não foi possível autenticar no Firebase. Confira os dados ou recupere a senha.',
                'auth/popup-closed-by-user': 'A janela do Google foi fechada. Você pode tentar novamente.',
                'auth/popup-blocked': 'Permita popups para este site e tente novamente.',
                'auth/account-exists-with-different-credential': 'Use o método original da sua conta Firebase para comprovar o acesso.',
                'auth/weak-password': 'Escolha uma senha que atenda à política do Firebase.',
                'auth/password-does-not-meet-requirements': 'Escolha uma senha que atenda à política do Firebase.',
                'auth/network-request-failed': 'Confira sua conexão e tente novamente.',
                CSRF: 'A página expirou. Atualize antes de tentar novamente.'
            };
            status.textContent = ''; erro.textContent = mensagens[e.code] || 'Não foi possível migrar agora. Confira os dados e tente novamente mais tarde.';
            erro.hidden = false; erro.focus();
        } finally { ocupado = false; enviar.disabled = false; google.disabled = false; form.removeAttribute('aria-busy'); }
    }
    form.addEventListener('submit', evento => { evento.preventDefault(); executar(false); });
    google.addEventListener('click', () => executar(true));
    enviar.disabled = false;
}
module.exports = { iniciarMigracao };
