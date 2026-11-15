(function () {
    const imagensSubstituidas = new WeakSet();
    function substituirImagem(img) {
        if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-imagem-fallback')) return;
        const informado = img.getAttribute('data-imagem-fallback');
        const padrao = /^\/img\/pecas\/[a-z0-9-]+\.svg$/.test(informado || '') ? informado : '/img/pecas/quadro.svg';
        // Uma única tentativa por elemento; se o ícone local falhar, manter texto alternativo.
        if (imagensSubstituidas.has(img) || img.getAttribute('src') === padrao) {
            imagensSubstituidas.add(img);
            img.removeAttribute('srcset');
            img.removeAttribute('src');
            if (!img.alt.includes('imagem indisponível')) img.alt = (img.alt ? img.alt + ' — ' : '') + 'imagem indisponível';
            return;
        }
        imagensSubstituidas.add(img);
        img.removeAttribute('srcset');
        img.setAttribute('src', padrao);
    }
    // Captura também erros de imagens inseridas depois, como no configurador.
    document.addEventListener('error', function (evento) { substituirImagem(evento.target); }, true);
    document.addEventListener('DOMContentLoaded', function () {
        // Algumas imagens já podem ter falhado antes do carregamento deste script.
        document.querySelectorAll('img[data-imagem-fallback]').forEach(function (img) {
            if (img.complete && img.naturalWidth === 0) substituirImagem(img);
        });
    });

    function montarContainerToast() {
        let container = document.querySelector('.bk-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'bk-toast-container';
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        return container;
    }

    function toast(mensagem, opcoes) {
        opcoes = opcoes || {};
        const tipo = opcoes.tipo || 'info';
        const container = montarContainerToast();

        const el = document.createElement('div');
        el.className = 'bk-toast bk-toast--' + tipo;
        el.textContent = mensagem;
        container.appendChild(el);

        requestAnimationFrame(function () {
            el.classList.add('bk-toast--visivel');
        });

        const duracao = opcoes.duracao || 3200;
        setTimeout(function () {
            el.classList.remove('bk-toast--visivel');
            setTimeout(function () { el.remove(); }, 200);
        }, duracao);
    }

    function abrirModalBase(conteudoEl) {
        const backdrop = document.createElement('div');
        backdrop.className = 'bk-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'bk-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.appendChild(conteudoEl);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        requestAnimationFrame(function () { backdrop.classList.add('bk-modal-backdrop--visivel'); });

        function fechar() {
            backdrop.classList.remove('bk-modal-backdrop--visivel');
            setTimeout(function () { backdrop.remove(); }, 150);
        }

        return { backdrop: backdrop, modal: modal, fechar: fechar };
    }

    function confirmDialog(opcoes) {
        opcoes = opcoes || {};
        return new Promise(function (resolve) {
            const conteudo = document.createElement('div');
            conteudo.innerHTML =
                '<h3 class="bk-modal__titulo"></h3>' +
                '<p class="bk-modal__texto"></p>' +
                '<div class="bk-modal__acoes">' +
                    '<button type="button" class="btn-secundario" data-acao="cancelar"></button>' +
                    '<button type="button" class="btn-principal" data-acao="confirmar"></button>' +
                '</div>';
            conteudo.querySelector('.bk-modal__titulo').textContent = opcoes.titulo || 'Confirmar ação';
            conteudo.querySelector('.bk-modal__texto').textContent = opcoes.mensagem || '';
            const btnCancelar = conteudo.querySelector('[data-acao="cancelar"]');
            const btnConfirmar = conteudo.querySelector('[data-acao="confirmar"]');
            btnCancelar.textContent = opcoes.textoCancelar || 'Cancelar';
            btnConfirmar.textContent = opcoes.textoConfirmar || 'Confirmar';
            if (opcoes.perigo) btnConfirmar.classList.add('bk-modal__btn-perigo');

            const instancia = abrirModalBase(conteudo);

            function concluir(resultado) {
                instancia.fechar();
                document.removeEventListener('keydown', aoTeclar);
                resolve(resultado);
            }
            function aoTeclar(ev) {
                if (ev.key === 'Escape') concluir(false);
            }

            btnCancelar.addEventListener('click', function () { concluir(false); });
            btnConfirmar.addEventListener('click', function () { concluir(true); });
            instancia.backdrop.addEventListener('click', function (ev) {
                if (ev.target === instancia.backdrop) concluir(false);
            });
            document.addEventListener('keydown', aoTeclar);
            btnConfirmar.focus();
        });
    }

    function promptDialog(opcoes) {
        opcoes = opcoes || {};
        return new Promise(function (resolve) {
            const conteudo = document.createElement('div');
            conteudo.innerHTML =
                '<h3 class="bk-modal__titulo"></h3>' +
                '<label class="bk-modal__campo">' +
                    '<span></span>' +
                    '<input type="text" class="bk-modal__input" />' +
                '</label>' +
                '<div class="bk-modal__acoes">' +
                    '<button type="button" class="btn-secundario" data-acao="cancelar"></button>' +
                    '<button type="button" class="btn-principal" data-acao="confirmar"></button>' +
                '</div>';
            conteudo.querySelector('.bk-modal__titulo').textContent = opcoes.titulo || '';
            conteudo.querySelector('.bk-modal__campo span').textContent = opcoes.rotulo || '';
            const input = conteudo.querySelector('.bk-modal__input');
            input.placeholder = opcoes.placeholder || '';
            input.value = opcoes.valorInicial || '';
            const btnCancelar = conteudo.querySelector('[data-acao="cancelar"]');
            const btnConfirmar = conteudo.querySelector('[data-acao="confirmar"]');
            btnCancelar.textContent = opcoes.textoCancelar || 'Cancelar';
            btnConfirmar.textContent = opcoes.textoConfirmar || 'Salvar';

            const instancia = abrirModalBase(conteudo);

            function concluir(resultado) {
                instancia.fechar();
                document.removeEventListener('keydown', aoTeclar);
                resolve(resultado);
            }
            function aoTeclar(ev) {
                if (ev.key === 'Escape') concluir(null);
                if (ev.key === 'Enter') { ev.preventDefault(); enviar(); }
            }
            function enviar() {
                const valor = input.value.trim();
                concluir(valor || null);
            }

            btnCancelar.addEventListener('click', function () { concluir(null); });
            btnConfirmar.addEventListener('click', enviar);
            instancia.backdrop.addEventListener('click', function (ev) {
                if (ev.target === instancia.backdrop) concluir(null);
            });
            document.addEventListener('keydown', aoTeclar);
            setTimeout(function () { input.focus(); }, 50);
        });
    }

    window.Bikonfig = window.Bikonfig || {};
    window.Bikonfig.toast = toast;
    window.Bikonfig.confirmDialog = confirmDialog;
    window.Bikonfig.promptDialog = promptDialog;
})();

document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.getElementById('menuToggle');
    const nav = document.getElementById('navPrincipal');

    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
        const aberto = nav.classList.toggle('aberta');
        toggle.classList.toggle('aberto', aberto);
        toggle.setAttribute('aria-expanded', String(aberto));
    });

    nav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
            nav.classList.remove('aberta');
            toggle.classList.remove('aberto');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
});

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.js-form-confirmar').forEach(function (form) {
        form.addEventListener('submit', function (ev) {
            if (form.dataset.confirmado === 'sim') return;
            ev.preventDefault();
            Bikonfig.confirmDialog({
                titulo: form.dataset.confirmarTitulo || 'Confirmar ação',
                mensagem: form.dataset.confirmarMensagem || '',
                textoConfirmar: 'Excluir',
                perigo: true
            }).then(function (ok) {
                if (ok) {
                    form.dataset.confirmado = 'sim';
                    form.submit();
                }
            });
        });
    });
});
