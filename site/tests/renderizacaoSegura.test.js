const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const seguro = require('../public/js/conteudo-seguro');

const ataque = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
const views = path.join(__dirname, '../views');
const scripts = path.join(__dirname, '../public/js');
const render = (nome, dados) => ejs.render(fs.readFileSync(path.join(views, nome + '.ejs'), 'utf8'), dados);

function verificarDOM(document) {
    assert.equal(document.querySelectorAll('script:not([src])').length, 0);
    const scriptsPermitidos = ['/js/conteudo-seguro.js', '/js/rascunho-configuracao.js', '/js/app.js', '/js/configurador.js', '/js/auth.js'];
    document.querySelectorAll('script[src]').forEach(script => assert.ok(scriptsPermitidos.includes(script.getAttribute('src'))));
    for (const element of document.querySelectorAll('*')) {
        for (const attr of element.attributes) {
            assert.ok(!/^on/i.test(attr.name), 'Não criar manipulador de evento vindo dos dados');
        }
    }
}

test('URLs rejeitam esquemas ativos, controles, credenciais e URLs relativas de origem desconhecida', () => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)',
        'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//evil.test/x',
        '/produto', 'https://usuario:senha@loja.test/p', 'https:\\evil.test/x', '']) {
        assert.equal(seguro.urlExternaSegura(url), null);
        assert.equal(seguro.urlImagemSegura(url, '/img/pecas/pneu.svg'), '/img/pecas/pneu.svg');
    }
    assert.equal(seguro.urlExternaSegura('https://loja.test/p?variant=123&size=M'), 'https://loja.test/p?variant=123&size=M');
    assert.equal(seguro.urlImagemSegura('/img/pecas/pneu.svg'), '/img/pecas/pneu.svg');
    assert.equal(seguro.urlImagemSegura(null, 'javascript:alert(1)'), '/img/pecas/quadro.svg');
});

test('modelo sanitiza URLs antes dos templates, APIs do site e links do PDF, sem alterar nomes', async () => {
    const arquivo = path.join(__dirname, '../models/produtoModel.js');
    const requireModelo = createRequire(arquivo);
    const rows = [{ id: 'p', nome: ataque, imagem: 'data:image/svg+xml,<svg onload=alert(1)>',
        link: 'javascript:alert(1)', product_url: 'javascript:alert(1)', subcategoria: '__proto__',
        categoria_atual: '__proto__', preco: 10 }];
    const contexto = { module: { exports: {} }, require: nome => nome === '../config/banco'
        ? { pool: { query: async () => ({ rows }) } } : requireModelo(nome) };
    vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), contexto);
    const [produto] = await contexto.module.exports.listarTodos('');
    const [admin] = await contexto.module.exports.listarParaRevisao();
    assert.equal(produto.nome, ataque);
    assert.equal(produto.imagem, '/img/pecas/quadro.svg');
    assert.equal(produto.link, null);
    assert.equal(admin.product_url, null);
    assert.equal(admin.imagem, '/img/pecas/quadro.svg');
});

test('templates EJS tratam nomes, buscas, categorias e configurações salvas como texto', () => {
    const usuario = { nome: ataque, isAdmin: true };
    const casos = [
        ['catalogo', { usuario, vazio: false, semResultadoDaBusca: false, busca: ataque, produtos: [{
            id: 'p', nome: ataque, fabricante: ataque, loja: ataque, sku: ataque, variante: ataque,
            variante_id: '1', preco: 100, imagem: '/img/pecas/quadro.svg', imagemFallback: '/img/pecas/quadro.svg', subcategoria: 'quadro'
        }] }],
        ['minhas-configuracoes', { usuario, configuracoes: [{ id: 'c', nome: ataque, totalPecas: 1,
            totalPreco: 100, totalIndisponiveis: 0, criadoEm: '2026-11-16' }] }],
        ['admin-revisao', { usuario, mensagem: ataque, produtos: [{ id: 'p', nome: ataque,
            imagem: '/img/pecas/quadro.svg', imagemFallback: '/img/pecas/quadro.svg', product_url: null,
            loja: ataque, fabricante: ataque, preco: 100, confianca: .9, specsTexto: ataque }],
            categorias: [{ slug: 'quadro', name: ataque, grupo_pai: null }] }]
    ];
    for (const [nome, dados] of casos) {
        const dom = new JSDOM(render(nome, dados), { runScripts: 'dangerously' });
        try {
            verificarDOM(dom.window.document);
            assert.ok(dom.window.document.body.textContent.includes(ataque));
            assert.equal(dom.window.__xss, undefined);
        } finally { dom.window.close(); }
    }
});

async function abrirConfigurador({ listaVazia = false, duasPosicoes = false, salva = false } = {}) {
    const subcategoria = duasPosicoes ? 'pneus' : 'quadro';
    const produto = { id: 'id" onmouseover="window.__xss=1', nome: ataque, preco: 100, subcategoria,
        fabricante: ataque, loja: ataque, variante_id: 'v', variante: ataque, sku: ataque,
        imagem: 'javascript:window.__xss=1', imagemFallback: 'data:image/svg+xml,<svg onload=alert(1)>' };
    const html = render('configurador', { usuario: { nome: ataque, isAdmin: false }, categorias: [{
        slug: subcategoria, nome: ataque, subcategorias: [{ slug: subcategoria, nome: ataque }]
    }] });
    const query = salva ? '?config=c' : '?produto=' + encodeURIComponent(produto.id) + '&subcategoria=' + subcategoria;
    const dom = new JSDOM(html, { url: 'https://bikonfig.test/catalogo/configurador' + query,
        runScripts: 'dangerously', pretendToBeVisual: true });
    const w = dom.window;
    w.console.error = () => {}; // A lista vazia é um cenário esperado deste teste.
    w.Bikonfig = { toast() {}, promptDialog: async () => 'Nome' };
    w.fetch = async url => ({ ok: true, json: async () => {
        if (url.includes('/api/pecas/')) return listaVazia ? [] : [produto];
        if (url.includes('/api/configuracoes/')) return { itens: [produto], indisponiveis: [{ nome: ataque, posicao: 'traseira' }] };
        return { total: 100, pecas: [produto], avisos: [ataque], compatibilidade: { status: 'dados_insuficientes',
            faltantes: [{ campo: ataque, pecas: [{ nome: ataque }], ausentes: [{ nome: ataque }] }] },
            completude: { selecionados: 1, total: 2, status: 'incompleta', faltantes: [{ nome: ataque }], confirmar: [], observacao: ataque } };
    } });
    w.eval(fs.readFileSync(path.join(scripts, 'conteudo-seguro.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(scripts, 'configurador.js'), 'utf8'));
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    await new Promise(resolve => setImmediate(resolve));
    if (listaVazia) {
        w.document.querySelector('.config-subitem-btn').click();
        await new Promise(resolve => setImmediate(resolve));
    }
    return dom;
}

test('DOM real do configurador não executa HTML em produtos, atributos, avisos e resumo', async () => {
    const dom = await abrirConfigurador();
    try {
        const w = dom.window;
        verificarDOM(w.document);
        assert.equal(w.document.querySelector('.produto-card h3').textContent, ataque);
        assert.ok(w.document.getElementById('orcamentoLista').textContent.includes(ataque));
        assert.ok(w.document.getElementById('configAvisos').textContent.includes(ataque));
        assert.equal(w.document.querySelector('.produto-card img').getAttribute('src'), '/img/pecas/quadro.svg');
        assert.equal(w.__xss, undefined);
    } finally { dom.window.close(); }
});

test('categorias vazias, cabeçalhos com duas posições e montagens reabertas mantêm dados como texto', async () => {
    for (const opcoes of [{ listaVazia: true }, { duasPosicoes: true }, { salva: true }]) {
        const dom = await abrirConfigurador(opcoes);
        try {
            verificarDOM(dom.window.document);
            assert.equal(dom.window.__xss, undefined);
            if (opcoes.listaVazia) assert.ok(dom.window.document.getElementById('configListaPecas').textContent.includes(ataque));
            if (opcoes.duasPosicoes) assert.equal(dom.window.document.querySelector('.config-lista-titulo').textContent, ataque);
            if (opcoes.salva) assert.ok(dom.window.document.getElementById('configIndisponiveis').textContent.includes(ataque));
        } finally { dom.window.close(); }
    }
});

test('mensagens de toast e diálogos não interpretam títulos, mensagens e nomes como HTML', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', pretendToBeVisual: true });
    const w = dom.window;
    try {
        w.eval(fs.readFileSync(path.join(scripts, 'app.js'), 'utf8'));
        w.Bikonfig.toast(ataque);
        const confirmar = w.Bikonfig.confirmDialog({ titulo: ataque, mensagem: ataque });
        verificarDOM(w.document);
        w.document.querySelector('[data-acao="confirmar"]').click();
        assert.equal(await confirmar, true);
        const nome = w.Bikonfig.promptDialog({ titulo: ataque, valorInicial: ataque, rotulo: ataque });
        verificarDOM(w.document);
        w.document.querySelectorAll('[data-acao="confirmar"]')[1].click();
        assert.equal(await nome, ataque);
        assert.equal(w.__xss, undefined);
    } finally { dom.window.close(); }
});

test('política de conteúdo bloqueia scripts inline e preserva recursos utilizados pela aplicação', () => {
    const headers = {};
    let continuou = false;
    require('../middleware/segurancaConteudo')({}, { setHeader: (nome, valor) => { headers[nome] = valor; } }, () => { continuou = true; });
    assert.match(headers['Content-Security-Policy'], /script-src 'self'/);
    assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
    assert.match(headers['Content-Security-Policy'], /https:\/\/fonts.googleapis.com/);
    assert.ok(!headers['Content-Security-Policy'].includes('unsafe-inline'));
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(continuou, true);
});
