const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function imagem(src = 'https://loja.test/foto.jpg', fallback = '/img/pecas/pneu.svg') {
    const atributos = new Map([['src', src], ['srcset', 'https://loja.test/foto-grande.jpg 2x']]);
    if (fallback !== null) atributos.set('data-imagem-fallback', fallback);
    const alteracoes = [];
    return {
        tagName: 'IMG', alt: 'Pneu', complete: true, naturalWidth: 0, alteracoes,
        getAttribute: nome => atributos.get(nome) ?? null,
        hasAttribute: nome => atributos.has(nome),
        setAttribute(nome, valor) { atributos.set(nome, valor); alteracoes.push({ nome, valor }); },
        removeAttribute: nome => atributos.delete(nome)
    };
}

function preparar(imagens = []) {
    const eventos = {};
    const documento = {
        addEventListener(nome, acao, captura) { (eventos[nome] ||= []).push({ acao, captura }); },
        getElementById: () => null,
        querySelectorAll: seletor => seletor === 'img[data-imagem-fallback]' ? imagens : []
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'), {
        document: documento, window: {}
    });
    return {
        pronto: () => eventos.DOMContentLoaded.forEach(e => e.acao()),
        erro: target => eventos.error.forEach(e => e.acao({ target })),
        captura: eventos.error[0].captura
    };
}

test('erro de foto externa troca por ícone da categoria e remove srcset', () => {
    const r = preparar(), img = imagem();
    assert.equal(r.captura, true);
    r.erro(img);
    assert.equal(img.getAttribute('src'), '/img/pecas/pneu.svg');
    assert.equal(img.hasAttribute('srcset'), false);
    assert.equal(img.alt, 'Pneu');
});

test('falha ocorrida antes do script é detectada após carregar o documento', () => {
    const img = imagem();
    preparar([img]).pronto();
    assert.equal(img.getAttribute('src'), '/img/pecas/pneu.svg');
});

test('imagem válida ou ainda carregando é preservada', () => {
    const valida = imagem(), carregando = imagem();
    valida.naturalWidth = 400;
    carregando.complete = false;
    preparar([valida, carregando]).pronto();
    assert.equal(valida.alteracoes.length, 0);
    assert.equal(carregando.alteracoes.length, 0);
});

test('imagens dinâmicas inseridas após o carregamento também têm substituição', () => {
    const r = preparar();
    r.pronto();
    const img = imagem('https://loja.test/selim.jpg', '/img/pecas/selim.svg');
    r.erro(img);
    assert.equal(img.getAttribute('src'), '/img/pecas/selim.svg');
});

test('falha do ícone substituto não causa tentativas infinitas', () => {
    const img = imagem(), r = preparar([img]);
    r.erro(img);
    r.erro(img);
    r.erro(img);
    r.pronto();
    assert.equal(img.alteracoes.length, 1);
    assert.equal(img.hasAttribute('src'), false);
    assert.equal(img.alt, 'Pneu — imagem indisponível');
});

test('ícone local que já era a imagem inicial não é requisitado novamente após falha', () => {
    const img = imagem('/img/pecas/pneu.svg'), r = preparar([img]);
    r.erro(img);
    r.pronto();
    assert.equal(img.alteracoes.length, 0);
    assert.match(img.alt, /imagem indisponível/);
});

test('fallback externo não é seguido; imagens não marcadas e erros de outros elementos são ignorados', () => {
    const r = preparar(), img = imagem('https://loja.test/a.jpg', 'https://outro.test/icon.svg');
    r.erro(img);
    assert.equal(img.getAttribute('src'), '/img/pecas/quadro.svg');
    const semMarcador = imagem('https://loja.test/a.jpg', null);
    r.erro(semMarcador);
    r.erro({ tagName: 'SCRIPT' });
    r.erro(null);
    assert.equal(semMarcador.alteracoes.length, 0);
});

test('modelo fornece ícones existentes para catálogo, configurador e revisão', async () => {
    const rows = [
        { id: '1', subcategoria: 'pneus', categoria_atual: 'pneus', imagem: 'https://loja.test/pneu.jpg', preco: 10 },
        { id: '2', subcategoria: 'selim', categoria_atual: 'selim', imagem: null, preco: 10 },
        { id: '3', subcategoria: 'desconhecida', categoria_atual: 'desconhecida', imagem: null, preco: 10 }
    ];
    const contexto = { module: { exports: {} }, require: nome => {
        if (nome === '../config/banco') return { pool: { query: async () => ({ rows }) } };
        if (nome === './normalizarSpec') return require('../models/normalizarSpec');
        return require(nome === '../config/produtoPublicavel' ? '../config/produtoPublicavel' : '../config/produtoDisponivel');
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/produtoModel.js'), 'utf8'), contexto);
    const model = contexto.module.exports;
    for (const produtos of [await model.listarTodos(''), await model.listarPorSubcategoria('pneus'), await model.listarParaRevisao()]) {
        assert.equal(produtos[0].imagemFallback, '/img/pecas/pneu.svg');
        assert.equal(produtos[1].imagemFallback, '/img/pecas/selim.svg');
        assert.equal(produtos[2].imagemFallback, '/img/pecas/quadro.svg');
        produtos.forEach(p => assert.ok(fs.existsSync(path.join(__dirname, '../public', p.imagemFallback))));
    }
    const produtos = await model.listarTodos('');
    assert.equal(produtos[0].imagem, 'https://loja.test/pneu.jpg');
    assert.equal(produtos[1].imagem, '/img/pecas/selim.svg');
});
