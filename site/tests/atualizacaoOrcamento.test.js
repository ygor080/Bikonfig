const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.join(__dirname, '../public/js/configurador.js'), 'utf8');

function pendente() {
    let resolver, rejeitar;
    const promessa = new Promise((resolve, reject) => { resolver = resolve; rejeitar = reject; });
    return { promessa, resolver, rejeitar };
}

function preparar() {
    const elementos = {};
    function elemento(id) {
        return elementos[id] ||= {
            innerHTML: '', textContent: '', children: [], disabled: false, listeners: {},
            querySelectorAll: () => [], querySelector: () => null,
            addEventListener(evento, acao) { this.listeners[evento] = acao; },
            appendChild(filho) { this.children.push(filho); }
        };
    }
    const requisicoes = [];
    let iniciar;
    const contexto = {
        document: {
            addEventListener: (_, acao) => { iniciar = acao; },
            getElementById: id => id === 'configCompatibilidade' ? null : elemento(id), querySelectorAll: () => [],
            createElement: () => elemento(Symbol())
        },
        window: { location: { search: '' } }, URLSearchParams,
        console: { error() {} },
        fetch: (url, opcoes) => {
            const espera = pendente();
            requisicoes.push({ ...espera, ids: JSON.parse(opcoes.body).ids });
            return espera.promessa;
        }
    };
    // Expõe o estado da instância apenas no ambiente de teste, sem alterar o código de produção.
    const final = codigo.lastIndexOf('});');
    vm.runInNewContext(codigo.slice(0, final) +
        'this.instancia = { atualizarOrcamento, selecionadas };\n' + codigo.slice(final), contexto);
    iniciar();
    const api = contexto.instancia;
    function selecionar(id) {
        api.selecionadas.quadro = { id, nome: id, preco: 100 };
        return api.atualizarOrcamento();
    }
    const responder = (indice, total, avisos = [], pecas = []) => requisicoes[indice].resolver({
        ok: true, json: async () => ({ total, avisos, pecas })
    });
    return { elementos, requisicoes, api, selecionar, responder };
}

test('resposta antiga não sobrescreve total, avisos ou resumo da seleção mais recente', async () => {
    const r = preparar();
    const primeira = r.selecionar('antigo');
    const segunda = r.selecionar('atual');
    r.responder(1, 200, ['Aviso atual']);
    await segunda;
    r.responder(0, 100, ['Aviso antigo']);
    await primeira;
    assert.equal(r.elementos.orcamentoTotal.textContent, 'R$ 200.00');
    assert.ok(r.elementos.configAvisos.children.some(filho => /Aviso atual/.test(filho.textContent)));
    assert.ok(!r.elementos.configAvisos.children.some(filho => /Aviso antigo/.test(filho.textContent)));
    assert.match(r.elementos.orcamentoLista.innerHTML, /atual/);
});

test('resposta cujo JSON termina atrasado também é descartada', async () => {
    const r = preparar(), json = pendente();
    const primeira = r.selecionar('antigo');
    r.requisicoes[0].resolver({ ok: true, json: () => json.promessa });
    await Promise.resolve();
    const segunda = r.selecionar('atual');
    r.responder(1, 200);
    await segunda;
    json.resolver({ total: 100, avisos: [] });
    await primeira;
    assert.equal(r.elementos.orcamentoTotal.textContent, 'R$ 200.00');
});

test('limpar seleção invalida resposta pendente e mantém total zerado', async () => {
    const r = preparar();
    const primeira = r.selecionar('antigo');
    r.elementos.btnLimparConfig.listeners.click();
    r.responder(0, 100, ['Aviso antigo']);
    await primeira;
    assert.equal(r.elementos.orcamentoTotal.textContent, 'R$ 0,00');
    assert.equal(r.elementos.configAvisos.innerHTML, '');
    assert.equal(r.elementos.btnAtualizarOrcamento.disabled, false);
});

test('falha antiga não apaga orçamento novo nem libera botão durante requisição atual', async () => {
    const r = preparar();
    const primeira = r.selecionar('antigo');
    const segunda = r.selecionar('atual');
    r.requisicoes[0].rejeitar(new Error('Sem rede'));
    await primeira;
    assert.equal(r.elementos.orcamentoTotal.textContent, 'Calculando...');
    assert.equal(r.elementos.btnAtualizarOrcamento.disabled, true);
    r.responder(1, 200);
    await segunda;
    assert.equal(r.elementos.orcamentoTotal.textContent, 'R$ 200.00');
});

test('falhas de rede, HTTP, JSON e total inválido mostram erro e permitem tentar novamente', async () => {
    const falhas = [
        pedido => pedido.rejeitar(new Error('Sem rede')),
        pedido => pedido.resolver({ ok: false }),
        pedido => pedido.resolver({ ok: true, json: async () => { throw new Error('JSON inválido'); } }),
        pedido => pedido.resolver({ ok: true, json: async () => ({ total: null, avisos: [] }) })
    ];
    for (const falhar of falhas) {
        const r = preparar();
        const tentativa = r.selecionar('atual');
        falhar(r.requisicoes[0]);
        await tentativa;
        assert.equal(r.elementos.orcamentoTotal.textContent, 'Indisponível');
        assert.match(r.elementos.configAvisos.textContent, /Não foi possível atualizar/);
        assert.equal(r.elementos.btnAtualizarOrcamento.disabled, false);
        const repeticao = r.elementos.btnAtualizarOrcamento.listeners.click();
        assert.deepEqual(Array.from(r.requisicoes[1].ids), ['atual']);
        assert.equal(r.elementos.configAvisos.textContent, '');
        r.responder(1, 250);
        await repeticao;
        assert.equal(r.elementos.orcamentoTotal.textContent, 'R$ 250.00');
    }
});

test('resumo usa preço e data devolvidos pelo servidor, preservando proteção contra resposta antiga', async () => {
    const r = preparar();
    const primeira = r.selecionar('atual');
    const segunda = r.selecionar('atual');
    r.responder(1, 150, [], [{ id: 'atual', preco: 150, preco_verificado_em: '2026-11-16T09:17:00Z' }]);
    await segunda;
    r.responder(0, 100, [], [{ id: 'atual', preco: 100, preco_verificado_em: '2026-11-15T09:17:00Z' }]);
    await primeira;
    assert.match(r.elementos.orcamentoLista.innerHTML, /R\$ 150.00/);
    assert.match(r.elementos.orcamentoLista.innerHTML, /16\/11\/2026/);
    assert.equal(r.api.selecionadas.quadro.preco, 150);
    assert.equal(r.api.selecionadas.quadro.preco_verificado_em, '2026-11-16T09:17:00Z');
});
