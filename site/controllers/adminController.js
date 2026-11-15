const ProdutoModel = require('../models/produtoModel');

function parseSpecsTexto(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return {};

    const specs = {};
    texto.split('\n').forEach(linha => {
        const separador = linha.indexOf(':');
        if (separador === -1) return;

        const chave = linha.slice(0, separador).trim();
        const valor = linha.slice(separador + 1).trim();
        if (chave && valor) specs[chave] = valor;
    });
    return specs;
}

function specsParaTexto(specs) {
    if (!specs || typeof specs !== 'object') return '';
    return Object.entries(specs).map(([chave, valor]) => `${chave}: ${valor}`).join('\n');
}

const adminController = {
    exibirRevisao: async (req, res) => {
        const [produtos, categorias] = await Promise.all([
            ProdutoModel.listarParaRevisao(),
            ProdutoModel.listarCategoriasFlat()
        ]);

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

        await ProdutoModel.aprovarProduto(id, {
            categoriaSlug: categoria,
            specs: parseSpecsTexto(specsTexto),
            fabricante
        });

        res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Produto aprovado.'));
    },

    rejeitarProduto: async (req, res) => {
        const { id } = req.params;
        await ProdutoModel.rejeitarProduto(id);
        res.redirect('/admin/revisao?mensagem=' + encodeURIComponent('Produto rejeitado e removido.'));
    }
};

module.exports = adminController;
