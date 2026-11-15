const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.join(__dirname, '../public/js/configurador.js'), 'utf8');

async function abrir({ subcategoria = 'quadro', encontrado = true, ok = true, query, montagem, indisponiveis = [], compatibilidade } = {}) {
    function elemento() {
        const classes = new Set();
        return {
            innerHTML: '', textContent: '', dataset: {}, listeners: {}, children: [],
            classList: {
                add: c => classes.add(c), remove: c => classes.delete(c),
                toggle: (c, ativo) => ativo ? classes.add(c) : classes.delete(c),
                contains: c => classes.has(c)
            },
            addEventListener(nome, fn) { this.listeners[nome] = fn; },
            querySelectorAll: () => [], querySelector: () => null,
            appendChild(filho) { this.children.push(filho); }
        };
    }
    const grupo = elemento();
    const botao = elemento();
    botao.dataset = { subcategoria, nome: 'Categoria' };
    botao.closest = () => grupo;
    const elementos = Object.fromEntries([
        'configMenu', 'configListaPecas', 'orcamentoLista', 'orcamentoTotal', 'configAvisos', 'configIndisponiveis', 'configCompatibilidade',
        'btnLimparConfig', 'btnSalvarConfig', 'btnBaixarPdf'
    ].map(id => [id, elemento()]));
    elementos.configMenu.querySelectorAll = selector => selector === '.config-subitem-btn' ? [botao] : [];
    elementos.configMenu.querySelector = () => grupo;
    const chamadas = [], avisos = [];
    const produto = { id: 'produto-1', nome: 'Produto escolhido', preco: 123, subcategoria, marca: 'Loja' };
    let iniciar;
    vm.runInNewContext(codigo, {
        document: {
            addEventListener: (_, fn) => { iniciar = fn; },
            getElementById: id => elementos[id] || null,
            querySelectorAll: () => [], createElement: elemento
        },
        window: { location: { search: query ?? `?produto=produto-1&subcategoria=${subcategoria}` } },
        URLSearchParams, console: { error() {} },
        Bikonfig: { toast: mensagem => avisos.push(mensagem), promptDialog: async () => 'Montagem' },
        fetch: async (url, opcoes) => {
            chamadas.push({ url, body: opcoes?.body && JSON.parse(opcoes.body) });
            if (url.includes('/api/pecas/')) return { ok, json: async () => encontrado ? [produto] : [] };
            if (url.includes('/api/orcamento')) return { ok: true, json: async () => ({ total: 123, avisos: [], indisponiveis, compatibilidade }) };
            if (url === '/catalogo/api/configuracoes') return { ok: true };
            return { ok: true, json: async () => montagem || ({ itens: [] }) };
        }
    });
    iniciar();
    await new Promise(resolve => setImmediate(resolve));
    await elementos.btnSalvarConfig.listeners.click();
    return { chamadas, avisos, elementos, botao, grupo };
}

test('seleciona a peça do catálogo, abre a categoria e atualiza o orçamento', async () => {
    const r = await abrir();
    assert.equal(r.botao.classList.contains('ativo'), true);
    assert.equal(r.grupo.classList.contains('aberto'), true);
    assert.match(r.elementos.configListaPecas.innerHTML, /selecionado/);
    assert.equal(r.elementos.orcamentoTotal.textContent, 'R$ 123.00');
    assert.deepEqual(r.chamadas.find(c => c.url.endsWith('/api/configuracoes')).body.itens,
        [{ id: 'produto-1', posicao: null }]);
});

test('pneu entra somente na dianteira e informa como escolher a traseira', async () => {
    const r = await abrir({ subcategoria: 'pneus' });
    assert.deepEqual(r.chamadas.find(c => c.url.endsWith('/api/configuracoes')).body.itens,
        [{ id: 'produto-1', posicao: 'dianteira' }]);
    assert.deepEqual(r.chamadas.find(c => c.url.endsWith('/api/orcamento')).body.itens,
        [{ id: 'produto-1', posicao: 'dianteira' }]);
    assert.ok(r.avisos.some(a => a.includes('posição dianteira')));
});

test('acessório mantém a seleção múltipla ao ser salvo', async () => {
    const r = await abrir({ subcategoria: 'outros' });
    assert.equal(r.chamadas.find(c => c.url.endsWith('/api/configuracoes')).body.itens.length, 1);
});

test('produto ausente ou falha HTTP apresenta aviso sem selecionar', async () => {
    for (const opcoes of [{ encontrado: false }, { ok: false }, { query: '?produto=produto-1&subcategoria=inexistente' }]) {
        const r = await abrir(opcoes);
        assert.ok(r.avisos.some(a => a.includes('Não foi possível selecionar')));
        assert.equal(r.chamadas.some(c => c.url.endsWith('/api/orcamento')), false);
    }
});

test('configuração salva tem prioridade sobre parâmetros de produto', async () => {
    const r = await abrir({ query: '?config=salva&produto=produto-1&subcategoria=quadro' });
    assert.ok(r.chamadas.some(c => c.url.endsWith('/api/configuracoes/salva')));
    assert.equal(r.chamadas.some(c => c.url.includes('/api/pecas/')), false);
});

test('abrir o configurador sem parâmetros mantém a seleção vazia', async () => {
    const r = await abrir({ query: '' });
    assert.equal(r.chamadas.length, 0);
});

test('montagem reaberta mostra aviso persistente com peças e posições indisponíveis', async () => {
    const r = await abrir({ query: '?config=salva', montagem: {
        itens: [{ id: 'produto-1', nome: 'Quadro', preco: 123, subcategoria: 'quadro' }],
        indisponiveis: [
            { id: 'antigo', nome: 'Pneu antigo', posicao: 'dianteira' },
            { id: 'antigo', nome: 'Pneu antigo', posicao: 'traseira' }
        ]
    } });
    const aviso = r.elementos.configIndisponiveis.children[0].textContent;
    assert.match(aviso, /Pneu antigo \(dianteira\)/);
    assert.match(aviso, /Pneu antigo \(traseira\)/);
    assert.match(aviso, /excluídas desta seleção, do total e do PDF/);
    assert.deepEqual(r.chamadas.find(c => c.url.endsWith('/api/configuracoes')).body.itens,
        [{ id: 'produto-1', posicao: null }]);
    r.elementos.btnLimparConfig.listeners.click();
    assert.equal(r.elementos.configIndisponiveis.textContent, '');
});

test('interface mostra especificação ausente e nome da peça, mesmo com incompatibilidade', async () => {
    const r = await abrir({ compatibilidade: {
        status: 'incompativel', verificadas: 1, pendentes: 1,
        faltantes: [{ campo: 'aro', pecas: [{ nome: 'Quadro' }, { nome: 'Pneu' }], ausentes: [{ nome: 'Pneu' }] }]
    } });
    const linhas = r.elementos.configCompatibilidade.children;
    assert.match(linhas[0].textContent, /Incompatibilidade encontrada/);
    assert.match(linhas[1].textContent, /falta a especificação "aro" em Pneu/);
    r.elementos.btnLimparConfig.listeners.click();
    assert.equal(r.elementos.configCompatibilidade.textContent, '');
});

test('interface distingue dados insuficientes, sem divergências e ausência de regras aplicáveis', async () => {
    for (const [status, mensagem] of [
        ['dados_insuficientes', /Dados insuficientes/],
        ['sem_divergencias', /Isso não garante a compatibilidade completa/],
        ['nao_verificada', /Compatibilidade não verificada/]
    ]) {
        const r = await abrir({ compatibilidade: { status, faltantes: [] } });
        assert.match(r.elementos.configCompatibilidade.children[0].textContent, mensagem);
    }
});
