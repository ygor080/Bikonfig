const router = require('express').Router();
const catalogoController = require('../controllers/catalogoController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.verificarLogin);

router.get('/', catalogoController.exibirCatalogo);

router.get('/configurador', catalogoController.exibirConfigurador);
router.get('/api/pecas/:subcategoria', catalogoController.listarPecasPorSubcategoria);
router.post('/api/orcamento', catalogoController.calcularOrcamento);
router.post('/api/pdf', catalogoController.gerarPdf);

router.get('/minhas-configuracoes', catalogoController.exibirMinhasConfiguracoes);
router.post('/api/configuracoes', catalogoController.salvarConfiguracao);
router.get('/api/configuracoes/:id', catalogoController.carregarConfiguracao);
router.post('/api/configuracoes/:id/excluir', catalogoController.excluirConfiguracao);

module.exports = router;
