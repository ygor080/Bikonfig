const { randomUUID } = require('node:crypto');
const contexto = new (require('node:async_hooks').AsyncLocalStorage)();
const escreverErro = console.error.bind(console);
function registrarErro(evento, erro, emitir = escreverErro) {
    const codigo = typeof erro?.code==='string' && /^(?:ENOENT|EACCES|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|[A-Z0-9]{5}|auth\/[a-z-]{1,45}|app\/[a-z-]{1,45})$/.test(erro.code) ? erro.code : 'ERRO_INTERNO';
    emitir(JSON.stringify({ nivel:'erro', evento, codigo, requestId:contexto.getStore()?.requestId, instante:new Date().toISOString() }));
}
function monitorar(env) {
    return (req,res,next) => {
        const inicio=process.hrtime.bigint(); req.id=randomUUID(); res.setHeader('X-Request-ID',req.id);
        res.on('finish',()=>{
            if (res.statusCode<500 && env.MONITOR_HTTP_ENABLED!=='true') return;
            const rota = typeof req.route?.path==='string' ? req.route.path : 'rota-nao-identificada';
            console.log(JSON.stringify({ evento:'http', requestId:req.id, metodo:['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OUTRO', rota,
                status:res.statusCode, duracaoMs:Number(process.hrtime.bigint()-inicio)/1e6 }));
        });
        contexto.run({requestId:req.id},next);
    };
}
function instalarConsoleSeguro() {
    const anterior=console.error;
    const eventos = { 'Não foi possível preparar a recuperação de senha.':'recuperacao_preparo',
        'Fila de recuperação de senha indisponível.':'recuperacao_fila',
        'Falha no envio de recuperação de senha; nova tentativa limitada será realizada.':'recuperacao_envio',
        'Erro ao carregar configuração:':'montagem_carregar', 'Erro ao salvar configuração:':'montagem_salvar',
        'Erro ao gerar PDF:':'pdf_gerar', 'Erro ao excluir configuração:':'montagem_excluir' };
    console.error=(...dados)=>registrarErro(eventos[dados[0]]||'erro_aplicacao',dados.find(d=>d && typeof d==='object'));
    return ()=>{console.error=anterior;};
}
module.exports = { registrarErro, monitorar, instalarConsoleSeguro };
