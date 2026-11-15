const { pool } = require('../config/banco');

const CAMPOS_PRODUTO = `
    p.id,
    p.name AS nome,
    c.slug AS subcategoria,
    COALESCE(parent.slug, c.slug) AS categoria,
    COALESCE(p.current_price, 0) AS preco,
    s.name AS marca,
    p.product_url AS link,
    NULLIF(p.specs->>'aro', '') AS aro,
    p.specs AS specs,
    p.is_optional AS opcional,
    p.image_url AS imagem,
    p.is_active AS em_estoque
`;

const FROM_PRODUTO = `
    FROM products p
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
`;

const ORDEM_PRIORIDADE_CATEGORIAS = [
    'quadro',
    'rodas',
    'guidao',
    'selim',
    'cambio-traseiro',
    'cambio-dianteiro',
    'cassete',
    'corrente',
    'pedivela',
    'freios',
    'pneus',
    'fixacao-roda',
    'paralama',
    'iluminacao',
    'bagageiro',
    'descanso',
    'outros'
];

function prioridadeCategoria(slug) {
    const indice = ORDEM_PRIORIDADE_CATEGORIAS.indexOf(slug);
    return indice === -1 ? ORDEM_PRIORIDADE_CATEGORIAS.length : indice;
}

const ORDEM_PRIORIDADE_SQL = `CASE COALESCE(parent.slug, c.slug) ${
    ORDEM_PRIORIDADE_CATEGORIAS.map((slug, indice) => `WHEN '${slug}' THEN ${indice}`).join(' ')
} ELSE ${ORDEM_PRIORIDADE_CATEGORIAS.length} END`;

const ICONE_PADRAO = {
    'quadro': '/img/pecas/quadro.svg',
    'quadro-garfo': '/img/pecas/garfo.svg',
    'quadro-amortecedor': '/img/pecas/amortecedor.svg',
    'direcao': '/img/pecas/direcao.svg',
    'guidao': '/img/pecas/guidao.svg',
    'guidao-manoplas': '/img/pecas/manoplas.svg',
    'guidao-avanco': '/img/pecas/avanco.svg',
    'guidao-fita': '/img/pecas/fita-guidao.svg',
    'rodas': '/img/pecas/roda.svg',
    'rodas-dianteira': '/img/pecas/roda.svg',
    'rodas-traseira': '/img/pecas/roda.svg',
    'rodas-camara-ar': '/img/pecas/camara-ar.svg',
    'rodas-cubo': '/img/pecas/cubo.svg',
    'rodas-cubo-dianteiro': '/img/pecas/cubo.svg',
    'rodas-cubo-traseiro': '/img/pecas/cubo.svg',
    'pneus': '/img/pecas/pneu.svg',
    'cambio-dianteiro': '/img/pecas/cambio.svg',
    'cambio-dianteiro-desviador': '/img/pecas/cambio.svg',
    'cambio-dianteiro-trocador': '/img/pecas/cambio.svg',
    'cambio-dianteiro-cabo': '/img/pecas/cabo-freio.svg',
    'cambio-traseiro': '/img/pecas/cambio.svg',
    'cambio-traseiro-desviador': '/img/pecas/cambio.svg',
    'cambio-traseiro-trocador': '/img/pecas/cambio.svg',
    'cambio-traseiro-cabo': '/img/pecas/cabo-freio.svg',
    'cassete': '/img/pecas/cassete.svg',
    'corrente': '/img/pecas/corrente.svg',
    'freios': '/img/pecas/freio.svg',
    'freios-dianteiro': '/img/pecas/freio.svg',
    'freios-traseiro': '/img/pecas/freio.svg',
    'freios-disco': '/img/pecas/disco-freio.svg',
    'freios-pastilha': '/img/pecas/pastilha-freio.svg',
    'freios-cabo': '/img/pecas/cabo-freio.svg',
    'freios-manete': '/img/pecas/manete-freio.svg',
    'selim': '/img/pecas/selim.svg',
    'selim-canote': '/img/pecas/canote-selim.svg',
    'rodas-aro': '/img/pecas/aro.svg',
    'rodas-raio': '/img/pecas/raio.svg',
    'pedivela': '/img/pecas/pedivela.svg',
    'pedivela-movimento-central': '/img/pecas/movimento-central.svg',
    'pedivela-coroa': '/img/pecas/coroa.svg',
    'pedal': '/img/pecas/pedal.svg',
    'outros-pedal': '/img/pecas/pedal.svg',
    'paralama': '/img/pecas/paralama.svg',
    'paralama-dianteiro': '/img/pecas/paralama.svg',
    'paralama-traseiro': '/img/pecas/paralama.svg',
    'bagageiro': '/img/pecas/bagageiro.svg',
    'bagageiro-dianteiro': '/img/pecas/bagageiro.svg',
    'bagageiro-traseiro': '/img/pecas/bagageiro.svg',
    'descanso': '/img/pecas/descanso.svg',
    'iluminacao': '/img/pecas/farol.svg',
    'iluminacao-farol': '/img/pecas/farol.svg',
    'iluminacao-lanterna': '/img/pecas/lanterna.svg',
    'fixacao-roda': '/img/pecas/eixo.svg',
    'fixacao-roda-dianteiro': '/img/pecas/eixo.svg',
    'fixacao-roda-traseiro': '/img/pecas/eixo.svg'
};

function normalizarProduto(produto) {
    if (!produto) return null;
    const imagem = produto.imagem
        || ICONE_PADRAO[produto.subcategoria]
        || ICONE_PADRAO[produto.categoria]
        || '/img/pecas/quadro.svg';
    return { ...produto, imagem, preco: Number(produto.preco), aro: produto.aro === null ? null : String(produto.aro).trim() };
}

const normalizarSpec = require('./normalizarSpec');

const PRODUTO_DISPONIVEL_SQL = require('../config/produtoDisponivel');

class ProdutoModel {
    static async getEstruturaCategorias() {
        const { rows } = await pool.query('SELECT id, slug, name, parent_id FROM categories ORDER BY name');

        const porId = new Map(rows.map(c => [c.id, { slug: c.slug, nome: c.name, filhos: [] }]));
        const grupos = [];

        rows.forEach(categoria => {
            const node = porId.get(categoria.id);
            if (categoria.parent_id === null) {
                grupos.push(node);
            } else {
                const pai = porId.get(categoria.parent_id);
                if (pai) pai.filhos.push(node);
            }
        });

        return grupos
            .sort((a, b) => {
                const diferenca = prioridadeCategoria(a.slug) - prioridadeCategoria(b.slug);
                return diferenca !== 0 ? diferenca : a.nome.localeCompare(b.nome, 'pt-BR');
            })
            .map(grupo => ({
                slug: grupo.slug,
                nome: grupo.nome,
                subcategorias: grupo.filhos.length > 0
                    ? [
                        { slug: grupo.slug, nome: grupo.nome + ' (geral)' },
                        ...grupo.filhos
                            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                            .map(filho => ({ slug: filho.slug, nome: filho.nome }))
                    ]
                    : [{ slug: grupo.slug, nome: grupo.nome }]
            }));
    }

    static async getRegrasCompatibilidade() {
        const { rows } = await pool.query(
            'SELECT category_a, category_b, spec_key, description FROM compatibility_rules'
        );
        return rows;
    }

    static async listarTodos(busca) {
        const termo = busca && busca.trim() ? `%${busca.trim()}%` : null;
        const { rows } = await pool.query(
            `SELECT ${CAMPOS_PRODUTO} ${FROM_PRODUTO}
             WHERE ${PRODUTO_DISPONIVEL_SQL}
             AND ($1::text IS NULL OR p.name ILIKE $1 OR s.name ILIKE $1)
             ORDER BY ${ORDEM_PRIORIDADE_SQL}, p.name`,
            [termo]
        );
        return rows.map(normalizarProduto);
    }

    static async listarPorSubcategoria(subcategoria) {
        const { rows } = await pool.query(`SELECT ${CAMPOS_PRODUTO} ${FROM_PRODUTO} WHERE c.slug = $1 AND ${PRODUTO_DISPONIVEL_SQL} ORDER BY p.name`, [subcategoria]);
        return rows.map(normalizarProduto);
    }

    static async buscarPorId(id) {
        const { rows } = await pool.query(`SELECT ${CAMPOS_PRODUTO} ${FROM_PRODUTO} WHERE p.id = $1 AND ${PRODUTO_DISPONIVEL_SQL} LIMIT 1`, [id]);
        return normalizarProduto(rows[0]);
    }

    static async buscarVariosPorId(ids) {
        const { rows } = await pool.query(`SELECT ${CAMPOS_PRODUTO} ${FROM_PRODUTO} WHERE p.id = ANY($1::uuid[]) AND ${PRODUTO_DISPONIVEL_SQL}`, [ids]);
        return rows.map(normalizarProduto);
    }

    static async listarParaRevisao() {
        const { rows } = await pool.query(`
            SELECT
                p.id, p.name AS nome, p.product_url, p.image_url AS imagem,
                COALESCE(p.current_price, 0) AS preco, s.name AS marca,
                p.specs, p.ai_confidence AS confianca, p.is_optional AS opcional,
                c.slug AS categoria_atual, c.name AS categoria_atual_nome
            FROM products p
            JOIN sources s ON s.id = p.source_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.needs_review = true
            ORDER BY p.ai_confidence ASC NULLS FIRST, p.created_at DESC
        `);
        return rows.map(p => ({ ...p, preco: Number(p.preco) }));
    }

    static async listarCategoriasFlat() {
        const { rows } = await pool.query(`
            SELECT c.slug, c.name, parent.name AS grupo_pai
            FROM categories c
            LEFT JOIN categories parent ON parent.id = c.parent_id
            ORDER BY COALESCE(parent.name, c.name), c.name
        `);
        return rows;
    }

    static async aprovarProduto(id, { categoriaSlug, specs } = {}) {
        const campos = ['needs_review = false'];
        const valores = [];
        let indice = 1;

        if (categoriaSlug) {
            campos.push(`category_id = (SELECT id FROM categories WHERE slug = $${indice})`);
            valores.push(categoriaSlug);
            indice++;
        }
        if (specs) {
            campos.push(`specs = $${indice}::jsonb`);
            valores.push(JSON.stringify(specs));
            indice++;
        }

        valores.push(id);
        await pool.query(
            `UPDATE products SET ${campos.join(', ')}, updated_at = now() WHERE id = $${indice}`,
            valores
        );
    }

    static async rejeitarProduto(id) {
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
    }

    static async verificarCompatibilidade(pecasSelecionadas) {
        return (await this.avaliarCompatibilidade(pecasSelecionadas)).avisos;
    }

    static async avaliarCompatibilidade(pecasSelecionadas) {
        const avisos = [];
        const faltantes = [];
        const comparacoes = new Set();
        let verificadas = 0;
        const regras = await this.getRegrasCompatibilidade();

        function comparar(pecaA, pecaB, campo, valorA, valorB, mensagem) {
            const chave = JSON.stringify([[pecaA.id, pecaB.id].sort(), campo]);
            if (comparacoes.has(chave)) return;
            comparacoes.add(chave);
            const resumir = peca => ({ id: peca.id, nome: peca.nome || 'Peça sem nome' });
            if (valorA === null || valorB === null) {
                faltantes.push({
                    campo,
                    pecas: [resumir(pecaA), resumir(pecaB)],
                    ausentes: [valorA === null ? pecaA : null, valorB === null ? pecaB : null]
                        .filter(Boolean).map(resumir)
                });
                return;
            }
            verificadas++;
            if (valorA !== valorB) avisos.push(mensagem);
        }

        const pecaAtendeCategoria = (peca, categoriaSlug) =>
            peca.subcategoria === categoriaSlug || peca.categoria === categoriaSlug;

        regras.forEach(regra => {
            const pecasA = pecasSelecionadas.filter(p => pecaAtendeCategoria(p, regra.category_a));
            const pecasB = pecasSelecionadas.filter(p => pecaAtendeCategoria(p, regra.category_b));

            pecasA.forEach(pecaA => {
                pecasB.forEach(pecaB => {
                    if (pecaA.id === pecaB.id) return;

                    const valorA = normalizarSpec(pecaA.specs?.[regra.spec_key], regra.spec_key);
                    const valorB = normalizarSpec(pecaB.specs?.[regra.spec_key], regra.spec_key);
                    comparar(pecaA, pecaB, regra.spec_key, valorA, valorB, regra.description);
                });
            });
        });

        const quadro = pecasSelecionadas.find(p => p.subcategoria === 'quadro' || p.categoria === 'quadro');
        const roda = pecasSelecionadas.find(p => p.categoria === 'rodas');
        const aroQuadro = normalizarSpec(quadro?.aro ?? quadro?.specs?.aro, 'aro');
        const aroRoda = normalizarSpec(roda?.aro ?? roda?.specs?.aro, 'aro');
        if (quadro && roda && quadro.id !== roda.id) {
            const aviso = `A roda selecionada (aro ${roda.aro}) não é compatível com o quadro (aro ${quadro.aro}).`;
            comparar(quadro, roda, 'aro', aroQuadro, aroRoda, aviso);
        }

        return {
            status: avisos.length ? 'incompativel' : faltantes.length ? 'dados_insuficientes'
                : verificadas ? 'sem_divergencias' : 'nao_verificada',
            verificadas,
            pendentes: faltantes.length,
            faltantes,
            avisos: [...new Set(avisos)]
        };
    }
}

module.exports = ProdutoModel;
