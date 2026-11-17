function criarVerificacaoSaude(pool, limiteMs = 2000) {
    return async (req, res) => {
        let timer;
        res.setHeader('Cache-Control', 'no-store');
        try {
            await Promise.race([
                pool.query('SELECT 1'),
                new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('timeout')), limiteMs); })
            ]);
            res.json({ status: 'ok' });
        } catch {
            res.status(503).json({ status: 'indisponivel' });
        } finally { clearTimeout(timer); }
    };
}
module.exports = { criarVerificacaoSaude };
