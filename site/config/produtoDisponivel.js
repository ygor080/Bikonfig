// Critério compartilhado pelo catálogo, seleção e configurações salvas.
module.exports = require('./produtoPublicavel') + ' AND p.in_stock IS DISTINCT FROM false';
