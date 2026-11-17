const { randomBytes, timingSafeEqual } = require('node:crypto');
const FORMATO = /^[0-9a-f]{64}$/;
module.exports = function protegerCsrf(req, res, next) {
    const leitura = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!leitura) {
        const header = req.get('x-csrf-token');
        const campo = req.body?._csrf;
        const recebido = header || campo;
        const esperado = req.session.csrfToken;
        if (req.get('sec-fetch-site') === 'cross-site' || typeof recebido !== 'string' || !FORMATO.test(recebido)
            || typeof esperado !== 'string' || !FORMATO.test(esperado)
            || (header && campo !== undefined && header !== campo)
            || !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(403).json({ erro: 'Sessão ou formulário expirado. Recarregue a página e tente novamente.', codigo: 'CSRF_INVALIDO' });
        }
        if (req.body && Object.hasOwn(req.body, '_csrf')) delete req.body._csrf;
    }
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
    res.locals.csrfToken = req.session.csrfToken;
    res.setHeader('Cache-Control', 'no-store');
    next();
};
