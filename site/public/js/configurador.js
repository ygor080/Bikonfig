document.addEventListener('DOMContentLoaded', function () {
    const configMenu = document.getElementById('configMenu');
    if (!configMenu) return;
    const { textoSeguro, urlImagemSegura } = window.BikonfigConteudoSeguro;

    const listaPecasEl = document.getElementById('configListaPecas');
    const orcamentoListaEl = document.getElementById('orcamentoLista');
    const orcamentoTotalEl = document.getElementById('orcamentoTotal');
    const avisosEl = document.getElementById('configAvisos');
    const compatibilidadeEl = document.getElementById('configCompatibilidade');
    const indisponiveisEl = document.getElementById('configIndisponiveis');
    const btnLimpar = document.getElementById('btnLimparConfig');
    const btnSalvarConfig = document.getElementById('btnSalvarConfig');
    const edicaoEl = document.getElementById('configEdicao');
    let configuracaoEmEdicao = null;
    let nomeConfiguracao = '';
    let indisponiveisNaAbertura = false;
    let salvandoConfiguracao = false;
    let falhaAoAbrir = false;

    function atualizarEstadoEdicao() {
        if (btnSalvarConfig) btnSalvarConfig.textContent = configuracaoEmEdicao ? 'Salvar alterações' : 'Salvar configuração';
        if (edicaoEl) edicaoEl.textContent = configuracaoEmEdicao ? 'Editando: ' + nomeConfiguracao : '';
    }
    const btnBaixarPdf = document.getElementById('btnBaixarPdf');
    const btnAtualizarOrcamento = document.getElementById('btnAtualizarOrcamento');
    const tipoMontagemEl = document.getElementById('tipoMontagem');
    const completudeEl = document.getElementById('configCompletude');
    const tipoMontagemAtual = () => tipoMontagemEl?.value || 'com-marchas';

    const MAPA_SVG = {
        'quadro': 'parte-quadro',
        'quadro-garfo': 'parte-suspensao',
        'quadro-amortecedor': 'parte-suspensao',
        'direcao': 'parte-suspensao',
        'rodas': null,
        'rodas-dianteira': 'parte-roda-dianteira',
        'rodas-traseira': 'parte-roda-traseira',
        'rodas-camara-ar': null,
        'rodas-cubo': null,
        'rodas-cubo-dianteiro': 'parte-roda-dianteira',
        'rodas-cubo-traseiro': 'parte-roda-traseira',
        'pneus': null,
        'cambio-dianteiro': 'parte-transmissao',
        'cambio-dianteiro-desviador': 'parte-transmissao',
        'cambio-dianteiro-trocador': 'parte-cockpit',
        'cambio-dianteiro-cabo': 'parte-transmissao',
        'cambio-traseiro': 'parte-transmissao',
        'cambio-traseiro-desviador': 'parte-transmissao',
        'cambio-traseiro-trocador': 'parte-cockpit',
        'cambio-traseiro-cabo': 'parte-transmissao',
        'cassete': 'parte-transmissao',
        'corrente': 'parte-transmissao',
        'pedivela': 'parte-transmissao',
        'pedivela-movimento-central': 'parte-transmissao',
        'pedivela-coroa': 'parte-transmissao',
        'guidao': 'parte-cockpit',
        'guidao-manoplas': 'parte-cockpit',
        'guidao-avanco': 'parte-cockpit',
        'guidao-fita': 'parte-cockpit',
        'selim': 'parte-selim',
        'selim-canote': 'parte-selim',
        'freios': null,
        'freios-dianteiro': 'parte-freios-d',
        'freios-traseiro': 'parte-freios-t',
        'freios-disco': null,
        'freios-pastilha': null,
        'freios-cabo': null,
        'freios-manete': null,
        'rodas-aro': null,
        'rodas-raio': null,
        'pedal': 'parte-acessorios',
        'paralama': 'parte-acessorios',
        'paralama-dianteiro': 'parte-acessorios',
        'paralama-traseiro': 'parte-acessorios',
        'bagageiro': 'parte-acessorios',
        'bagageiro-dianteiro': 'parte-acessorios',
        'bagageiro-traseiro': 'parte-acessorios',
        'descanso': 'parte-acessorios',
        'iluminacao': 'parte-acessorios',
        'iluminacao-farol': 'parte-acessorios',
        'iluminacao-lanterna': 'parte-acessorios',
        'fixacao-roda': null,
        'fixacao-roda-dianteiro': 'parte-roda-dianteira',
        'fixacao-roda-traseiro': 'parte-roda-traseira',
        'outros': 'parte-acessorios',
        'outros-pedal': 'parte-acessorios'
    };

    const GRUPOS_DUAS_RODAS = ['rodas', 'pneus', 'rodas-camara-ar', 'rodas-cubo', 'rodas-aro', 'rodas-raio', 'fixacao-roda'];
    const GRUPOS_DOIS_FREIOS = ['freios', 'freios-disco', 'freios-pastilha', 'freios-cabo', 'freios-manete'];

    const PECAS_DUAS_POSICOES = [...new Set([...GRUPOS_DUAS_RODAS, ...GRUPOS_DOIS_FREIOS])];

    const CATEGORIAS_MULTIPLAS = ['outros'];

    const selecionadas = Object.create(null);

    const posicaoAtivaPorSub = Object.create(null);

    configMenu.querySelectorAll('.config-grupo-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const grupo = btn.closest('.config-grupo');
            grupo.classList.toggle('aberto');
        });
    });

    configMenu.querySelectorAll('.config-subitem-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            const subcategoria = btn.dataset.subcategoria;
            const nomeSub = btn.dataset.nome;

            configMenu.querySelectorAll('.config-subitem-btn').forEach(b => b.classList.remove('ativo'));
            btn.classList.add('ativo');

            listaPecasEl.innerHTML = '<p class="config-lista-vazio">Carregando peças...</p>';

            try {
                const resposta = await fetch('/catalogo/api/pecas/' + encodeURIComponent(subcategoria));
                const pecas = await resposta.json();
                renderizarListaPecas(pecas, subcategoria, nomeSub);
            } catch (erro) {
                listaPecasEl.innerHTML = '<p class="config-lista-vazio">Erro ao carregar peças.</p>';
            }
        });
    });

    function renderizarListaPecas(pecas, subcategoria, nomeSub) {
        const duasPosicoes = PECAS_DUAS_POSICOES.includes(subcategoria);

        if (!pecas.length) {
            listaPecasEl.innerHTML = '<p class="config-lista-vazio">Nenhuma peça cadastrada para ' + textoSeguro(nomeSub) + ' ainda.</p>';
            return;
        }

        if (!duasPosicoes) {
            listaPecasEl.innerHTML = '';
            renderizarGrid(pecas, subcategoria, nomeSub, null, listaPecasEl);
            return;
        }

        if (!posicaoAtivaPorSub[subcategoria]) posicaoAtivaPorSub[subcategoria] = 'dianteira';

        const cabecalho = document.createElement('div');
        cabecalho.className = 'config-lista-topo';
        cabecalho.innerHTML =
            '<h3 class="config-lista-titulo">' + textoSeguro(nomeSub) + '</h3>' +
            '<p class="config-posicao-aviso">Essa peça não vem separada por lado no catálogo — escolha uma vez para a roda da frente e uma vez para a de trás. Pode ser o mesmo produto (ex: pneu, câmara de ar) ou produtos diferentes (ex: disco de freio, que costuma ser maior na dianteira).</p>' +
            '<div class="config-posicao-switch">' +
                '<button type="button" class="config-posicao-btn" data-posicao="dianteira">Dianteira <span class="config-posicao-check" data-posicao-check="dianteira"></span></button>' +
                '<button type="button" class="config-posicao-btn" data-posicao="traseira">Traseira <span class="config-posicao-check" data-posicao-check="traseira"></span></button>' +
            '</div>';

        listaPecasEl.innerHTML = '';
        listaPecasEl.appendChild(cabecalho);

        const gridWrapper = document.createElement('div');
        listaPecasEl.appendChild(gridWrapper);

        function atualizarSwitch() {
            cabecalho.querySelectorAll('.config-posicao-btn').forEach(function (b) {
                b.classList.toggle('ativo', b.dataset.posicao === posicaoAtivaPorSub[subcategoria]);
            });
            cabecalho.querySelectorAll('.config-posicao-check').forEach(function (span) {
                const chave = subcategoria + '::' + span.dataset.posicaoCheck;
                span.classList.toggle('marcado', !!selecionadas[chave]);
            });
        }

        cabecalho.querySelectorAll('.config-posicao-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                posicaoAtivaPorSub[subcategoria] = b.dataset.posicao;
                atualizarSwitch();
                renderizarGrid(pecas, subcategoria, nomeSub, posicaoAtivaPorSub[subcategoria], gridWrapper);
            });
        });

        atualizarSwitch();
        renderizarGrid(pecas, subcategoria, nomeSub, posicaoAtivaPorSub[subcategoria], gridWrapper);
    }

    function dataConsultaPreco(valor) {
        const data = valor ? new Date(valor) : null;
        return data && !Number.isNaN(data.getTime())
            ? 'Preço consultado em ' + data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)'
            : 'Preço sem data de consulta registrada';
    }

    function renderizarGrid(pecas, subcategoria, nomeSub, posicao, alvo) {
        const multipla = CATEGORIAS_MULTIPLAS.includes(subcategoria);
        const chaveAtual = posicao ? (subcategoria + '::' + posicao) : subcategoria;
        const selecionadaAtual = selecionadas[chaveAtual];

        const ativoParaPeca = function (peca) {
            if (multipla) return !!selecionadas[subcategoria + '::' + peca.id];
            return selecionadaAtual && selecionadaAtual.id === peca.id;
        };

        alvo.innerHTML =
            (multipla ? '<p class="config-posicao-aviso">Aqui você pode marcar quantos acessórios quiser -- clique de novo em um item marcado para removê-lo.</p>' : '') +
            '<div class="grid-produtos">' +
            pecas.map(function (peca) {
                const ativo = ativoParaPeca(peca);
                const consultaEstoque = peca.estoque_verificado_em ? new Date(peca.estoque_verificado_em) : null;
                const dataEstoque = consultaEstoque && !Number.isNaN(consultaEstoque.getTime())
                    ? consultaEstoque.toISOString().slice(0, 10) : null;
                return (
                    '<div class="produto-card config-produto-card' + (ativo ? ' selecionado' : '') + '" data-id="' + textoSeguro(peca.id) + '">' +
                        (peca.opcional ? '<span class="tag-opcional">opcional</span>' : '') +
                        '<div class="produto-imagem"><img src="' + textoSeguro(urlImagemSegura(peca.imagem, peca.imagemFallback))
                            + '" data-imagem-fallback="' + textoSeguro(urlImagemSegura(null, peca.imagemFallback))
                            + '" alt="' + textoSeguro(peca.nome) + '"></div>' +
                        '<h3>' + textoSeguro(peca.nome) + '</h3>' +
                        (peca.variante_id ? '<p class="loja">Variação: ' + textoSeguro(peca.variante || 'Padrão') + '</p>' : '') +
                        (peca.sku ? '<p class="loja">SKU: ' + textoSeguro(peca.sku) + '</p>' : '') +
                        '<p class="preco">R$ ' + peca.preco.toFixed(2) + '</p>' +
                        '<p class="loja">' + textoSeguro(dataConsultaPreco(peca.preco_verificado_em)) + '</p>' +
                        '<p class="fabricante">Fabricante: ' + textoSeguro(peca.fabricante || 'Não informado') + '</p>' +
                        '<p class="loja">Loja: ' + textoSeguro(peca.loja || 'Não informada') + '</p>' +
                        '<p class="estoque">' + (peca.em_estoque === true ? 'Em estoque na última coleta'
                            : peca.em_estoque === false ? 'Sem estoque na última coleta' : 'Disponibilidade desconhecida') + '</p>' +
                        (dataEstoque ? '<p class="loja">Consulta de estoque: ' + dataEstoque + '</p>' : '') +
                        (peca.aro ? '<p class="fabricante">Aro: ' + textoSeguro(peca.aro) + '</p>' : '') +
                        '<button type="button" class="btn-adicionar" data-selecionar="' + textoSeguro(peca.id) + '">' +
                            (ativo ? (multipla ? 'Selecionado ✓ (remover)' : 'Selecionado ✓') : 'Selecionar') +
                        '</button>' +
                    '</div>'
                );
            }).join('') +
            '</div>';

        alvo.querySelectorAll('[data-selecionar]').forEach(function (btnSelecionar) {
            btnSelecionar.addEventListener('click', function () {
                const peca = pecas.find(p => p.id === btnSelecionar.dataset.selecionar);
                if (multipla) {
                    alternarPecaMultipla(subcategoria, peca);
                } else {
                    selecionarPeca(chaveAtual, subcategoria, peca, posicao);
                }
                renderizarGrid(pecas, subcategoria, nomeSub, posicao, alvo);
                if (posicao) {
                    document.querySelectorAll('.config-posicao-check').forEach(function (span) {
                        const chave = subcategoria + '::' + span.dataset.posicaoCheck;
                        span.classList.toggle('marcado', !!selecionadas[chave]);
                    });
                }
            });
        });
    }

    function selecionarPeca(chave, subcategoria, peca, posicao) {
        selecionadas[chave] = {
            id: peca.id,
            nome: peca.nome,
            preco: peca.preco,
            preco_verificado_em: peca.preco_verificado_em,
            imagem: peca.imagem,
            imagemFallback: peca.imagemFallback,
            aro: peca.aro,
            subcategoria: subcategoria,
            posicao: posicao || null
        };

        destacarNaBike(subcategoria);
        atualizarCheckMenu();
        atualizarOrcamento();
    }

    function alternarPecaMultipla(subcategoria, peca) {
        const chave = subcategoria + '::' + peca.id;

        if (selecionadas[chave]) {
            delete selecionadas[chave];
        } else {
            selecionadas[chave] = {
                id: peca.id,
                nome: peca.nome,
                preco: peca.preco,
                preco_verificado_em: peca.preco_verificado_em,
                imagem: peca.imagem,
                imagemFallback: peca.imagemFallback,
                aro: peca.aro,
                subcategoria: subcategoria,
                posicao: null
            };
        }

        destacarNaBike(subcategoria);
        atualizarCheckMenu();
        atualizarOrcamento();
    }

    function destacarNaBike(subcategoria) {
        if (GRUPOS_DUAS_RODAS.includes(subcategoria)) {
            ['parte-roda-dianteira', 'parte-roda-traseira'].forEach(marcarPecaSvg);
            return;
        }
        if (GRUPOS_DOIS_FREIOS.includes(subcategoria)) {
            ['parte-freios-d', 'parte-freios-t'].forEach(marcarPecaSvg);
            return;
        }
        const idSvg = Object.hasOwn(MAPA_SVG, subcategoria) ? MAPA_SVG[subcategoria] : null;
        if (idSvg) marcarPecaSvg(idSvg);
    }

    function marcarPecaSvg(idSvg) {
        const el = document.getElementById(idSvg);
        if (el) el.classList.add('parte-selecionada');
    }

    function atualizarCheckMenu() {
        configMenu.querySelectorAll('.config-check').forEach(function (span) {
            const sub = span.dataset.check;
            if (PECAS_DUAS_POSICOES.includes(sub)) {
                const dianteira = !!selecionadas[sub + '::dianteira'];
                const traseira = !!selecionadas[sub + '::traseira'];
                span.classList.toggle('marcado', dianteira && traseira);
                span.classList.toggle('parcial', (dianteira || traseira) && !(dianteira && traseira));
            } else if (CATEGORIAS_MULTIPLAS.includes(sub)) {
                const temAlgum = Object.keys(selecionadas).some(k => k.indexOf(sub + '::') === 0);
                span.classList.toggle('marcado', temAlgum);
                span.classList.remove('parcial');
            } else {
                span.classList.toggle('marcado', !!selecionadas[sub]);
                span.classList.remove('parcial');
            }
        });
    }

    let versaoOrcamento = 0;

    function mostrarCompletude(relatorio) {
        if (!completudeEl) return;
        completudeEl.textContent = '';
        if (!relatorio) {
            completudeEl.textContent = 'Não foi possível conferir os componentes essenciais. Atualize o orçamento para tentar novamente.';
            return;
        }
        const resumo = document.createElement('p');
        resumo.textContent = relatorio.selecionados + ' de ' + relatorio.total + ' requisitos de componentes selecionados. '
            + (relatorio.status === 'itens_selecionados' ? 'Itens principais previstos selecionados.'
                : relatorio.status === 'confirmacao_necessaria' ? 'Há itens que precisam de confirmação.' : 'A montagem ainda está incompleta.');
        completudeEl.appendChild(resumo);
        const lista = document.createElement('ul');
        (relatorio.faltantes || []).forEach(function (item) {
            const linha = document.createElement('li');
            linha.textContent = 'Falta: ' + item.nome;
            lista.appendChild(linha);
        });
        (relatorio.confirmar || []).forEach(function (item) {
            const linha = document.createElement('li');
            linha.textContent = 'Confirmar: ' + item.nome;
            lista.appendChild(linha);
        });
        completudeEl.appendChild(lista);
        const observacao = document.createElement('p');
        observacao.textContent = relatorio.observacao;
        completudeEl.appendChild(observacao);
    }

    function mostrarCompatibilidade(relatorio) {
        if (!compatibilidadeEl) return;
        compatibilidadeEl.textContent = '';
        const mensagens = {
            incompativel: 'Incompatibilidade encontrada nas regras verificadas.',
            dados_insuficientes: 'Dados insuficientes para concluir as verificações de compatibilidade.',
            sem_divergencias: 'Sem divergências nas regras verificadas. Isso não garante a compatibilidade completa da montagem.',
            nao_verificada: 'Compatibilidade não verificada: ainda não há pares de peças com regras aplicáveis nesta seleção.'
        };
        const estado = relatorio?.status;
        const resumo = document.createElement('p');
        resumo.className = 'config-aviso-compat';
        resumo.textContent = mensagens[estado] || 'Verificação de compatibilidade indisponível.';
        compatibilidadeEl.appendChild(resumo);
        (relatorio?.faltantes || []).forEach(function (falta) {
            const detalhe = document.createElement('p');
            detalhe.className = 'config-aviso-compat';
            const nomeComPosicao = p => p.nome + (p.posicao ? ' (' + p.posicao + ')' : '');
            detalhe.textContent = 'Não foi possível comparar ' + falta.pecas.map(nomeComPosicao).join(' e ')
                + ': falta a especificação "' + falta.campo + '" em ' + falta.ausentes.map(nomeComPosicao).join(' e ') + '.';
            compatibilidadeEl.appendChild(detalhe);
        });
    }

    function renderizarResumoOrcamento(entradas, indisponiveis = []) {
        const idsIndisponiveis = new Set(indisponiveis);
        orcamentoListaEl.innerHTML = entradas.map(function (peca) {
            const rotulo = peca.posicao === 'dianteira' ? ' (dianteira)' : peca.posicao === 'traseira' ? ' (traseira)' : '';
            return '<li><img class="orcamento-icone" src="' + textoSeguro(urlImagemSegura(peca.imagem, peca.imagemFallback))
                + '" data-imagem-fallback="' + textoSeguro(urlImagemSegura(null, peca.imagemFallback))
                + '" alt=""><span>' + textoSeguro(peca.nome + rotulo) + '<small class="consulta-preco">'
                + textoSeguro(dataConsultaPreco(peca.preco_verificado_em)) + '</small></span><span>'
                + (idsIndisponiveis.has(peca.id) ? 'Indisponível — fora do total' : 'R$ ' + peca.preco.toFixed(2)) + '</span></li>';
        }).join('');
    }

    async function atualizarOrcamento() {
        // Invalida também requisições pendentes quando a seleção é limpa.
        const versao = ++versaoOrcamento;
        const entradas = Object.values(selecionadas);
        if (compatibilidadeEl) compatibilidadeEl.textContent = '';
        if (btnAtualizarOrcamento) btnAtualizarOrcamento.disabled = false;

        if (entradas.length === 0) {
            if (completudeEl) completudeEl.textContent = 'Nenhuma peça selecionada. Escolha os componentes para conferir a lista de itens essenciais deste tipo de montagem.';
            orcamentoListaEl.innerHTML = '<li class="config-orcamento-vazio">Nenhuma peça selecionada ainda.</li>';
            orcamentoTotalEl.textContent = 'R$ 0,00';
            avisosEl.innerHTML = '';
            return;
        }

        renderizarResumoOrcamento(entradas);

        const ids = entradas.map(p => p.id);
        const itens = entradas.map(p => ({ id: p.id, posicao: p.posicao || null }));
        orcamentoTotalEl.textContent = 'Calculando...';
        if (completudeEl) completudeEl.textContent = 'Conferindo componentes essenciais...';
        avisosEl.textContent = '';
        if (btnAtualizarOrcamento) btnAtualizarOrcamento.disabled = true;

        try {
            const resposta = await fetch('/catalogo/api/orcamento', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, itens, tipoMontagem: tipoMontagemAtual() })
            });
            if (versao !== versaoOrcamento) return;
            if (!resposta.ok) throw new Error('Falha ao consultar orçamento.');
            const dados = await resposta.json();
            if (versao !== versaoOrcamento) return;
            if (typeof dados.total !== 'number' || !Number.isFinite(dados.total) || dados.total < 0
                || !Array.isArray(dados.avisos)) {
                throw new Error('Resposta de orçamento inválida.');
            }

            orcamentoTotalEl.textContent = 'R$ ' + dados.total.toFixed(2);
            const atuais = new Map((dados.pecas || []).map(peca => [peca.id, peca]));
            entradas.forEach(function (peca) {
                const atual = atuais.get(peca.id);
                if (atual && typeof atual.preco === 'number' && Number.isFinite(atual.preco)) {
                    peca.preco = atual.preco;
                    peca.preco_verificado_em = atual.preco_verificado_em;
                }
            });
            renderizarResumoOrcamento(entradas, dados.indisponiveis || []);
            avisosEl.textContent = '';
            (dados.avisos || []).forEach(function (aviso) {
                const mensagem = document.createElement('p');
                mensagem.className = 'config-aviso-compat';
                mensagem.textContent = '⚠ ' + aviso;
                avisosEl.appendChild(mensagem);
            });
            mostrarCompatibilidade(dados.compatibilidade);
            mostrarCompletude(dados.completude);
        } catch (erro) {
            if (versao !== versaoOrcamento) return;
            console.error('Erro ao atualizar orcamento', erro);
            orcamentoTotalEl.textContent = 'Indisponível';
            avisosEl.textContent = 'Não foi possível atualizar o orçamento. Clique em "Atualizar orçamento" para tentar novamente.';
            if (completudeEl) completudeEl.textContent = 'Verificação de componentes essenciais indisponível. Atualize o orçamento para tentar novamente.';
        } finally {
            if (versao === versaoOrcamento && btnAtualizarOrcamento) {
                btnAtualizarOrcamento.disabled = false;
            }
        }
    }

    if (btnAtualizarOrcamento) btnAtualizarOrcamento.addEventListener('click', atualizarOrcamento);
    if (tipoMontagemEl) tipoMontagemEl.addEventListener('change', atualizarOrcamento);

    btnLimpar.addEventListener('click', function () {
        Object.keys(selecionadas).forEach(key => delete selecionadas[key]);
        Object.keys(posicaoAtivaPorSub).forEach(key => delete posicaoAtivaPorSub[key]);
        if (indisponiveisEl) indisponiveisEl.textContent = '';
        document.querySelectorAll('.parte-selecionada').forEach(function (el) {
            el.classList.remove('parte-selecionada');
        });
        atualizarCheckMenu();
        atualizarOrcamento();
        listaPecasEl.innerHTML = '<p class="config-lista-vazio">Selecione uma categoria ao lado para ver as peças disponíveis.</p>';
        configMenu.querySelectorAll('.config-subitem-btn').forEach(b => b.classList.remove('ativo'));
    });

    if (btnBaixarPdf) {
        btnBaixarPdf.addEventListener('click', async function () {
            const itens = Object.values(selecionadas).map(function (peca) {
                return { id: peca.id, posicao: peca.posicao || null };
            });

            if (itens.length === 0) {
                Bikonfig.toast('Selecione ao menos uma peça antes de baixar o PDF.', { tipo: 'erro' });
                return;
            }

            const textoOriginal = btnBaixarPdf.textContent;
            btnBaixarPdf.textContent = 'Gerando PDF...';
            btnBaixarPdf.disabled = true;

            try {
                const resposta = await fetch('/catalogo/api/pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itens })
                });

                if (!resposta.ok) {
                    const erro = await resposta.json().catch(() => ({}));
                    throw new Error(erro.erro || 'Falha ao gerar o PDF.');
                }

                const blob = await resposta.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'bikonfig-resumo-configuracao.pdf';
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } catch (erro) {
                console.error('Erro ao baixar PDF', erro);
                Bikonfig.toast(erro.message || 'Não foi possível gerar o PDF. Tente novamente.', { tipo: 'erro' });
            } finally {
                btnBaixarPdf.textContent = textoOriginal;
                btnBaixarPdf.disabled = false;
            }
        });
    }

    if (btnSalvarConfig) {
        btnSalvarConfig.addEventListener('click', async function () {
            if (salvandoConfiguracao || btnSalvarConfig.disabled || falhaAoAbrir) return;
            salvandoConfiguracao = true;
            try {
            const itens = Object.values(selecionadas).map(function (peca) {
                return { id: peca.id, posicao: peca.posicao || null };
            });

            if (itens.length === 0) {
                Bikonfig.toast('Selecione ao menos uma peça antes de salvar.', { tipo: 'erro' });
                return;
            }

            const nome = await Bikonfig.promptDialog({
                titulo: configuracaoEmEdicao ? 'Salvar alterações' : 'Salvar configuração',
                valorInicial: nomeConfiguracao,
                rotulo: 'Nome da configuração',
                placeholder: 'Ex.: Minha MTB de trilha',
                textoConfirmar: 'Salvar'
            });
            if (!nome) return;
            if (configuracaoEmEdicao && indisponiveisNaAbertura && !await Bikonfig.confirmDialog({
                titulo: 'Atualizar configuração',
                mensagem: 'As peças indisponíveis da montagem original não estão nesta seleção. Ao salvar, elas serão removidas da configuração. Deseja continuar?',
                textoConfirmar: 'Salvar alterações'
            })) return;

            btnSalvarConfig.textContent = 'Salvando...';
            btnSalvarConfig.disabled = true;

            try {
                const resposta = await fetch('/catalogo/api/configuracoes' + (configuracaoEmEdicao ? '/' + encodeURIComponent(configuracaoEmEdicao) : ''), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: nome, itens, tipoMontagem: tipoMontagemAtual() })
                });

                if (!resposta.ok) {
                    const erro = await resposta.json().catch(() => ({}));
                    throw new Error(erro.erro || 'Falha ao salvar a configuração.');
                }

                const salva = await resposta.json();
                configuracaoEmEdicao = salva.id;
                nomeConfiguracao = salva.nome;
                indisponiveisNaAbertura = false;
                if (indisponiveisEl) indisponiveisEl.textContent = '';
                window.history?.replaceState(null, '', '/catalogo/configurador?config=' + encodeURIComponent(salva.id));
                Bikonfig.toast('Configuração salva! Você pode vê-la em "Minhas configs".', { tipo: 'sucesso' });
            } catch (erro) {
                console.error('Erro ao salvar configuração', erro);
                Bikonfig.toast(erro.message || 'Não foi possível salvar a configuração. Tente novamente.', { tipo: 'erro' });
            } finally {
                atualizarEstadoEdicao();
                btnSalvarConfig.disabled = false;
            }
            } finally { salvandoConfiguracao = false; }
        });
    }

    async function carregarConfiguracaoSalva(id) {
        if (btnSalvarConfig) btnSalvarConfig.disabled = true;
        try {
            const resposta = await fetch('/catalogo/api/configuracoes/' + encodeURIComponent(id));
            if (!resposta.ok) throw new Error('Configuração não encontrada.');
            const dados = await resposta.json();

            if (tipoMontagemEl) tipoMontagemEl.value = dados.tipoMontagem || 'com-marchas';
            if (indisponiveisEl) {
                indisponiveisEl.textContent = '';
                if (dados.indisponiveis?.length) {
                    const aviso = document.createElement('p');
                    aviso.className = 'config-aviso-compat';
                    aviso.textContent = 'Montagem reaberta com peças indisponíveis. Elas continuam na configuração salva, mas foram excluídas desta seleção, do total e do PDF. Escolha substitutas: ' + dados.indisponiveis.map(function (item) {
                        const posicao = item.posicao === 'dianteira' ? ' (dianteira)' : item.posicao === 'traseira' ? ' (traseira)' : '';
                        return item.nome + posicao;
                    }).join('; ') + '.';
                    indisponiveisEl.appendChild(aviso);
                }
            }

            dados.itens.forEach(function (peca) {
                let chave;
                if (CATEGORIAS_MULTIPLAS.includes(peca.subcategoria)) {
                    chave = peca.subcategoria + '::' + peca.id;
                } else if (PECAS_DUAS_POSICOES.includes(peca.subcategoria) && peca.posicao) {
                    chave = peca.subcategoria + '::' + peca.posicao;
                } else {
                    chave = peca.subcategoria;
                }

                selecionadas[chave] = {
                    id: peca.id,
                    nome: peca.nome,
                    preco: peca.preco,
                    preco_verificado_em: peca.preco_verificado_em,
                    imagem: peca.imagem,
                    imagemFallback: peca.imagemFallback,
                    aro: peca.aro,
                    subcategoria: peca.subcategoria,
                    posicao: peca.posicao || null
                };

                destacarNaBike(peca.subcategoria);
            });

            atualizarCheckMenu();
            atualizarOrcamento();
            configuracaoEmEdicao = dados.id || id;
            nomeConfiguracao = dados.nome || '';
            indisponiveisNaAbertura = Boolean(dados.indisponiveis?.length);
            atualizarEstadoEdicao();
            if (btnSalvarConfig) btnSalvarConfig.disabled = false;
        } catch (erro) {
            falhaAoAbrir = true;
            if (edicaoEl) edicaoEl.textContent = 'Não foi possível abrir a montagem. Recarregue a página para tentar novamente.';
            console.error('Erro ao carregar configuração salva', erro);
            Bikonfig.toast('Não foi possível carregar essa configuração salva.', { tipo: 'erro' });
        }
    }

    async function carregarPecaDoCatalogo(id, subcategoria) {
        try {
            const botaoCategoria = Array.from(configMenu.querySelectorAll('.config-subitem-btn'))
                .find(btn => btn.dataset.subcategoria === subcategoria);
            if (!botaoCategoria) throw new Error('Categoria não encontrada.');

            const resposta = await fetch('/catalogo/api/pecas/' + encodeURIComponent(subcategoria));
            if (!resposta.ok) throw new Error('Falha ao consultar a peça.');
            const pecas = await resposta.json();
            const peca = pecas.find(item => item.id === id);
            if (!peca) throw new Error('Peça não disponível.');

            const posicao = PECAS_DUAS_POSICOES.includes(subcategoria) ? 'dianteira' : null;
            if (posicao) posicaoAtivaPorSub[subcategoria] = posicao;
            if (CATEGORIAS_MULTIPLAS.includes(subcategoria)) {
                alternarPecaMultipla(subcategoria, peca);
            } else {
                selecionarPeca(posicao ? subcategoria + '::' + posicao : subcategoria, subcategoria, peca, posicao);
            }

            configMenu.querySelectorAll('.config-subitem-btn').forEach(btn => btn.classList.remove('ativo'));
            botaoCategoria.classList.add('ativo');
            botaoCategoria.closest('.config-grupo').classList.add('aberto');
            renderizarListaPecas(pecas, subcategoria, botaoCategoria.dataset.nome);
            if (posicao) {
                Bikonfig.toast('Peça selecionada na posição dianteira. Você pode escolher a peça traseira na mesma categoria.', { tipo: 'sucesso' });
            }
        } catch (erro) {
            console.error('Erro ao selecionar peça do catálogo', erro);
            Bikonfig.toast('Não foi possível selecionar essa peça. Ela pode não estar mais disponível; escolha outra no configurador.', { tipo: 'erro' });
        }
    }

    const parametrosDaUrl = new URLSearchParams(window.location.search);
    const configuracaoDaUrl = parametrosDaUrl.get('config');
    if (configuracaoDaUrl) {
        carregarConfiguracaoSalva(configuracaoDaUrl);
    } else if (parametrosDaUrl.get('produto')) {
        carregarPecaDoCatalogo(parametrosDaUrl.get('produto'), parametrosDaUrl.get('subcategoria'));
    }

    const primeiroGrupo = configMenu.querySelector('.config-grupo');
    if (primeiroGrupo) primeiroGrupo.classList.add('aberto');
});
