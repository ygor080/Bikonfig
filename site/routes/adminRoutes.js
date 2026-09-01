const router = require('express').Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.verificarAdmin);

router.get('/revisao', adminController.exibirRevisao);
router.post('/revisao/:id/aprovar', adminController.aprovarProduto);
router.post('/revisao/:id/rejeitar', adminController.rejeitarProduto);

module.exports = router;
