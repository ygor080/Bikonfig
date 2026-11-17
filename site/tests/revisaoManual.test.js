const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregar(arquivo, dependencias) {
    const contexto = { module: { exports: {} }, require: nome => dependencias[nome] };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, arquivo), 'utf8'), contexto);
    return contexto.module.exports;
}

test('aprovação protege os campos efetivamente revisados e registra o administrador', async () => {
    let consulta;
    const model = carregar('../models/produtoModel.js', {
        '../config/banco': { pool: { query: async (sql, valores) => { consulta = { sql, valores }; } } },
        './normalizarSpec': require('../models/normalizarSpec'),
        '../config/produtoPublicavel': require('../config/produtoPublicavel'),
        '../config/produtoDisponivel': require('../config/produtoDisponivel')
    });
    await model.aprovarProduto('produto', { categoriaSlug: 'pneus', specs: {}, fabricante: '', revisadoPor: 'admin' });
    for (const flag of ['category_manually_reviewed', 'specs_manually_reviewed', 'manufacturer_manually_reviewed']) {
        assert.ok(consulta.sql.includes(flag + ' = true'));
    }
    assert.match(consulta.sql, /manual_reviewed_at = now\(\)/);
    assert.match(consulta.sql, /manual_reviewed_by = \$4/);
    assert.equal(consulta.valores[1], '{}');
    assert.equal(consulta.valores[2], null); // Limpeza intencional de fabricante também fica protegida.
    assert.equal(consulta.valores[3], 'admin');
    await model.aprovarProduto('produto', { fabricante: 'Marca' });
    assert.match(consulta.sql, /manufacturer_manually_reviewed = true/);
    assert.doesNotMatch(consulta.sql, /category_manually_reviewed = true|specs_manually_reviewed = true/);
});

test('formulário preserva tipos JSON ao revisar specs existentes e usa o usuário da sessão', async () => {
    const original = { aro: '29', velocidades: 11, tubeless: true, componentes_inclusos: ['pedal'], observacao: 'dois: pontos' };
    let renderizado, aprovado;
    const controller = carregar('../controllers/adminController.js', {
        '../models/produtoModel': {
            listarParaRevisao: async () => [{ id: 'p', specs: original }], listarCategoriasFlat: async () => [],
            aprovarProduto: async (id, dados) => { aprovado = dados; }
        }
    });
    await controller.exibirRevisao({ session: { user: { id: 'admin' } }, query: {} }, {
        render: (_, dados) => { renderizado = dados; }
    });
    await controller.aprovarProduto({ params: { id: 'p' }, session: { user: { id: 'admin' } }, body: {
        categoria: 'pneus', fabricante: '', specsTexto: renderizado.produtos[0].specsTexto, revisadoPor: 'usuario-forjado'
    } }, { redirect() {} });
    assert.deepEqual(JSON.parse(JSON.stringify(aprovado.specs)), original);
    assert.equal(aprovado.revisadoPor, 'admin');
});

test('specs digitadas no formato anterior continuam válidas e campo vazio significa remoção intencional', async () => {
    let dados;
    const controller = carregar('../controllers/adminController.js', {
        '../models/produtoModel': { aprovarProduto: async (_, d) => { dados = d; } }
    });
    const req = { params: { id: 'p' }, session: { user: { id: 'admin' } }, body: {
        categoria: 'pneus', fabricante: '', specsTexto: 'aro: 27,5\nvelocidades: 11v\nvendido_em_par: true'
    } };
    await controller.aprovarProduto(req, { redirect() {} });
    assert.equal(dados.specs.aro, '27,5');
    assert.equal(dados.specs.velocidades, '11v');
    assert.equal(dados.specs.vendido_em_par, true);
    req.body.specsTexto = '';
    await controller.aprovarProduto(req, { redirect() {} });
    assert.equal(JSON.stringify(dados.specs), '{}');
});
