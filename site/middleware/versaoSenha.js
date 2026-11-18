module.exports = function versaoSenha({ env, pool }) {
    let colunaAusente = false;
    return async (req, res, next) => {
        if (!req.session.user || req.session.firebaseAuth || req.path === '/logout') return next();
        if (colunaAusente && env.RECUPERACAO_SENHA_ENABLED!=='true') return next();
        let rows;
        try { ({ rows } = await pool.query('SELECT senha_versao FROM usuarios WHERE id=$1', [req.session.user.id])); }
        catch (e) { if (e.code==='42703' && env.RECUPERACAO_SENHA_ENABLED!=='true') { colunaAusente=true; return next(); } throw e; }
        if (rows.length && rows[0].senha_versao === (req.session.user.senhaVersao ?? 0)) return next();
        await new Promise((resolve, reject) => req.session.destroy(e => e ? reject(e) : resolve()));
        res.clearCookie('bikonfig.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV==='production' });
        return req.method==='GET' ? res.redirect('/login') : res.status(401).json({ erro: 'Senha alterada. Entre novamente.', codigo: 'SESSAO_EXPIRADA' });
    };
};
