document.addEventListener('DOMContentLoaded', () => {
    const campo = document.getElementById('tokenRecuperacao');
    if (campo) {
        const fragmento = location.hash.slice(1);
        if (fragmento) { campo.value = /^[a-f0-9]{64}$/.test(fragmento) ? fragmento : ''; history.replaceState(null, '', location.pathname); }
        const valido = /^[a-f0-9]{64}$/.test(campo.value);
        document.getElementById('confirmarRedefinicao').disabled = !valido;
        document.getElementById('avisoToken').hidden = valido;
    }
    document.getElementById('formSenhaLocal')?.addEventListener('submit', e => {
        const senha = document.getElementById('senha'), confirmar = document.getElementById('confirmarSenha');
        if (senha && confirmar && senha.value !== confirmar.value) { e.preventDefault(); confirmar.setCustomValidity('As senhas não conferem.'); confirmar.reportValidity(); }
    });
    document.getElementById('confirmarSenha')?.addEventListener('input', e => e.target.setCustomValidity(''));
});
