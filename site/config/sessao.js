const NOME_COOKIE = 'bikonfig.sid';
const NOME_COOKIE_FIREBASE = 'bikonfig.firebase';

function opcoesSessao(env, store) {
    const secret = env.SECRET;
    if (!secret || Buffer.byteLength(secret) < 32 || /troque|COLE_A_/i.test(secret)) {
        throw new Error('Configure SECRET com pelo menos 32 bytes aleatórios.');
    }
    return {
        name: NOME_COOKIE, secret, store, resave: false, saveUninitialized: false,
        cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 3600000 }
    };
}

function autenticarSessao(req, usuario, firebaseAuth = null) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(erro => {
            if (erro) return reject(erro);
            req.session.user = { id: usuario.id, nome: usuario.nome, email: usuario.email, isAdmin: usuario.isAdmin === true };
            if (Number.isInteger(usuario.senhaVersao)) req.session.user.senhaVersao = usuario.senhaVersao;
            if (firebaseAuth) req.session.firebaseAuth = firebaseAuth;
            req.session.save(erroSalvar => erroSalvar ? reject(erroSalvar) : resolve());
        });
    });
}

module.exports = { NOME_COOKIE, NOME_COOKIE_FIREBASE, opcoesSessao, autenticarSessao };
