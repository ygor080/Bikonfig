const { configuracao } = require('../config/recuperacaoSenha');
const { criarRecuperacaoModel } = require('../models/recuperacaoSenhaModel');
function criarRotasRecuperacao({ env, pool }) {
    const router = require('express').Router(), config = configuracao(env);
    const model = config ? criarRecuperacaoModel(pool, config) : null;
    const limite = require('../middleware/limiteAutenticacao').criarLimiteAutenticacao(5);
    const render = (res, dados = {}) => res.render('senhaLocal', { habilitado: !!config, etapa: 'solicitar', erro: null, mensagem: null, token: '', ...dados });
    router.get('/recuperar-senha', (req, res) => render(res));
    router.post('/recuperar-senha', limite, async (req, res) => {
        if (!model) return render(res.status(503));
        const email = req.body?.email;
        if (typeof email !== 'string' || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return render(res.status(400), { erro: 'Informe um e-mail válido.' });
        const inicio = Date.now();
        try { await model.solicitar(email.trim().toLowerCase()); }
        catch { console.error('Não foi possível preparar a recuperação de senha.'); }
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 250-(Date.now()-inicio))));
        return render(res, { mensagem: 'Se houver uma conta por usuário e senha apta à recuperação com esse e-mail, você receberá instruções. Confira também o spam. Aguarde um minuto antes de solicitar novamente.' });
    });
    router.get('/redefinir-senha', (req, res) => {
        res.set('Referrer-Policy', 'no-referrer'); return render(res, { etapa: 'redefinir' });
    });
    router.post('/redefinir-senha', limite, async (req, res) => {
        res.set('Referrer-Policy', 'no-referrer');
        if (!model) return render(res.status(503));
        const { senha, confirmarSenha, token } = req.body || {};
        if (typeof senha !== 'string' || Buffer.byteLength(senha)>72 || !/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/s.test(senha) || senha!==confirmarSenha) {
            return render(res.status(400), { etapa: 'redefinir', erro: 'Confirme uma senha de até 72 bytes, com pelo menos 8 caracteres, maiúscula, minúscula, número e caractere especial.', token: typeof token==='string' && /^[a-f0-9]{64}$/.test(token) ? token : '' });
        }
        const ok = typeof token==='string' && await model.redefinir(token, senha);
        if (!ok) return render(res.status(400), { erro: 'Link inválido, expirado ou já utilizado. Solicite outro link.' });
        if (req.session.user) await new Promise((resolve, reject) => req.session.destroy(e => e ? reject(e) : resolve()));
        return render(res, { mensagem: 'Senha alterada. Entre novamente com seu usuário e a nova senha.' });
    });
    return router;
}
module.exports = { criarRotasRecuperacao };
