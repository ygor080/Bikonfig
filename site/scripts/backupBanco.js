const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash}=require('node:crypto');
const {pipeline}=require('node:stream/promises');
function chave(env) {
    if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||'')) throw new Error('Configure BACKUP_ENCRYPTION_KEY com 32 bytes em hexadecimal.');
    return Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex');
}
function conexao(valor) {
    const u=new URL(valor); if (!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||u.pathname.length<2) throw new Error('Conexão inválida.');
    return u;
}
function ambientePg(url,env) {
    return {...env, PGHOST:url.hostname, PGPORT:url.port||'5432', PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
        PGUSER:decodeURIComponent(url.username), PGPASSWORD:decodeURIComponent(url.password),
        PGSSLMODE:url.searchParams.get('sslmode')||(['127.0.0.1','localhost'].includes(url.hostname)?'disable':'require')};
}
function executar(nome,args,env,capturar=false) {
    const bin=env.PG_BIN_DIR ? path.join(env.PG_BIN_DIR,nome+(process.platform==='win32'?'.exe':'')) : nome;
    return new Promise((resolve,reject)=>{
        const p=spawn(bin,args,{env,windowsHide:true,stdio:['ignore',capturar?'pipe':'ignore','pipe']});
        let saida=''; if(p.stdout)p.stdout.on('data',parte=>{saida+=parte; if(saida.length>16000000)p.kill();});
        const timer=setTimeout(()=>{p.kill();reject(new Error('Ferramenta PostgreSQL excedeu o prazo.'));},600000);
        p.stderr.on('data',()=>{});
        p.on('error',()=>{clearTimeout(timer);reject(new Error('Ferramenta PostgreSQL indisponível. Configure PG_BIN_DIR.'));});
        p.on('close',code=>{clearTimeout(timer);code===0?resolve(saida):reject(new Error('Operação PostgreSQL falhou; confira permissões e destino sem divulgar credenciais.'));});
    });
}
async function digest(arquivo) {
    const h=createHash('sha256'); for await(const parte of fs.createReadStream(arquivo)) h.update(parte); return h.digest('hex');
}
async function criarBackup({env=process.env,pasta=path.resolve('.cache/backups')}={}) {
    const key=chave(env), origem=conexao(env.DATABASE_URL);
    fs.mkdirSync(pasta,{recursive:true,mode:0o700});
    const temporaria=fs.mkdtempSync(path.join(os.tmpdir(),'bikonfig-backup-')), bruto=path.join(temporaria,'public.dump');
    const destino=path.join(pasta,'bikonfig-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.dump.enc');
    try {
        await executar('pg_dump',['--format=custom','--schema=public','--no-owner','--no-acl','--file',bruto],ambientePg(origem,env));
        const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
        const saida=fs.createWriteStream(destino,{flags:'wx',mode:0o600}); saida.write(Buffer.concat([Buffer.from('BKBACK01'),iv]));
        await pipeline(fs.createReadStream(bruto),cipher,saida); fs.appendFileSync(destino,cipher.getAuthTag());
        const manifesto={versao:1,criadoEm:new Date().toISOString(),escopo:'schema public',sha256:await digest(destino),arquivo:path.basename(destino)};
        fs.writeFileSync(destino+'.json',JSON.stringify(manifesto,null,2),{flag:'wx',mode:0o600});
        return {arquivo:destino,manifesto:destino+'.json'};
    } finally { if(fs.existsSync(bruto))fs.unlinkSync(bruto); fs.rmdirSync(temporaria); }
}
async function restaurarBackup({env=process.env,arquivo}={}) {
    if(env.CONFIRM_RESTORE!=='RESTORE_EMPTY_DATABASE')throw new Error('Confirme a restauração apenas em um banco isolado e vazio.');
    const key=chave(env), origem=conexao(env.DATABASE_URL), destino=conexao(env.RESTORE_DATABASE_URL);
    if(origem.hostname.toLowerCase()===destino.hostname.toLowerCase()&&(origem.port||'5432')===(destino.port||'5432')&&decodeURIComponent(origem.pathname)===decodeURIComponent(destino.pathname))throw new Error('O destino não pode ser o banco de origem.');
    const manifesto=JSON.parse(fs.readFileSync(arquivo+'.json','utf8'));
    if(manifesto.versao!==1||manifesto.sha256!==await digest(arquivo))throw new Error('Backup sem integridade verificada.');
    const {Client}=require('pg'), client=new Client({connectionString:destino.href}); await client.connect();
    try {
        const {rows}=await client.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE'");
        if(Number(rows[0].total)!==0)throw new Error('Restauração recusada: o destino contém tabelas.');
    } finally {await client.end();}
    const temporaria=fs.mkdtempSync(path.join(os.tmpdir(),'bikonfig-restore-')), bruto=path.join(temporaria,'public.dump');
    try {
        const tamanho=fs.statSync(arquivo).size, fd=fs.openSync(arquivo,'r'), header=Buffer.alloc(20),tag=Buffer.alloc(16);
        try{fs.readSync(fd,header,0,20,0);fs.readSync(fd,tag,0,16,tamanho-16);}finally{fs.closeSync(fd);}
        if(header.subarray(0,8).toString()!=='BKBACK01'||tamanho<=36)throw new Error('Formato de backup inválido.');
        const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAuthTag(tag);
        await pipeline(fs.createReadStream(arquivo,{start:20,end:tamanho-17}),decipher,fs.createWriteStream(bruto,{flags:'wx',mode:0o600}));
        // Um banco PostgreSQL novo já contém public. Não usa DROP/--clean para contornar isso.
        const lista=await executar('pg_restore',['--list',bruto],ambientePg(destino,env),true);
        const listaArquivo=path.join(temporaria,'conteudo.list');
        fs.writeFileSync(listaArquivo,lista.split('\n').filter(l=>!(/\bSCHEMA - public\b/.test(l))).join('\n'),{mode:0o600});
        try {
            await executar('pg_restore',['--use-list',listaArquivo,'--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',decodeURIComponent(destino.pathname.slice(1)),bruto],ambientePg(destino,env));
        } finally {fs.unlinkSync(listaArquivo);}
        return {restaurado:true};
    } finally {if(fs.existsSync(bruto))fs.unlinkSync(bruto);fs.rmdirSync(temporaria);}
}
if(require.main===module){
    const operacao=process.argv[2];
    const tarefa=operacao==='criar'?criarBackup():operacao==='restaurar'?restaurarBackup({arquivo:process.argv[3]}):Promise.reject(new Error('Use criar ou restaurar.'));
    tarefa.then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error('Backup/restauração não concluído. Confira configuração, ferramentas PostgreSQL e destino vazio.');process.exitCode=1;});
}
module.exports={criarBackup,restaurarBackup};
