document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.btn-mostrar-senha').forEach(function (botao) {
        botao.addEventListener('click', function () {
            const alvo = document.getElementById(botao.dataset.alvo);
            if (!alvo) return;
            const visivel = alvo.type === 'text';
            alvo.type = visivel ? 'password' : 'text';
            botao.classList.toggle('ativo', !visivel);
            botao.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
        });
    });

    const campoSenha = document.getElementById('senha');
    const listaRequisitos = document.getElementById('requisitosSenha');
    const campoConfirmar = document.getElementById('confirmarSenha');
    const avisoConfirmacao = document.getElementById('avisoConfirmacao');
    const form = document.getElementById('formCadastro');

    if (!listaRequisitos || !campoSenha) return;

    const REGRAS = {
        tamanho: senha => senha.length >= 8,
        maiuscula: senha => /[A-Z]/.test(senha),
        minuscula: senha => /[a-z]/.test(senha),
        numero: senha => /[0-9]/.test(senha),
        especial: senha => /[^A-Za-z0-9]/.test(senha)
    };

    function senhaValida(senha) {
        return Object.values(REGRAS).every(teste => teste(senha));
    }

    function atualizarChecklist() {
        const senha = campoSenha.value;
        listaRequisitos.querySelectorAll('li[data-regra]').forEach(function (item) {
            const ok = REGRAS[item.dataset.regra](senha);
            item.classList.toggle('ok', ok);
        });
    }

    function atualizarConfirmacao() {
        if (!campoConfirmar || !avisoConfirmacao) return;
        if (!campoConfirmar.value) {
            avisoConfirmacao.textContent = '';
            avisoConfirmacao.classList.remove('erro-inline');
            return;
        }
        const confere = campoConfirmar.value === campoSenha.value;
        avisoConfirmacao.textContent = confere ? 'As senhas conferem ✓' : 'As senhas não conferem';
        avisoConfirmacao.classList.toggle('erro-inline', !confere);
        avisoConfirmacao.classList.toggle('ok-inline', confere);
    }

    campoSenha.addEventListener('input', function () {
        atualizarChecklist();
        atualizarConfirmacao();
    });

    if (campoConfirmar) {
        campoConfirmar.addEventListener('input', atualizarConfirmacao);
    }

    if (form) {
        form.addEventListener('submit', function (evento) {
            if (form.dataset.firebase === 'true') return;
            if (!senhaValida(campoSenha.value)) {
                evento.preventDefault();
                atualizarChecklist();
                campoSenha.focus();
                return;
            }
            if (campoConfirmar && campoConfirmar.value !== campoSenha.value) {
                evento.preventDefault();
                atualizarConfirmacao();
                campoConfirmar.focus();
            }
        });
    }

    atualizarChecklist();
});
