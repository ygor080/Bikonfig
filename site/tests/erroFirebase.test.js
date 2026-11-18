const test = require('node:test');
const assert = require('node:assert/strict');
const { responderFalhaFirebase } = require('../config/erroFirebase');
test('diagnóstico separa credencial, banco e sessão sem expor mensagens, tokens ou dados da conta', t => {
    const logs = t.mock.method(console, 'error', () => {});
    for (const [etapa, code, esperado] of [
        ['provedor', 'ENOENT', 'FIREBASE_CREDENCIAL_INVALIDA'],
        ['provedor', 'auth/insufficient-permission', 'FIREBASE_CREDENCIAL_INVALIDA'],
        ['identidade', '42P01', 'FIREBASE_BANCO_NAO_CONFIGURADO'],
        ['identidade', '42501', 'FIREBASE_BANCO_NAO_CONFIGURADO'],
        ['identidade', 'ECONNREFUSED', 'FIREBASE_BANCO_INDISPONIVEL'],
        ['sessao', 'ETIMEDOUT', 'FIREBASE_SESSAO_INDISPONIVEL'],
        ['provedor', 'CODIGO_COM_SEGREDO', 'FIREBASE_INDISPONIVEL']]) {
        let body;
        const res = { status(n) { assert.equal(n, 503); return this; }, json(dados) { body = dados; } };
        responderFalhaFirebase(res, { code, message: 'TOKEN_SECRETO email@teste.com', token: 'TOKEN_SECRETO' }, etapa);
        assert.equal(body.codigo, esperado);
        assert.ok(!JSON.stringify(body).includes('TOKEN_SECRETO'));
    }
    const texto = JSON.stringify(logs.mock.calls.map(c => c.arguments));
    assert.ok(!texto.includes('TOKEN_SECRETO')); assert.ok(!texto.includes('email@teste.com'));
    assert.ok(!texto.includes('CODIGO_COM_SEGREDO'));
});
