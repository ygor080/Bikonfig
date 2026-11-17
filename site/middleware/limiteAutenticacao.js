const { rateLimit } = require('express-rate-limit');

function criarLimiteAutenticacao(limit = 15) {
    return rateLimit({
        windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
        message: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.'
    });
}

module.exports = { criarLimiteAutenticacao };
