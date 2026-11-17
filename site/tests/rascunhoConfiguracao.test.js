const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const rascunho = require('../public/js/rascunho-configuracao');
const usuario = '11111111-1111-1111-1111-111111111111';
const outro = '22222222-2222-2222-2222-222222222222';
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const config = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const esperar = () => new Promise(resolve => setImmediate(resolve));
function armazenamento() {
    const map = new Map();
    return { getItem: chave => map.get(chave) || null, setItem: (chave, valor) => map.set(chave, valor), removeItem: chave => map.delete(chave), map };
}

test('rascunhos separam usuário e montagem, expiram e armazenam apenas identificadores, posições e tipo', () => {
    const storage = armazenamento();
    const a = rascunho.criar(storage, usuario);
    a.salvar(null, [{ id, subcategoria: 'pneus', posicao: 'dianteira', preco: 1, nome: 'Não armazenar', imagem: 'https://loja.test' }], 'single-speed');
    assert.equal(a.ler(null).itens[0].preco, undefined);
    assert.ok(!JSON.stringify(a.ler(null)).includes('Não armazenar'));
    assert.equal(a.ler(config), null);
    assert.equal(rascunho.criar(storage, outro).ler(null), null);
    const chave = rascunho.chave(usuario, null);
    const dados = a.ler(null); dados.atualizadoEm -= 8 * 86400000;
    storage.setItem(chave, JSON.stringify(dados));
    assert.equal(a.ler(null), null); assert.equal(storage.getItem(chave), null);
    for (const texto of ['{quebrado', JSON.stringify({ versao: 2 }), JSON.stringify({ ...dados, atualizadoEm: Date.now(), itens: [{ id: {}, subcategoria: 'quadro' }] })]) {
        storage.setItem(chave, texto); assert.equal(a.ler(null), null);
    }
});

async function abrir(t, { storage = armazenamento(), user = usuario, query = '', falhaCatalogo = false, falhaSalvar = false, ausente = false, pendente = null } = {}) {
    const categorias = ['quadro', 'pneus'].map(slug => ({ slug, nome: slug, subcategorias: [{ slug, nome: slug }] }));
    const html = ejs.render(fs.readFileSync(require.resolve('../views/configurador.ejs'), 'utf8'), { usuario: { id: user, nome: 'Teste' }, categorias, csrfToken: 'a'.repeat(64) });
    const dom = new JSDOM(html, { url: 'https://bikonfig.test/catalogo/configurador' + query, runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    const w = dom.window; const chamadas = [];
    Object.defineProperty(w, 'localStorage', { value: storage });
    w.console.error = () => {};
    w.Bikonfig = { toast() {}, promptDialog: async () => 'Minha bike', confirmDialog: async () => true };
    const produto = subcategoria => ({ id, subcategoria, nome: 'Peça atual', preco: 250, imagem: '/img/pecas/quadro.svg' });
    w.fetch = async (url, opcoes) => {
        chamadas.push({ url, method: opcoes?.method, headers: opcoes?.headers, body: opcoes?.body && JSON.parse(opcoes.body) });
        if (url.includes('/api/configuracoes') && opcoes?.method === 'POST') {
            if (pendente) await pendente;
            return { ok: !falhaSalvar, json: async () => falhaSalvar ? { erro: 'Falha ao salvar.' } : { id: config, nome: 'Minha bike' } };
        }
        if (url.includes('/api/configuracoes/')) return { ok: true, json: async () => ({ id: config, nome: 'Original', tipoMontagem: 'com-marchas', itens: [produto('quadro')] }) };
        if (url.includes('/api/pecas/')) return { ok: !falhaCatalogo, json: async () => ausente ? [] : [produto(url.split('/').at(-1))] };
        return { ok: true, json: async () => ({ pecas: [produto('quadro')], total: 250, avisos: [] }) };
    };
    for (const nome of ['conteudo-seguro', 'rascunho-configuracao', 'configurador']) w.eval(fs.readFileSync(require.resolve('../public/js/' + nome), 'utf8'));
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    await esperar(); await esperar();
    return { w, storage, chamadas,
        mensagem: () => w.document.getElementById('configRascunho').textContent,
        tipo: async valor => { const el = w.document.getElementById('tipoMontagem'); el.value = valor; el.dispatchEvent(new w.Event('change')); await esperar(); },
        clicar: async id => { w.document.getElementById(id).click(); await esperar(); },
        selecionar: async () => { w.document.querySelector('[data-subcategoria="quadro"]').click(); await esperar(); w.document.querySelector('[data-selecionar]').click(); await esperar(); } };
}

test('DOM guarda cada seleção e mudança de tipo e recupera após reabrir com preço atual', async t => {
    const primeira = await abrir(t);
    await primeira.selecionar(); await primeira.tipo('single-speed');
    assert.equal(primeira.chamadas.find(c => c.method === 'POST').headers['X-CSRF-Token'], 'a'.repeat(64));
    const dados = rascunho.criar(primeira.storage, usuario).ler(null);
    assert.equal(dados.itens.length, 1); assert.equal(dados.tipoMontagem, 'single-speed');
    const segunda = await abrir(t, { storage: primeira.storage });
    assert.match(segunda.mensagem(), /Progresso recuperado/);
    assert.equal(segunda.w.document.getElementById('tipoMontagem').value, 'single-speed');
    assert.match(segunda.w.document.getElementById('orcamentoLista').textContent, /Peça atual/);
    assert.equal(segunda.w.document.getElementById('orcamentoTotal').textContent, 'R$ 250.00');
    assert.equal(segunda.chamadas.some(c => c.method === 'POST' && c.url.includes('/api/configuracoes')), false);
    const outraConta = await abrir(t, { storage: primeira.storage, user: outro });
    assert.ok(!outraConta.mensagem().includes('Progresso recuperado'));
    assert.equal(outraConta.chamadas.length, 0);
});

test('DOM recupera duas posições em edição e remove rascunho somente após salvar na conta', async t => {
    const storage = armazenamento(); const drafts = rascunho.criar(storage, usuario);
    drafts.salvar(config, [{ id, subcategoria: 'pneus', posicao: 'dianteira' }, { id, subcategoria: 'pneus', posicao: 'traseira' }], 'single-speed');
    const r = await abrir(t, { storage, query: '?config=' + config });
    const orcamento = r.chamadas.filter(c => c.url.includes('/api/orcamento')).at(-1);
    assert.deepEqual(orcamento.body.itens, [{ id, posicao: 'dianteira' }, { id, posicao: 'traseira' }]);
    assert.equal(r.w.document.getElementById('btnSalvarConfig').textContent, 'Salvar alterações');
    await r.clicar('btnSalvarConfig');
    assert.equal(drafts.ler(config), null);
    assert.equal(r.chamadas.find(c => c.method === 'POST' && c.url.includes('/api/configuracoes')).url, '/catalogo/api/configuracoes/' + config);
    assert.match(r.mensagem(), /salva na sua conta/);
});

test('DOM limpar seleção persiste vazio e salvar com falha preserva o rascunho', async t => {
    const r = await abrir(t, { falhaSalvar: true }); await r.selecionar();
    await r.clicar('btnSalvarConfig');
    assert.equal(rascunho.criar(r.storage, usuario).ler(null).itens.length, 1);
    await r.clicar('btnLimparConfig');
    assert.equal(rascunho.criar(r.storage, usuario).ler(null).itens.length, 0);
    const reaberta = await abrir(t, { storage: r.storage });
    assert.match(reaberta.w.document.getElementById('orcamentoLista').textContent, /Nenhuma peça/);
});

test('DOM preserva rascunho em falha de rede e avisa quando peças desapareceram', async t => {
    const storage = armazenamento();
    rascunho.criar(storage, usuario).salvar(null, [{ id, subcategoria: 'quadro', posicao: null }], 'single-speed');
    const antes = storage.getItem(rascunho.chave(usuario, null));
    const falha = await abrir(t, { storage, falhaCatalogo: true });
    assert.match(falha.mensagem(), /rascunho foi preservado/);
    await falha.tipo('com-marchas'); assert.equal(storage.getItem(rascunho.chave(usuario, null)), antes);
    const ausente = await abrir(t, { storage, ausente: true });
    assert.match(ausente.mensagem(), /recuperado parcialmente/);
    assert.equal(storage.getItem(rascunho.chave(usuario, null)), antes);
});

test('DOM funciona com armazenamento bloqueado e não perde mudanças feitas durante salvamento', async t => {
    const bloqueado = await abrir(t, { storage: { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } } });
    await bloqueado.selecionar(); assert.match(bloqueado.mensagem(), /Não foi possível guardar/);
    assert.match(bloqueado.w.document.getElementById('orcamentoLista').textContent, /Peça atual/);
    let resolver;
    const r = await abrir(t, { pendente: new Promise(resolve => { resolver = resolve; }) });
    await r.selecionar(); await r.clicar('btnSalvarConfig'); await r.tipo('single-speed'); resolver(); await esperar(); await esperar();
    assert.equal(rascunho.criar(r.storage, usuario).ler(config).tipoMontagem, 'single-speed');
    assert.equal(rascunho.criar(r.storage, usuario).ler(null), null);
});
