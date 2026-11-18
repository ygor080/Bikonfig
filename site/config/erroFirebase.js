// Apenas códigos conhecidos são registrados: nunca mensagens, tokens ou credenciais.
const codigosSeguros = new Set(['ENOENT', 'EACCES', '42P01', '42703', '42501', '57014',
    'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'app/invalid-credential', 'app/invalid-app-options',
    'app/network-error', 'auth/invalid-credential', 'auth/insufficient-permission', 'auth/internal-error']);
function responderFalhaFirebase(res, erro, etapa) {
    const codigo = codigosSeguros.has(erro?.code) ? erro.code : 'NAO_CLASSIFICADO';
    require('./observabilidade').registrarErro('google_' + etapa, { code: codigo });
    let publico = 'FIREBASE_INDISPONIVEL';
    if (etapa === 'identidade') publico = ['42P01', '42703', '42501'].includes(codigo)
        ? 'FIREBASE_BANCO_NAO_CONFIGURADO' : 'FIREBASE_BANCO_INDISPONIVEL';
    else if (etapa === 'sessao') publico = 'FIREBASE_SESSAO_INDISPONIVEL';
    else if (['ENOENT', 'EACCES', 'app/invalid-credential', 'app/invalid-app-options',
        'auth/invalid-credential', 'auth/insufficient-permission'].includes(codigo)) publico = 'FIREBASE_CREDENCIAL_INVALIDA';
    return res.status(503).json({ erro: 'O servidor não conseguiu concluir o acesso Google.', codigo: publico });
}
module.exports = { responderFalhaFirebase };
