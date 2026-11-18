const { configuracao, decifrar } = require('../config/recuperacaoSenha');
async function processarEmails({ pool, env, consultar = fetch }) {
    const config = configuracao(env);
    if (!config) return;
    const { rows } = await pool.query(`UPDATE recuperacoes_senha SET bloqueado_ate=now()+interval '60 seconds',tentativas=tentativas+1
        WHERE token_hash IN (SELECT token_hash FROM recuperacoes_senha WHERE email_payload IS NOT NULL AND usado_em IS NULL
        AND expira_em>now() AND enviado_em IS NULL AND tentativas<5 AND proxima_tentativa<=now()
        AND (bloqueado_ate IS NULL OR bloqueado_ate<now()) ORDER BY criado_em LIMIT 5 FOR UPDATE SKIP LOCKED)
        RETURNING token_hash,email_payload,tentativas`);
    for (const job of rows) {
        try {
            const dados = decifrar(job.email_payload, config.key);
            const resposta = await consultar('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000),
                headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'bikonfig-reset/' + job.token_hash },
                body: JSON.stringify({ from: 'Bikonfig <' + env.EMAIL_FROM + '>', to: [dados.email], subject: 'Redefinir sua senha do Bikonfig',
                    text: 'Você solicitou a redefinição da senha. O link expira em 30 minutos e só pode ser usado uma vez.\n\n' + dados.link + '\n\nSe não solicitou, ignore esta mensagem.' }) });
            if (!resposta.ok) throw new Error('envio');
            await pool.query('UPDATE recuperacoes_senha SET enviado_em=now(),email_payload=NULL,bloqueado_ate=NULL WHERE token_hash=$1', [job.token_hash]);
        } catch {
            console.error('Falha no envio de recuperação de senha; nova tentativa limitada será realizada.');
            await pool.query("UPDATE recuperacoes_senha SET bloqueado_ate=NULL,proxima_tentativa=now()+interval '60 seconds' WHERE token_hash=$1", [job.token_hash]);
        }
    }
}
function iniciarEmails(opcoes) {
    if (!configuracao(opcoes.env)) return () => {};
    let ocupado = false;
    const executar = async () => { if (ocupado) return; ocupado = true;
        try { await processarEmails(opcoes); } catch { console.error('Fila de recuperação de senha indisponível.'); }
        finally { ocupado = false; }
    };
    const timer = setInterval(executar, 10000); timer.unref(); executar();
    return () => clearInterval(timer);
}
module.exports = { processarEmails, iniciarEmails };
