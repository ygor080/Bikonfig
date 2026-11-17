(function (criar) {
    if (typeof module === 'object' && module.exports) module.exports = criar();
    else window.BikonfigRascunho = criar();
})(function () {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const VALIDADE = 7 * 24 * 60 * 60 * 1000;
    function chave(usuario, configuracao) {
        if (!UUID.test(usuario) || (configuracao && !UUID.test(configuracao))) return null;
        return 'bikonfig:rascunho:v1:' + usuario.toLowerCase() + ':' + (configuracao ? configuracao.toLowerCase() : 'nova');
    }
    function validar(dados, agora = Date.now()) {
        return dados && dados.versao === 1 && Number.isFinite(dados.atualizadoEm)
            && dados.atualizadoEm <= agora && agora - dados.atualizadoEm <= VALIDADE
            && ['com-marchas', 'single-speed', 'suspensao-total'].includes(dados.tipoMontagem)
            && Array.isArray(dados.itens) && dados.itens.length <= 100
            && dados.itens.every(item => item && typeof item.id === 'string' && UUID.test(item.id)
                && typeof item.subcategoria === 'string' && item.subcategoria.length <= 80
                && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.subcategoria)
                && (item.posicao === null || ['dianteira', 'traseira'].includes(item.posicao)));
    }
    function criar(storage, usuario) {
        return {
            ler(configuracao) {
                const nome = chave(usuario, configuracao);
                if (!nome) return null;
                const texto = storage.getItem(nome);
                if (!texto) return null;
                let dados;
                try { dados = JSON.parse(texto); } catch { /* Rascunho inválido é descartado. */ }
                if (!validar(dados)) { storage.removeItem(nome); return null; }
                return dados;
            },
            salvar(configuracao, itens, tipoMontagem) {
                const nome = chave(usuario, configuracao);
                const dados = { versao: 1, atualizadoEm: Date.now(), tipoMontagem,
                    itens: itens.map(item => ({ id: item.id, subcategoria: item.subcategoria, posicao: item.posicao || null })) };
                if (!nome || !validar(dados)) throw new Error('Rascunho inválido.');
                storage.setItem(nome, JSON.stringify(dados));
            },
            remover(configuracao) {
                const nome = chave(usuario, configuracao);
                if (nome) storage.removeItem(nome);
            }
        };
    }
    return { criar, chave, validar };
});
