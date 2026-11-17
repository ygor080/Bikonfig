const ProdutoModel = require('../models/produtoModel');

function parseSpecsTexto(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return {};

    const specs = Object.create(null);
    texto.split('\n').forEach(linha => {
        const separador = linha.indexOf(':');
        if (!linha.trim()) return;
        if (separador === -1) throw new Error('Use uma especificação por linha no formato chave: valor.');

        const chave = linha.slice(0, separador).trim();
        const valor = linha.slice(separador + 1).trim();
        if (!/^[a-z][a-z0-9_]{0,79}$/.test(chave) || ['constructor', 'prototype', '__proto__'].includes(chave)
            || !valor || Object.hasOwn(specs, chave)) throw new Error('Há uma chave inválida, repetida ou sem valor.');
        if (chave && valor) {
            try { specs[chave] = JSON.parse(valor); }
            catch {
                if (/^[\[{\"]/.test(valor)) throw new Error('Há um valor JSON incompleto.');
                specs[chave] = valor;
            }
        }
    });
    return specs;
}

function specsParaTexto(specs) {
    if (!specs || typeof specs !== 'object') return '';
    return Object.entries(specs).map(([chave, valor]) => `${chave}: ${JSON.stringify(valor)}`).join('\n');
}

const adminController = {
    exibirRevisao: async (req, res) => {
        const [produtos, categorias] = await Promise.all([
            ProdutoModel.listarParaRevisao(req.params?.id),
            ProdutoModel.listarCategoriasFlat()
        ]);
        if (req.params?.id && !produtos.length) return res.status(404).render('erro', {
            usuario: req.session.user, titulo: 'Produto não encontrado', mensagem: 'Produto não encontrado.'
        });

        const produtosComTexto = produtos.map(p => ({
            ...p,
            specsTexto: specsParaTexto(p.specs)
        }));

        res.render('admin-revisao', {
            usuario: req.session.user,
            produtos: produtosComTexto,
            categorias,
            mensagem: req.query.mensagem || null
        });
    },

    aprovarProduto: async (req, res) => {
        const { id } = req.params;
        const { categoria, specsTexto, fabricante } = req.body;
        if (fabricante !== undefined && (typeof fabricante !== 'string' || fabricante.trim().length > 200)) {
            return res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Informe um fabricante de até 200 caracteres ou deixe o campo vazio.'));
        }

        if (!categoria) {
            return res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Escolha uma categoria antes de aprovar.'));
        }

        let specs;
        try { specs = parseSpecsTexto(specsTexto); }
        catch (erro) { return res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Especificações inválidas. ' + erro.message)); }
        const aprovado = await ProdutoModel.aprovarProduto(id, {
            categoriaSlug: categoria,
            specs,
            fabricante,
            revisadoPor: req.session?.user?.id
        });
        if (aprovado === false) return res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Produto ou categoria não encontrado, ou produto vinculado como duplicata. Nenhuma aprovação realizada.'));

        res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Produto aprovado.'));
    },

    rejeitarProduto: async (req, res) => {
        const { id } = req.params;
        await ProdutoModel.rejeitarProduto(id);
        res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Produto rejeitado e desativado. Montagens e histórico foram preservados.'));
    }
};

module.exports = adminController;
