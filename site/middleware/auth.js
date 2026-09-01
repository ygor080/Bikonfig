const authMiddleware = {
    verificarLogin: (req, res, next) => {
        if (req.session.user) {
            next();
        } else {
            res.redirect('/login');
        }
    },

    verificarAdmin: (req, res, next) => {
        if (!req.session.user) return res.redirect('/login');
        if (req.session.user.isAdmin === true) {
            next();
        } else {
            res.status(403).render('erro', {
                usuario: req.session.user,
                titulo: 'Acesso negado',
                mensagem: 'Essa área é restrita a administradores.'
            });
        }
    }
};

module.exports = authMiddleware;
