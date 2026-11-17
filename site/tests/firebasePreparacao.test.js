const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { lerConfigFirebase, obterFirebaseAuth } = require('../config/firebase');
const { verificarCredencial } = require('../config/verificacaoFirebase');
const ambiente = () => ({ FIREBASE_ENABLED: 'true', FIREBASE_PROJECT_ID: 'bikonfig-test',
    FIREBASE_WEB_API_KEY: 'AIza-chave-publica-de-exemplo-123456789', FIREBASE_AUTH_DOMAIN: 'bikonfig-test.firebaseapp.com',
    FIREBASE_WEB_APP_ID: '1:123456789:web:abcdef123456', FIREBASE_AUTHORIZED_DOMAINS_JSON: '["localhost","bikonfig.onrender.com"]' });

test('Firebase fica inativo por padrão e configuração pública não inclui credenciais de servidor', () => {
    assert.deepEqual(lerConfigFirebase({}), { habilitado: false });
    const config = lerConfigFirebase({ ...ambiente(), GOOGLE_APPLICATION_CREDENTIALS: '/arquivo-privado', privateKey: 'SEGREDO' });
    assert.deepEqual(Object.keys(config.publica).sort(), ['apiKey', 'appId', 'authDomain', 'projectId']);
    assert.ok(!JSON.stringify(config).includes('arquivo-privado'));
    assert.ok(!JSON.stringify(config).includes('SEGREDO'));
    assert.equal(config.publica.projectId, 'bikonfig-test');
});

test('configuração rejeita flags, projetos, domínios e emulador inadequados sem expor valores', () => {
    for (const alteracao of [{ FIREBASE_ENABLED: 'sim' }, { FIREBASE_PROJECT_ID: '' },
        { FIREBASE_AUTH_DOMAIN: 'https://dominio.test' }, { FIREBASE_WEB_APP_ID: 'app-invalido' },
        { FIREBASE_AUTHORIZED_DOMAINS_JSON: '["dominio.test/caminho"]' }, { FIREBASE_AUTHORIZED_DOMAINS_JSON: '[]' },
        { FIREBASE_AUTHORIZED_DOMAINS_JSON: '{}' }, { NODE_ENV: 'production', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }]) {
        assert.throws(() => lerConfigFirebase({ ...ambiente(), ...alteracao }));
    }
    const antes = require('firebase-admin/app').getApps().length;
    assert.throws(() => obterFirebaseAuth({ FIREBASE_ENABLED: 'false' }), /não habilitado/);
    assert.equal(require('firebase-admin/app').getApps().length, antes);
});

test('pré-verificação de credencial confere chave RSA e projeto sem acesso remoto ou saída de segredo', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
    const config = lerConfigFirebase(ambiente());
    const env = { GOOGLE_APPLICATION_CREDENTIALS: '/secret-file' };
    const credencial = { type: 'service_account', project_id: config.projectId,
        client_email: 'firebase@bikonfig-test.iam.gserviceaccount.com', private_key: privateKey };
    assert.deepEqual(verificarCredencial(config, env, () => JSON.stringify(credencial)), []);
    for (const texto of ['INVALIDO', JSON.stringify({ ...credencial, project_id: 'outro-projeto' }), JSON.stringify({ ...credencial, private_key: 'SEGREDO' })]) {
        const pendencias = verificarCredencial(config, env, () => texto);
        assert.equal(pendencias.length, 1);
        assert.ok(!JSON.stringify(pendencias).includes('SEGREDO'));
        assert.ok(!JSON.stringify(pendencias).includes(privateKey));
    }
    assert.equal(verificarCredencial(config, {}).length, 1);
});


test('corte do acesso antigo exige interface Firebase ativa e flag válida', () => {
    assert.throws(() => lerConfigFirebase({ ...ambiente(), FIREBASE_LEGACY_ENABLED: 'talvez' }));
    assert.throws(() => lerConfigFirebase({ ...ambiente(), FIREBASE_LEGACY_ENABLED: 'false', FIREBASE_WEB_ENABLED: 'false' }));
    assert.equal(lerConfigFirebase({ ...ambiente(), FIREBASE_LEGACY_ENABLED: 'false', FIREBASE_WEB_ENABLED: 'true' }).legadoHabilitado, false);
    assert.equal(lerConfigFirebase(ambiente()).legadoHabilitado, true);
});
