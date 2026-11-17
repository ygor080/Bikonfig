const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const quadro = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const pneu = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const pendente = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const senha = 'TesteIntegrado123!';

test('fluxos integrados com HTTP, modelos, EJS, bcrypt, PDF e PostgreSQL temporário', async t => {
    const db = new PGlite();
    const stores = [], servers = [];
    t.after(async () => {
        await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
        await Promise.all(stores.map(store => store.close()));
        await db.close();
    });
    // gen_random_uuid já pertence ao PostgreSQL atual; a extensão não é necessária no WASM.
    const schema = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8')
        .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    await db.exec(schema);
    const query = async (sql, params) => {
        if (!params || !params.length) {
            const resultados = await db.exec(sql);
            const resultado = resultados.at(-1);
            return { ...resultado, rowCount: resultado.affectedRows ?? resultado.rows.length };
        }
        const resultado = await db.query(sql, params);
        return { ...resultado, rowCount: resultado.affectedRows ?? resultado.rows.length };
    };
    const pool = { query, connect: async () => ({ query, release() {} }) };
    const bancoPath = require.resolve('../config/banco');
    const anterior = require.cache[bancoPath];
    // Única substituição: conexão do banco. Não carrega .env nem conecta a serviços externos.
    require.cache[bancoPath] = { id: bancoPath, filename: bancoPath, loaded: true, exports: { pool } };
    t.after(() => { if (anterior) require.cache[bancoPath] = anterior; else delete require.cache[bancoPath]; });
    const { criarApp } = require('../app');
    const env = { SECRET: 'segredo-exclusivo-de-testes-integrados-0123456789', NODE_ENV: 'test' };
    async function iniciar() {
        const store = new PgSession({ pool, tableName: 'sessoes_site', createTableIfMissing: true, pruneSessionInterval: false });
        stores.push(store);
        const server = criarApp({ env, pool, store }).listen(0, '127.0.0.1');
        servers.push(server);
        await new Promise(resolve => server.on('listening', resolve));
        return `http://127.0.0.1:${server.address().port}`;
    }
    let base = await iniciar();
    function cliente() {
        let cookie = '';
        return {
            get cookie() { return cookie; },
            async pedir(url, body, method) {
                const resposta = await fetch(base + url, { redirect: 'manual', method: method || (body ? 'POST' : 'GET'),
                    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
                    body: body ? JSON.stringify(body) : undefined });
                const novo = resposta.headers.get('set-cookie');
                if (novo) cookie = novo.split(';')[0];
                return resposta;
            }
        };
    }
    const dono = cliente(), outro = cliente(), admin = cliente();
    const cadastro = nome => ({ nome, email: nome + '@teste.invalid', senha, confirmarSenha: senha });
    await db.query("INSERT INTO sources (domain, name) VALUES ('loja.test', 'Loja de teste')");
    for (const [id, slug, preco, revisar] of [[quadro, 'quadro', 500, false], [pneu, 'pneus', 100, false], [pendente, 'guidao', 80, true]]) {
        await db.query(`INSERT INTO products (id, source_id, category_id, name, product_url, current_price, needs_review, in_stock, specs)
            VALUES ($1, (SELECT id FROM sources LIMIT 1), (SELECT id FROM categories WHERE slug = $2), $2, $3, $4, $5, true, '{"aro":"29"}')`,
        [id, slug, 'https://loja.test/' + slug, preco, revisar]);
    }
    let montagem;

    await t.test('diagnóstico lê estrutura e identifica migração faltante; healthz não cria sessão', async () => {
        const { verificarBanco } = require('../config/verificacaoProducao');
        assert.deepEqual((await verificarBanco(pool)).pendencias, []);
        await db.exec('BEGIN; ALTER TABLE products DROP COLUMN price_checked_at;');
        try { assert.ok((await verificarBanco(pool)).pendencias.some(p => p.includes('products.price_checked_at'))); }
        finally { await db.exec('ROLLBACK'); }
        const saude = await dono.pedir('/healthz');
        assert.equal(saude.status, 200); assert.equal(saude.headers.get('set-cookie'), null);
        assert.deepEqual(await saude.json(), { status: 'ok' });
    });

    await t.test('anônimo não acessa catálogo; assets e política de conteúdo são servidos fora da pasta site', async () => {
        const resposta = await dono.pedir('/catalogo');
        assert.equal(resposta.status, 302); assert.equal(resposta.headers.get('location'), '/login');
        const css = await dono.pedir('/css/estilo.css'); assert.equal(css.status, 200);
        assert.match(css.headers.get('content-type'), /text\/css/);
        const login = await dono.pedir('/login'); assert.match(await login.text(), /<form/);
        assert.match(login.headers.get('content-security-policy'), /script-src 'self'/);
    });
    await t.test('cadastro valida dados, grava hash e cria sessão PostgreSQL sem senha', async () => {
        const invalido = await dono.pedir('/cadastro', { ...cadastro('dono'), senha: 'fraca' });
        assert.equal(invalido.status, 200); assert.match(await invalido.text(), /A senha precisa/);
        assert.equal((await dono.pedir('/cadastro', cadastro('dono'))).status, 302);
        const { rows: [usuario] } = await db.query("SELECT * FROM usuarios WHERE nome = 'dono'");
        assert.notEqual(usuario.senha, senha); assert.equal(await bcrypt.compare(senha, usuario.senha), true);
        const { rows } = await db.query('SELECT sess FROM sessoes_site');
        assert.ok(rows.some(row => row.sess.user?.id === usuario.id));
        assert.ok(!JSON.stringify(rows).includes(senha));
        assert.ok(!JSON.stringify(rows).includes(usuario.senha));
        assert.equal((await dono.pedir('/home')).status, 200);
        const duplicado = await outro.pedir('/cadastro', cadastro('dono'));
        assert.match(await duplicado.text(), /já está em uso/);
    });
    await t.test('logout invalida cookie antigo e login exige senha correta e renova sessão', async () => {
        const antigo = dono.cookie;
        assert.equal((await dono.pedir('/logout')).status, 302);
        const expirado = await fetch(base + '/home', { redirect: 'manual', headers: { cookie: antigo } });
        assert.equal(expirado.status, 302);
        assert.match(await (await dono.pedir('/login', { usuario: 'dono', senha: 'incorreta' })).text(), /Usuário ou senha inválidos/);
        assert.equal((await dono.pedir('/login', { usuario: 'dono', senha })).status, 302);
        assert.notEqual(dono.cookie, antigo);
        assert.equal((await dono.pedir('/catalogo')).status, 200);
        assert.match(await (await dono.pedir('/catalogo/configurador')).text(), /rascunho-configuracao.js/);
    });
    await t.test('seleção consulta catálogo e calcula duas aplicações sem aceitar preço do cliente', async () => {
        const lista = await (await dono.pedir('/catalogo/api/pecas/pneus')).json();
        assert.equal(lista[0].id, pneu);
        const itens = [{ id: pneu, posicao: 'dianteira' }, { id: pneu, posicao: 'traseira' }];
        const orcamento = await (await dono.pedir('/catalogo/api/orcamento', { itens })).json();
        assert.equal(orcamento.total, 200); assert.equal(orcamento.pecas.length, 2);
        assert.equal((await dono.pedir('/catalogo/api/orcamento', { itens: [{ id: pneu, preco: 1 }] })).status, 400);
        const vazia = await (await dono.pedir('/catalogo/api/orcamento', { itens: [] })).json(); assert.equal(vazia.total, 0);
    });
    await t.test('salva, lista, reabre e edita a mesma montagem sem duplicar o registro', async () => {
        const salva = await dono.pedir('/catalogo/api/configuracoes', { nome: 'Minha bike', itens: [{ id: quadro }] });
        assert.equal(salva.status, 200); montagem = (await salva.json()).id;
        assert.match(await (await dono.pedir('/catalogo/minhas-configuracoes')).text(), /Minha bike/);
        const edicao = { nome: 'Bike editada', tipoMontagem: 'single-speed', itens: [{ id: pneu, posicao: 'dianteira' }, { id: pneu, posicao: 'traseira' }] };
        const atualizada = await dono.pedir('/catalogo/api/configuracoes/' + montagem, edicao);
        assert.equal(atualizada.status, 200); assert.equal((await atualizada.json()).id, montagem);
        const aberta = await (await dono.pedir('/catalogo/api/configuracoes/' + montagem)).json();
        assert.equal(aberta.nome, edicao.nome); assert.equal(aberta.tipoMontagem, 'single-speed');
        assert.deepEqual(aberta.itens.map(p => ({ id: p.id, posicao: p.posicao })), edicao.itens);
        assert.equal(Number((await db.query('SELECT COUNT(*) FROM configuracoes')).rows[0].count), 1);
    });
    await t.test('outro usuário não lê, altera ou exclui a montagem e não acessa revisão', async () => {
        assert.equal((await outro.pedir('/cadastro', cadastro('outro'))).status, 302);
        assert.equal((await outro.pedir('/catalogo/api/configuracoes/' + montagem)).status, 404);
        assert.equal((await outro.pedir('/catalogo/api/configuracoes/' + montagem, { nome: 'Ataque', itens: [{ id: quadro }] })).status, 404);
        await outro.pedir('/catalogo/api/configuracoes/' + montagem + '/excluir', {});
        assert.equal((await dono.pedir('/catalogo/api/configuracoes/' + montagem)).status, 200);
        assert.equal((await outro.pedir('/admin/revisao')).status, 403);
    });
    await t.test('PDF real é exportado e peças sem estoque bloqueiam salvar e exportar', async () => {
        const pdf = await dono.pedir('/catalogo/api/pdf', { itens: [{ id: pneu, posicao: 'dianteira' }] });
        assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-type'), /application\/pdf/);
        const bytes = Buffer.from(await pdf.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
        assert.ok(bytes.length > 1000); assert.match(bytes.subarray(-30).toString(), /%%EOF/);
        await db.query('UPDATE products SET in_stock = false WHERE id = $1', [pneu]);
        assert.equal((await dono.pedir('/catalogo/api/pdf', { itens: [{ id: pneu }] })).status, 409);
        assert.equal((await dono.pedir('/catalogo/api/configuracoes/' + montagem, { nome: 'Sem estoque', itens: [{ id: pneu }] })).status, 409);
        const aberta = await (await dono.pedir('/catalogo/api/configuracoes/' + montagem)).json();
        assert.equal(aberta.indisponiveis.length, 2); assert.equal(aberta.nome, 'Bike editada');
        await db.query('UPDATE products SET in_stock = true WHERE id = $1', [pneu]);
    });
    await t.test('administrador revisa produto e grava autoria e especificações no banco', async () => {
        await db.query('INSERT INTO usuarios (nome, email, senha, is_admin) VALUES ($1, $2, $3, true)', ['admin', 'admin@teste.invalid', await bcrypt.hash(senha, 10)]);
        assert.equal((await admin.pedir('/login', { usuario: 'admin', senha })).status, 302);
        assert.equal((await admin.pedir('/admin/revisao')).status, 200);
        assert.equal((await admin.pedir('/admin/revisao/' + pendente + '/aprovar', { categoria: 'guidao', fabricante: 'Fabricante', specsTexto: 'aro: 29' })).status, 302);
        const { rows: [produto] } = await db.query('SELECT * FROM products WHERE id = $1', [pendente]);
        assert.equal(produto.needs_review, false); assert.equal(produto.manufacturer, 'Fabricante');
        assert.equal(produto.specs.aro, 29); assert.ok(produto.manual_reviewed_by);
    });
    await t.test('erro de FK desfaz edição no PostgreSQL e preserva nome e itens anteriores', async () => {
        const Model = require('../models/configuracaoModel');
        const antes = await Model.listarItens(montagem);
        const { rows: [usuario] } = await db.query("SELECT id FROM usuarios WHERE nome = 'dono'");
        await assert.rejects(Model.atualizar(montagem, usuario.id, 'Não persistir', [{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }]));
        assert.deepEqual(await Model.listarItens(montagem), antes);
        assert.equal((await Model.buscarPorId(montagem, usuario.id)).nome, 'Bike editada');
    });
    await t.test('sessão persiste em nova instância do app e dono exclui montagem com seus itens', async () => {
        base = await iniciar();
        assert.equal((await dono.pedir('/home')).status, 200);
        await dono.pedir('/catalogo/api/configuracoes/' + montagem + '/excluir', {});
        assert.equal((await dono.pedir('/catalogo/api/configuracoes/' + montagem)).status, 404);
        assert.equal(Number((await db.query('SELECT COUNT(*) FROM configuracao_itens')).rows[0].count), 0);
    });
});
