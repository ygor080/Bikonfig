const { QualidadeCatalogoModel } = require('../models/qualidadeCatalogoModel');
module.exports = {
    exibir: async (req, res) => res.render('admin-qualidade', {
        usuario: req.session.user, ...await QualidadeCatalogoModel.consultar()
    })
};
