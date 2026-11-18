const { createHash } = require('node:crypto');
module.exports = function versaoConfiguracao(config, itens) {
    const aplicacoes = itens.map(i=>({id:i.id,posicao:i.posicao||null})).sort((a,b)=>a.id.localeCompare(b.id)||String(a.posicao).localeCompare(String(b.posicao)));
    return createHash('sha256').update(JSON.stringify({ nome:config.nome, tipo:config.tipo_montagem||config.tipoMontagem||'com-marchas', itens:aplicacoes })).digest('hex');
};
