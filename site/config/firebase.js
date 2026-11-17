const PROJETO = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const dominioValido = valor => typeof valor === 'string' && valor.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(valor);

function lerConfigFirebase(env = process.env) {
    if (env.FIREBASE_ENABLED === undefined || env.FIREBASE_ENABLED === 'false') return { habilitado: false };
    if (env.FIREBASE_ENABLED !== 'true') throw new Error('FIREBASE_ENABLED deve ser true ou false.');
    const projectId = env.FIREBASE_PROJECT_ID?.trim();
    const apiKey = env.FIREBASE_WEB_API_KEY?.trim();
    const authDomain = env.FIREBASE_AUTH_DOMAIN?.trim();
    const appId = env.FIREBASE_WEB_APP_ID?.trim();
    if (!projectId || !PROJETO.test(projectId)) throw new Error('Configure FIREBASE_PROJECT_ID.');
    if (!apiKey || apiKey.length < 20 || apiKey.length > 200 || /COLE_|troque/i.test(apiKey)) throw new Error('Configure FIREBASE_WEB_API_KEY.');
    if (!dominioValido(authDomain)) throw new Error('Configure FIREBASE_AUTH_DOMAIN apenas com o domínio.');
    if (!appId || !/^1:\d+:web:[a-f0-9]+$/i.test(appId)) throw new Error('Configure FIREBASE_WEB_APP_ID do aplicativo web.');
    let dominios;
    try { dominios = JSON.parse(env.FIREBASE_AUTHORIZED_DOMAINS_JSON || '[]'); } catch { throw new Error('FIREBASE_AUTHORIZED_DOMAINS_JSON inválido.'); }
    if (!Array.isArray(dominios) || !dominios.length || dominios.length > 20 || !dominios.every(dominioValido)) {
        throw new Error('Declare os domínios autorizados em FIREBASE_AUTHORIZED_DOMAINS_JSON.');
    }
    if (env.NODE_ENV === 'production' && env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulador Firebase não é permitido em produção.');
    if (env.FIREBASE_WEB_ENABLED && !['true', 'false'].includes(env.FIREBASE_WEB_ENABLED)) throw new Error('FIREBASE_WEB_ENABLED deve ser true ou false.');
    if (env.FIREBASE_LEGACY_ENABLED !== undefined && !['true', 'false'].includes(env.FIREBASE_LEGACY_ENABLED)) throw new Error('FIREBASE_LEGACY_ENABLED deve ser true ou false.');
    if (env.FIREBASE_LEGACY_ENABLED === 'false' && env.FIREBASE_WEB_ENABLED !== 'true') throw new Error('Mantenha a interface Firebase ativa antes de encerrar o acesso antigo.');
    return { habilitado: true, projectId, dominios: [...new Set(dominios)],
        webHabilitado: env.FIREBASE_WEB_ENABLED === 'true',
        legadoHabilitado: env.FIREBASE_LEGACY_ENABLED !== 'false',
        publica: { apiKey, authDomain, projectId, appId } };
}

function obterFirebaseAuth(env = process.env) {
    const config = lerConfigFirebase(env);
    if (!config.habilitado) throw new Error('Firebase ainda não habilitado.');
    // Credenciais são lidas pelo SDK via ADC. Não há chave privada na configuração pública.
    const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
    const nome = 'bikonfig-' + config.projectId;
    const app = getApps().find(app => app.name === nome)
        || initializeApp({ projectId: config.projectId, credential: applicationDefault() }, nome);
    return require('firebase-admin/auth').getAuth(app);
}
module.exports = { lerConfigFirebase, obterFirebaseAuth };
