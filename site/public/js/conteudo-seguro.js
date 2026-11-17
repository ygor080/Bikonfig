(function (criar) {
    if (typeof module === 'object' && module.exports) module.exports = criar();
    else window.BikonfigConteudoSeguro = criar();
})(function () {
    function textoSeguro(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[caractere]);
    }

    function urlExternaSegura(valor) {
        if (typeof valor !== 'string' || /[\u0000-\u001f\u007f-\u009f\\]/.test(valor)) return null;
        const texto = valor.trim();
        if (!/^https?:\/\//i.test(texto)) return null;
        try {
            const url = new URL(texto);
            if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
            return url.href;
        } catch { return null; }
    }

    function iconeLocalSeguro(valor) {
        return typeof valor === 'string' && /^\/img\/pecas\/[a-z0-9-]+\.svg$/.test(valor) ? valor : null;
    }

    function urlImagemSegura(valor, alternativa) {
        return iconeLocalSeguro(valor) || urlExternaSegura(valor)
            || iconeLocalSeguro(alternativa) || '/img/pecas/quadro.svg';
    }

    return { textoSeguro, urlExternaSegura, urlImagemSegura };
});
