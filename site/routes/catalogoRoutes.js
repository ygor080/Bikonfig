const router = require('express').Router();
const catalogoController = require('../controllers/catalogoController');
const authMiddleware = require('../middleware/auth');
const { validarId, validarSubcategoria, validarBusca, validarSelecao } = require('../middleware/validacaoRequisicao');

router.use(authMiddleware.verificarLogin);

router.get('/', validarBusca, catalogoController.exibirCatalogo);

router.get('/configurador', catalogoController.exibirConfigurador);
router.get('/api/pecas/:subcategoria', validarSubcategoria, catalogoController.listarPecasPorSubcategoria);
router.post('/api/orcamento', validarSelecao('orcamento'), catalogoController.calcularOrcamento);
router.post('/api/pdf', validarSelecao('pdf'), catalogoController.gerarPdf);

router.get('/minhas-configuracoes', catalogoController.exibirMinhasConfiguracoes);
router.post('/api/configuracoes', validarSelecao('salvar'), catalogoController.salvarConfiguracao);
router.post('/api/configuracoes/:id', validarId, validarSelecao('salvar'), catalogoController.salvarConfiguracao);
router.get('/api/configuracoes/:id', validarId, catalogoController.carregarConfiguracao);
router.post('/api/configuracoes/:id/excluir', validarId, catalogoController.excluirConfiguracao);

module.exports = router;
