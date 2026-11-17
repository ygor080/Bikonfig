const ColetaModel = require('../models/coletaModel');
module.exports = {
    exibir: async (req, res) => res.render('admin-coletas', {
        usuario: req.session.user, ...await ColetaModel.consultar()
    })
};
