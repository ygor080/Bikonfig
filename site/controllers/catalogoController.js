const ProdutoModel = require('../models/produtoModel');
const ConfiguracaoModel = require('../models/configuracaoModel');
const PDFDocument = require('pdfkit');

const catalogoController = {
    exibirCatalogo: async (req, res) => {
        if (!req.session.user) return res.redirect('/login');

        const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
        const produtos = await ProdutoModel.listarTodos(busca);
        const semResultadoDaBusca = busca !== '' && produtos.length === 0;
        const vazio = !busca && produtos.length === 0;

        res.render('catalogo', {
            usuario: req.session.user,
            vazio: vazio,
            semResultadoDaBusca: semResultadoDaBusca,
            produtos: produtos,
            busca: busca
        });
    },

    exibirConfigurador: async (req, res) => {
        if (!req.session.user) return res.redirect('/login');

        res.render('configurador', {
            usuario: req.session.user,
            categorias: await ProdutoModel.getEstruturaCategorias()
        });
    },

    listarPecasPorSubcategoria: async (req, res) => {
        const { subcategoria } = req.params;
        const pecas = await ProdutoModel.listarPorSubcategoria(subcategoria);
        res.json(pecas);
    },

    calcularOrcamento: async (req, res) => {
        try {
            const entradas = Array.isArray(req.body.itens) ? req.body.itens
                : Array.isArray(req.body.ids) ? req.body.ids.map(id => ({ id })) : [];
            if (entradas.some(item => !item || typeof item.id !== 'string'
                || (item.posicao != null && !['dianteira', 'traseira'].includes(item.posicao)))) {
                return res.status(400).json({ erro: 'Informe peças e posições válidas para calcular o orçamento.' });
            }
            const ids = entradas.map(item => item.id);

            if (!Array.isArray(ids) || ids.length === 0) {
                return res.json({ pecas: [], total: 0, avisos: [], indisponiveis: [],
                    compatibilidade: { status: 'nao_verificada', verificadas: 0, pendentes: 0, faltantes: [] } });
            }

            const idsUnicos = [...new Set(ids)];
            const produtosUnicos = await ProdutoModel.buscarVariosPorId(idsUnicos);
            const porId = new Map(produtosUnicos.map(p => [p.id, p]));

            const pecas = ids.map(id => porId.get(id)).filter(Boolean);
            const total = pecas.reduce((soma, peca) => soma + Number(peca.preco), 0);
            const porAplicacao = new Map();
            entradas.forEach(item => {
                const produto = porId.get(item.id);
                if (produto) porAplicacao.set(JSON.stringify([item.id, item.posicao || null]), {
                    ...produto, posicao: item.posicao || null
                });
            });
            const compatibilidade = await ProdutoModel.avaliarCompatibilidade([...porAplicacao.values()]);
            const avisos = [...compatibilidade.avisos];
            const indisponiveis = idsUnicos.filter(id => !porId.has(id));
            if (indisponiveis.length) avisos.push('Há peças indisponíveis na seleção. O total considera somente as peças disponíveis; substitua as demais antes de salvar ou exportar.');

            res.json({ pecas, total, avisos, indisponiveis, compatibilidade });
        } catch (erro) {
            console.error('Erro ao calcular orçamento:', erro);
            res.status(500).json({ erro: 'Erro ao calcular orçamento' });
        }
    },

    gerarPdf: async (req, res) => {
        try {
            const { itens } = req.body;

            if (!Array.isArray(itens) || itens.length === 0) {
                return res.status(400).json({ erro: 'Nenhuma peça selecionada para gerar o PDF.' });
            }

            const idsUnicos = [...new Set(itens.map(item => item.id).filter(Boolean))];
            const produtosUnicos = await ProdutoModel.buscarVariosPorId(idsUnicos);
            const porId = new Map(produtosUnicos.map(p => [p.id, p]));

            const indisponiveis = idsUnicos.filter(id => !porId.has(id));
            if (indisponiveis.length) {
                return res.status(409).json({ erro: 'Há peças indisponíveis na seleção. Substitua-as antes de gerar o PDF.', indisponiveis });
            }

            const rotuloPosicao = posicao =>
                posicao === 'dianteira' ? ' (dianteira)' : posicao === 'traseira' ? ' (traseira)' : '';

            const linhas = itens
                .map(item => {
                    const produto = porId.get(item.id);
                    if (!produto) return null;
                    return {
                        nome: produto.nome + rotuloPosicao(item.posicao),
                        preco: Number(produto.preco),
                        link: produto.link || null
                    };
                })
                .filter(Boolean);

            if (linhas.length === 0) {
                return res.status(400).json({ erro: 'Nenhuma das peças enviadas foi encontrada.' });
            }

            const total = linhas.reduce((soma, linha) => soma + linha.preco, 0);
            const nomeUsuario = req.session.user ? req.session.user.nome : 'Visitante';

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="bikonfig-resumo-configuracao.pdf"');

            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            doc.pipe(res);

            doc.fillColor('#ff6600').fontSize(22).text('Bikonfig', { continued: false });
            doc.fillColor('#333').fontSize(14).text('Lista de peças da sua bicicleta', { continued: false });
            doc.moveDown(0.3);
            doc.fillColor('#888').fontSize(9).text('Gerado para: ' + nomeUsuario);
            doc.fillColor('#888').fontSize(9).text('Data: ' + new Date().toLocaleDateString('pt-BR'));
            doc.moveDown(1);

            const colunaNomeX = 50;
            const colunaPrecoX = 330;
            const colunaLinkX = 410;
            const larguraPagina = doc.page.width - 100;

            function desenharCabecalhoTabela() {
                doc.fontSize(10).fillColor('#666');
                doc.text('Peça', colunaNomeX, doc.y, { continued: false });
                doc.text('Preço', colunaPrecoX, doc.y - doc.currentLineHeight(), { continued: false });
                doc.text('Link para compra', colunaLinkX, doc.y - doc.currentLineHeight(), { continued: false });
                doc.moveDown(0.3);
                doc.moveTo(colunaNomeX, doc.y).lineTo(colunaNomeX + larguraPagina, doc.y).strokeColor('#ddd').stroke();
                doc.moveDown(0.5);
            }

            desenharCabecalhoTabela();

            linhas.forEach(linha => {
                if (doc.y > doc.page.height - 100) {
                    doc.addPage();
                    desenharCabecalhoTabela();
                }

                const yLinha = doc.y;
                doc.fillColor('#333').fontSize(10).text(linha.nome, colunaNomeX, yLinha, { width: 270 });
                const yDepoisNome = doc.y;

                doc.fillColor('#ff6600').fontSize(10)
                    .text('R$ ' + linha.preco.toFixed(2), colunaPrecoX, yLinha, { width: 70 });

                if (linha.link) {
                    doc.fillColor('#0066cc').fontSize(9)
                        .text('Ver produto', colunaLinkX, yLinha, {
                            width: larguraPagina - (colunaLinkX - colunaNomeX),
                            link: linha.link,
                            underline: true
                        });
                } else {
                    doc.fillColor('#999').fontSize(9).text('Link indisponível', colunaLinkX, yLinha);
                }

                doc.y = Math.max(yDepoisNome, doc.y) + 8;
                doc.moveTo(colunaNomeX, doc.y).lineTo(colunaNomeX + larguraPagina, doc.y).strokeColor('#f0f0f0').stroke();
                doc.moveDown(0.5);
            });

            doc.moveDown(0.5);
            doc.fontSize(13).fillColor('#333').text('Total: ', colunaNomeX, doc.y, { continued: true });
            doc.fillColor('#ff6600').fontSize(13).text('R$ ' + total.toFixed(2));

            doc.moveDown(1.5);
            doc.fontSize(8).fillColor('#aaa').text(
                'Gerado automaticamente pelo configurador Bikonfig. Preços podem mudar sem aviso — confira sempre no link antes de comprar.',
                colunaNomeX, doc.y, { width: larguraPagina }
            );

            doc.end();
        } catch (erro) {
            console.error('Erro ao gerar PDF:', erro);
            if (!res.headersSent) {
                res.status(500).json({ erro: 'Erro ao gerar o PDF.' });
            }
        }
    },

    exibirMinhasConfiguracoes: async (req, res) => {
        const configuracoes = await ConfiguracaoModel.listarPorUsuario(req.session.user.id);

        res.render('minhas-configuracoes', {
            usuario: req.session.user,
            configuracoes: configuracoes
        });
    },

    salvarConfiguracao: async (req, res) => {
        try {
            const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
            const itens = Array.isArray(req.body.itens) ? req.body.itens : [];

            if (!nome) {
                return res.status(400).json({ erro: 'Dê um nome para a configuração.' });
            }

            const idsValidos = itens
                .map(item => item && item.id)
                .filter(Boolean);

            if (idsValidos.length === 0) {
                return res.status(400).json({ erro: 'Selecione ao menos uma peça antes de salvar.' });
            }

            const itensParaSalvar = itens
                .filter(item => item && item.id)
                .map(item => ({ id: item.id, posicao: item.posicao || null }));

            const produtos = await ProdutoModel.buscarVariosPorId([...new Set(idsValidos)]);
            const disponiveis = new Set(produtos.map(produto => produto.id));
            if (idsValidos.some(id => !disponiveis.has(id))) {
                return res.status(409).json({ erro: 'Há peças indisponíveis na seleção. Substitua-as antes de salvar.' });
            }

            const configuracao = await ConfiguracaoModel.salvar(req.session.user.id, nome, itensParaSalvar);
            res.json({ id: configuracao.id, nome: configuracao.nome });
        } catch (erro) {
            console.error('Erro ao salvar configuração:', erro);
            res.status(500).json({ erro: 'Erro ao salvar a configuração.' });
        }
    },

    carregarConfiguracao: async (req, res) => {
        try {
            const configuracao = await ConfiguracaoModel.buscarPorId(req.params.id, req.session.user.id);
            if (!configuracao) {
                return res.status(404).json({ erro: 'Configuração não encontrada.' });
            }

            const itensSalvos = await ConfiguracaoModel.listarItens(configuracao.id);
            const produtos = await ProdutoModel.buscarVariosPorId(itensSalvos.map(item => item.id));
            const produtoPorId = new Map(produtos.map(produto => [produto.id, produto]));

            // Um produto pode ocupar mais de uma posição na mesma montagem.
            const itens = itensSalvos.filter(item => produtoPorId.has(item.id)).map(item => {
                const produto = produtoPorId.get(item.id);
                return {
                    id: produto.id,
                    nome: produto.nome,
                    preco: produto.preco,
                    imagem: produto.imagem,
                    aro: produto.aro,
                    subcategoria: produto.subcategoria,
                    posicao: item.posicao || null
                };
            });

            const indisponiveis = itensSalvos.filter(item => !produtoPorId.has(item.id)).map(item => ({
                id: item.id, nome: item.nome || 'Peça indisponível', posicao: item.posicao || null
            }));
            res.json({ id: configuracao.id, nome: configuracao.nome, itens, indisponiveis });
        } catch (erro) {
            console.error('Erro ao carregar configuração:', erro);
            res.status(500).json({ erro: 'Erro ao carregar a configuração.' });
        }
    },

    excluirConfiguracao: async (req, res) => {
        try {
            await ConfiguracaoModel.excluir(req.params.id, req.session.user.id);
        } catch (erro) {
            console.error('Erro ao excluir configuração:', erro);
        }
        res.redirect('/catalogo/minhas-configuracoes');
    }
};

module.exports = catalogoController;
