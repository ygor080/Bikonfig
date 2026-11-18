if(!process.argv.includes('--confirmar-teste-local')){console.error('Use --confirmar-teste-local para criar apenas bancos sintéticos locais.');process.exit(1);}
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{Client}=require('pg'),{randomBytes}=require('crypto');
const {criarBackup,restaurarBackup}=require('./backupBanco');
(async()=>{
const raiz=path.resolve(__dirname,'../../.cache/backup-selftest'),dados=path.join(raiz,'pgdata'),bin=process.env.PG_BIN_DIR||(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
if(!dados.startsWith(raiz+path.sep))throw new Error('Diretório fora da área de teste');
function rodar(nome,args){const r=spawnSync(bin?path.join(bin,nome+(process.platform==='win32'?'.exe':'')):nome,args,{windowsHide:true,encoding:'utf8',stdio:'ignore',timeout:60000});if(r.status!==0)throw new Error(nome+' falhou: '+r.stderr);}
let iniciou=false;
try{
if(!fs.existsSync(path.join(dados,'PG_VERSION')))rodar('initdb',['-D',dados,'-U','bikonfig_teste','-A','trust','--no-locale','--encoding=UTF8']);
rodar('pg_ctl',['-D',dados,'-l',path.join(raiz,'postgres.log'),'-o','-h 127.0.0.1 -p 65439','-w','start']);iniciou=true;
const admin=new Client({connectionString:'postgresql://bikonfig_teste@127.0.0.1:65439/postgres?sslmode=disable'});await admin.connect();
const sufixo=Date.now().toString(),origem='origem_'+sufixo,destino='restaurado_'+sufixo;
await admin.query('CREATE DATABASE '+origem);await admin.query('CREATE DATABASE '+destino);await admin.end();
const uri=nome=>'postgresql://bikonfig_teste@127.0.0.1:65439/'+nome+'?sslmode=disable';
const c=new Client({connectionString:uri(origem)});await c.connect();await c.query(fs.readFileSync(path.join(__dirname,'../../database/schema.sql'),'utf8'));
const u=(await c.query("INSERT INTO usuarios(nome,email,senha) VALUES('Teste restauração','backup@teste.invalid','hash-ficticio') RETURNING id")).rows[0].id;
const cfg=(await c.query("INSERT INTO configuracoes(usuario_id,nome,tipo_montagem) VALUES($1,'Montagem preservada','single-speed') RETURNING id",[u])).rows[0].id;
const fonte=(await c.query("INSERT INTO sources(domain,name) VALUES('teste.invalid','Fonte teste') RETURNING id")).rows[0].id;
const produto=(await c.query("INSERT INTO products(source_id,name,product_url,current_price,specs) VALUES($1,'Pneu teste','https://teste.invalid/pneu',123.45,'{\"aro\":29}') RETURNING id",[fonte])).rows[0].id;
for(const pos of ['dianteira','traseira'])await c.query('INSERT INTO configuracao_itens(configuracao_id,produto_id,posicao) VALUES($1,$2,$3)',[cfg,produto,pos]);await c.end();
const env={...process.env,DATABASE_URL:uri(origem),RESTORE_DATABASE_URL:uri(destino),PG_BIN_DIR:bin,BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex'),CONFIRM_RESTORE:'RESTORE_EMPTY_DATABASE'};
const backup=await criarBackup({env,pasta:path.join(raiz,'backups')});await restaurarBackup({env,arquivo:backup.arquivo});
const restaurado=new Client({connectionString:uri(destino)});await restaurado.connect();const registro=(await restaurado.query('SELECT usuario_id,nome,tipo_montagem FROM configuracoes')).rows[0];if(registro.usuario_id!==u||registro.tipo_montagem!=='single-speed')throw new Error('Dados não preservados');const itens=(await restaurado.query('SELECT posicao FROM configuracao_itens ORDER BY id')).rows;const oferta=(await restaurado.query('SELECT current_price,specs FROM products')).rows[0];if(Number(oferta.current_price)!==123.45||oferta.specs.aro!==29)throw new Error('Preço/especificações não preservados');if(itens.length!==2||itens[0].posicao!=='dianteira'||itens[1].posicao!=='traseira')throw new Error('Posições não preservadas');await restaurado.end();
let bloqueou=false;try{await restaurarBackup({env,arquivo:backup.arquivo});}catch{bloqueou=true;}if(!bloqueou)throw new Error('Permitiu restaurar sobre banco preenchido');
let origemBloqueada=false;try{await restaurarBackup({env:{...env,RESTORE_DATABASE_URL:env.DATABASE_URL},arquivo:backup.arquivo});}catch{origemBloqueada=true;}if(!origemBloqueada)throw new Error('Permitiu restaurar na origem');
const bytes=fs.readFileSync(backup.arquivo);bytes[25]^=1;fs.writeFileSync(backup.arquivo,bytes);let adulteracaoBloqueada=false;try{await restaurarBackup({env,arquivo:backup.arquivo});}catch{adulteracaoBloqueada=true;}if(!adulteracaoBloqueada)throw new Error('Backup adulterado aceito');
console.log(JSON.stringify({backupCifrado:true,restauracaoIsolada:true,proprietarioPreservado:true,tipoPreservado:true,duasPosicoesPreservadas:true,precoEspecificacoesPreservados:true,destinoPreenchidoRecusado:bloqueou,origemRecusada:origemBloqueada,adulteracaoRecusada:adulteracaoBloqueada}));
}finally{if(iniciou)rodar('pg_ctl',['-D',dados,'-m','fast','-w','stop']);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
