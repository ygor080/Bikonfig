const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function carregar(arquivo, substituicoes) {
    const caminho = require.resolve(arquivo);
    const real = createRequire(caminho);
    const contexto = { module: { exports: {} }, console: { error() {} }, require: nome => substituicoes[nome] || real(nome) };
    vm.runInNewContext(fs.readFileSync(caminho, 'utf8'), contexto);
    return contexto.module.exports;
}

test('edição substitui itens em transação com proprietário, preservando ID e duas posições', async () => {
    const consultas = [];
    let liberou = false;
    const client = { query: async (sql, params) => {
        consultas.push({ sql, params });
        return { rows: sql.startsWith('UPDATE') ? [{ id, nome: 'Nova' }] : [] };
    }, release: () => { liberou = true; } };
    const Model = carregar('../models/configuracaoModel', { '../config/banco': { pool: { connect: async () => client } } });
    const resultado = await Model.atualizar(id, 'dono', 'Nova', [{ id: 'p', posicao: 'dianteira' }, { id: 'p', posicao: 'traseira' }], 'single-speed');
    assert.equal(resultado.id, id);
    assert.match(consultas[1].sql, /WHERE id = \$1 AND usuario_id = \$2 RETURNING/);
    assert.deepEqual(Array.from(consultas[1].params), [id, 'dono', 'Nova', 'single-speed']);
    assert.match(consultas[2].sql, /^DELETE FROM configuracao_itens/);
    assert.deepEqual(Array.from(consultas[3].params), [id, 'p', 'dianteira']);
    assert.deepEqual(Array.from(consultas[4].params), [id, 'p', 'traseira']);
    assert.equal(consultas.at(-1).sql, 'COMMIT'); assert.equal(liberou, true);
});

test('montagem ausente ou de outro usuário não tem itens alterados; falha desfaz a transação', async () => {
    for (const cenario of ['sem-permissao', 'falha-item']) {
        const sqls = []; let liberou = false;
        const client = { query: async sql => {
            sqls.push(sql);
            if (cenario === 'falha-item' && sql.startsWith('INSERT')) throw new Error('falha');
            return { rows: sql.startsWith('UPDATE') && cenario !== 'sem-permissao' ? [{ id }] : [] };
        }, release: () => { liberou = true; } };
        const Model = carregar('../models/configuracaoModel', { '../config/banco': { pool: { connect: async () => client } } });
        if (cenario === 'sem-permissao') {
            assert.equal(await Model.atualizar(id, 'outro', 'Nome', [{ id: 'p' }]), null);
            assert.ok(!sqls.some(sql => /^(DELETE|INSERT)/.test(sql)));
        } else await assert.rejects(Model.atualizar(id, 'dono', 'Nome', [{ id: 'p' }]), /falha/);
        assert.equal(sqls.at(-1), 'ROLLBACK'); assert.ok(!sqls.includes('COMMIT')); assert.equal(liberou, true);
    }
});

test('controller usa usuário da sessão e recusa atualização ausente, indisponível ou com falha', async () => {
    for (const cenario of ['ok', 'ausente', 'indisponivel', 'falha']) {
        let chamada;
        const Controller = carregar('../controllers/catalogoController', {
            '../models/produtoModel': { buscarVariosPorId: async () => cenario === 'indisponivel' ? [] : [{ id }] },
            '../models/configuracaoModel': { atualizar: async (...args) => {
                chamada = args; if (cenario === 'falha') throw new Error('falha');
                return cenario === 'ausente' ? null : { id, nome: 'Editada' };
            } }
        });
        let status = 200, dados;
        await Controller.salvarConfiguracao({ params: { id }, session: { user: { id: 'dono' } },
            body: { nome: 'Editada', itens: [{ id, posicao: 'traseira' }], tipoMontagem: 'single-speed' } },
        { status(valor) { status = valor; return this; }, json(valor) { dados = valor; } });
        assert.equal(status, { ok: 200, ausente: 404, indisponivel: 409, falha: 500 }[cenario]);
        if (cenario === 'indisponivel') assert.equal(chamada, undefined);
        else { assert.equal(chamada[0], id); assert.equal(chamada[1], 'dono'); assert.equal(chamada[4], 'single-speed'); }
        if (cenario === 'ok') assert.equal(dados.id, id);
    }
});

async function abrir(t, { nova = false, ausentes = false, falhaAbrir = false, falhaSalvar = false } = {}) {
    const produto = { id, nome: 'Quadro', preco: 100, subcategoria: 'quadro' };
    const html = ejs.render(fs.readFileSync(require.resolve('../views/configurador.ejs'), 'utf8'), {
        usuario: { nome: 'Teste' }, categorias: [{ slug: 'quadro', nome: 'Quadro', subcategorias: [{ slug: 'quadro', nome: 'Quadro' }] }]
    });
    const dom = new JSDOM(html, { url: 'https://bikonfig.test/catalogo/configurador' + (nova ? '?produto=' + id + '&subcategoria=quadro' : '?config=' + id), runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    const w = dom.window; const envios = [], avisos = [], prompts = [], confirmacoes = [];
    let confirmar = false;
    w.console.error = () => {};
    w.Bikonfig = { toast: mensagem => avisos.push(mensagem), promptDialog: async opcoes => { prompts.push(opcoes); return 'Editada'; },
        confirmDialog: async opcoes => { confirmacoes.push(opcoes); return confirmar; } };
    w.fetch = async (url, opcoes) => {
        if (url.includes('/api/configuracoes') && opcoes?.method === 'POST') {
            envios.push({ url, body: JSON.parse(opcoes.body) });
            return { ok: !falhaSalvar, json: async () => falhaSalvar ? { erro: 'Configuração não encontrada.' } : { id, nome: 'Editada' } };
        }
        if (url.includes('/api/configuracoes/')) return { ok: !falhaAbrir, json: async () => ({ id, nome: 'Original', tipoMontagem: 'single-speed', itens: [produto], indisponiveis: ausentes ? [{ nome: 'Antiga' }] : [] }) };
        if (url.includes('/api/pecas/')) return { ok: true, json: async () => [produto] };
        return { ok: true, json: async () => ({ total: 100, avisos: [] }) };
    };
    w.eval(fs.readFileSync(require.resolve('../public/js/conteudo-seguro'), 'utf8'));
    w.eval(fs.readFileSync(require.resolve('../public/js/configurador'), 'utf8'));
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const esperar = () => new Promise(resolve => setImmediate(resolve)); await esperar();
    return { w, envios, avisos, prompts, confirmacoes, confirmar: () => { confirmar = true; },
        salvar: async () => { w.document.getElementById('btnSalvarConfig').click(); await esperar(); } };
}

test('DOM edita nome e tipo no mesmo ID e uma nova montagem passa a atualizar após salvar', async t => {
    for (const nova of [false, true]) {
        const r = await abrir(t, { nova });
        await r.salvar(); await r.salvar();
        assert.equal(r.envios.length, 2);
        assert.equal(r.envios[0].url, '/catalogo/api/configuracoes' + (nova ? '' : '/' + id));
        assert.equal(r.envios[1].url, '/catalogo/api/configuracoes/' + id);
        assert.equal(r.prompts[0].valorInicial, nova ? '' : 'Original');
        assert.equal(r.prompts[1].valorInicial, 'Editada');
        assert.equal(r.envios[0].body.tipoMontagem, nova ? 'com-marchas' : 'single-speed');
        assert.equal(r.w.document.getElementById('btnSalvarConfig').textContent, 'Salvar alterações');
        assert.equal(r.w.document.getElementById('configEdicao').textContent, 'Editando: Editada');
        assert.equal(r.w.location.search, '?config=' + id);
    }
});

test('DOM exige confirmação para remover indisponíveis e mantém edição após falha ao salvar', async t => {
    const r = await abrir(t, { ausentes: true });
    await r.salvar(); assert.equal(r.envios.length, 0); assert.equal(r.confirmacoes.length, 1);
    r.confirmar(); await r.salvar(); assert.equal(r.envios.length, 1);
    await r.salvar(); assert.equal(r.confirmacoes.length, 2);
    const falha = await abrir(t, { falhaSalvar: true });
    await falha.salvar();
    assert.ok(falha.avisos.includes('Configuração não encontrada.'));
    assert.equal(falha.w.document.getElementById('configEdicao').textContent, 'Editando: Original');
    assert.equal(falha.w.document.getElementById('btnSalvarConfig').disabled, false);
});

test('DOM bloqueia salvar quando a montagem solicitada não pode ser aberta', async t => {
    const r = await abrir(t, { falhaAbrir: true }); await r.salvar();
    assert.equal(r.envios.length, 0);
    assert.equal(r.w.document.getElementById('btnSalvarConfig').disabled, true);
});
