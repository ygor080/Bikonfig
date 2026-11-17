const express = require('express');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const texto = (valor, max, vazio = false) => typeof valor === 'string'
    && (vazio || valor.trim().length > 0) && valor.length <= max && !valor.includes('\0');
const campos = (valor, permitidos) => objeto(valor) && Object.keys(valor).every(chave => permitidos.includes(chave));

function rejeitar(res, mensagem) { return res.status(400).json({ erro: mensagem }); }
function validarId(req, res, next) {
    if (!UUID.test(req.params.id)) return rejeitar(res, 'Identificador inválido.');
    next();
}
function validarSubcategoria(req, res, next) {
    if (!texto(req.params.subcategoria, 80) || !SLUG.test(req.params.subcategoria)) return rejeitar(res, 'Categoria inválida.');
    next();
}
function validarBusca(req, res, next) {
    if (req.query.pagina !== undefined && (typeof req.query.pagina !== 'string' || !/^[1-9]\d{0,4}$/.test(req.query.pagina)
        || Number(req.query.pagina) > 10000)) return rejeitar(res, 'Informe uma página entre 1 e 10000.');
    if (req.query.busca !== undefined && !texto(req.query.busca, 200, true)) return rejeitar(res, 'Informe uma busca de até 200 caracteres.');
    next();
}
function validarSelecao(modo) {
    return (req, res, next) => {
        const body = req.body;
        const permitidos = modo === 'salvar' ? ['nome', 'itens', 'tipoMontagem']
            : modo === 'pdf' ? ['itens'] : ['ids', 'itens', 'tipoMontagem'];
        if (!campos(body, permitidos)) return rejeitar(res, 'Formato da seleção inválido.');
        if (body.tipoMontagem !== undefined && !['com-marchas', 'single-speed', 'suspensao-total'].includes(body.tipoMontagem)) {
            return rejeitar(res, 'Tipo de montagem inválido.');
        }
        if (modo === 'salvar' && !texto(body.nome, 100)) return rejeitar(res, 'Informe um nome de até 100 caracteres.');
        const itens = body.itens;
        const ids = body.ids;
        if (itens === undefined && (modo !== 'orcamento' || ids === undefined)) return rejeitar(res, 'Informe a lista de peças.');
        if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || !ids.every(id => typeof id === 'string' && UUID.test(id)))) {
            return rejeitar(res, 'Informe até 100 identificadores de peças válidos.');
        }
        if (itens !== undefined && (!Array.isArray(itens) || itens.length > 100 || !itens.every(item =>
            campos(item, ['id', 'posicao']) && typeof item.id === 'string' && UUID.test(item.id)
            && (item.posicao === undefined || item.posicao === null || ['dianteira', 'traseira'].includes(item.posicao))))) {
            return rejeitar(res, 'Informe até 100 peças com identificadores e posições válidos.');
        }
        if (itens && ids && (itens.length !== ids.length || itens.some((item, i) => item.id !== ids[i]))) {
            return rejeitar(res, 'As listas de peças enviadas são diferentes.');
        }
        if (modo !== 'orcamento' && itens.length === 0) return rejeitar(res, 'Selecione ao menos uma peça.');
        // UUIDs são insensíveis a maiúsculas no PostgreSQL; mantenha as chaves dos Maps iguais às do banco.
        if (itens) itens.forEach(item => { item.id = item.id.toLowerCase(); });
        if (ids) body.ids = ids.map(id => id.toLowerCase());
        next();
    };
}
function validarRevisao(req, res, next) {
    const body = req.body;
    if (!campos(body, ['categoria', 'fabricante', 'specsTexto'])
        || !texto(body.categoria, 80) || !SLUG.test(body.categoria)
        || (body.fabricante !== undefined && !texto(body.fabricante, 200, true))
        || (body.specsTexto !== undefined && !texto(body.specsTexto, 20000, true))) {
        return rejeitar(res, 'Dados de revisão inválidos. Verifique categoria, fabricante e especificações.');
    }
    next();
}
function parsersRequisicao() {
    return [express.json({ limit: '64kb', strict: true }),
        express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 20 })];
}
function erroRequisicao(erro, req, res, next) {
    const mensagens = { 'entity.parse.failed': [400, 'Corpo JSON inválido.'],
        'entity.too.large': [413, 'Requisição maior que o limite de 64 KB.'],
        'parameters.too.many': [413, 'Quantidade de campos acima do limite.'],
        'charset.unsupported': [415, 'Codificação não suportada.'],
        'encoding.unsupported': [415, 'Codificação não suportada.'] };
    const resposta = Object.hasOwn(mensagens, erro.type) ? mensagens[erro.type] : null;
    if (!resposta) return next(erro);
    res.status(resposta[0]).json({ erro: resposta[1] });
}
module.exports = { validarId, validarSubcategoria, validarBusca, validarSelecao, validarRevisao, parsersRequisicao, erroRequisicao };
