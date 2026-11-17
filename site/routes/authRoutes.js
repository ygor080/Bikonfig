const router = require('express').Router();
const authController = require('../controllers/authController');
const { criarLimiteAutenticacao } = require('../middleware/limiteAutenticacao');
const limiteAutenticacao = criarLimiteAutenticacao();

router.get('/login', authController.exibirLogin);
router.post('/login', limiteAutenticacao, authController.processarLogin);

router.get('/cadastro', authController.exibirCadastro);
router.post('/cadastro', limiteAutenticacao, authController.processarCadastro);

router.get('/logout', authController.logout);

module.exports = router;
