const router = require('express').Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const { validarId, validarRevisao } = require('../middleware/validacaoRequisicao');

router.use(authMiddleware.verificarAdmin);

router.get('/revisao', adminController.exibirRevisao);
router.post('/revisao/:id/aprovar', validarId, validarRevisao, adminController.aprovarProduto);
router.post('/revisao/:id/rejeitar', validarId, adminController.rejeitarProduto);

module.exports = router;
