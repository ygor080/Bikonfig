// Defesa adicional: os dados ainda precisam de escape e validação de URLs.
module.exports = function segurancaConteudo(req, res, next) {
    const firebase = res.locals?.firebaseConexoes && res.locals?.firebaseAuthDomain;
    const origem = firebase ? 'https://' + res.locals.firebaseAuthDomain : '';
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'", firebase ? "script-src 'self' https://apis.google.com" : "script-src 'self'", "object-src 'none'", "base-uri 'self'",
        firebase ? 'frame-src ' + origem : "frame-src 'none'",
        "frame-ancestors 'none'", "img-src 'self' https: http:",
        "style-src 'self' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
        (res.locals?.firebaseConexoes ? "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com" + (firebase ? ' ' + origem : '') : "connect-src 'self'"), "form-action 'self'"
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
};
