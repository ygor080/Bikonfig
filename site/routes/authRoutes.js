const router = require('express').Router();
const authController = require('../controllers/authController');

router.get('/login', authController.exibirLogin);
router.post('/login', authController.processarLogin);

router.get('/cadastro', authController.exibirCadastro);
router.post('/cadastro', authController.processarCadastro);

router.get('/logout', authController.logout);

module.exports = router;
