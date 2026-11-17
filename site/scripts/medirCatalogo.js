const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { pool } = require('../config/banco');
const ProdutoModel = require('../models/produtoModel');

async function executar() {
    try {
        await pool.query('SELECT 1');
        const resultados = [];
        for (let i = 0; i < 3; i++) {
            for (const modo of ['completo', 'paginado']) {
                const inicio = performance.now();
                const dados = modo === 'completo' ? await ProdutoModel.listarTodos('') : await ProdutoModel.listarPaginado('', 1);
                resultados.push({ modo, ms: Math.round(performance.now() - inicio),
                    ofertas: Array.isArray(dados) ? dados.length : dados.produtos.length,
                    bytesJson: Buffer.byteLength(JSON.stringify(dados)) });
            }
        }
        console.log(JSON.stringify({ escopo: 'Leitura pelo ambiente configurado; tempos incluem rede e variam.', resultados }, null, 2));
    } catch {
        console.error('Não foi possível medir o catálogo. Confira a conexão e a estrutura do banco.');
        process.exitCode = 1;
    } finally { await pool.end(); }
}
executar();
