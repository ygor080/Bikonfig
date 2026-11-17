// Defesa adicional: os dados ainda precisam de escape e validação de URLs.
module.exports = function segurancaConteudo(req, res, next) {
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'",
        "frame-ancestors 'none'", "img-src 'self' https: http:",
        "style-src 'self' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'", "form-action 'self'"
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
};
