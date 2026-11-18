const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
function configuracao(env) {
    if (env.RECUPERACAO_SENHA_ENABLED !== undefined && !['true','false'].includes(env.RECUPERACAO_SENHA_ENABLED)) throw new Error('RECUPERACAO_SENHA_ENABLED inválido.');
    if (env.RECUPERACAO_SENHA_ENABLED !== 'true') return null;
    const url = new URL(env.PUBLIC_BASE_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
        || !(url.protocol === 'https:' || url.protocol === 'http:' && env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('PUBLIC_BASE_URL inválida.');
    if (!env.RESEND_API_KEY || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM || '')
        || Buffer.byteLength(env.SECRET || '') < 32) throw new Error('Configure o serviço de e-mail e SECRET.');
    return { base: url.origin, key: createHash('sha256').update('bikonfig-recuperacao:' + env.SECRET).digest() };
}
function cifrar(dados, chave) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', chave, iv);
    const texto = Buffer.concat([cipher.update(JSON.stringify(dados), 'utf8'), cipher.final()]);
    return JSON.stringify([iv.toString('hex'), cipher.getAuthTag().toString('hex'), texto.toString('hex')]);
}
function decifrar(payload, chave) {
    const [iv, tag, texto] = JSON.parse(payload), cipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(texto, 'hex')), cipher.final()]).toString('utf8'));
}
const hashToken = token => createHash('sha256').update(token).digest('hex');
module.exports = { configuracao, cifrar, decifrar, hashToken };
