# Operação, privacidade e validação — etapa 42

## Resultado e limites

O site tem identificador de requisição, logs estruturados de erro/duração sem
corpos, URLs completas, cookies ou credenciais, desligamento controlado e
aviso público em /privacidade. O contato informado é bikonfig1@gmail.com,
alterável por PRIVACIDADE_CONTATO. O aviso descreve a operação atual e precisa
acompanhar mudanças; não substitui a revisão das responsabilidades do projeto.

O teste de restauração foi feito em PostgreSQL 18 local isolado, com dados
sintéticos. Foram verificados proprietário, tipo de montagem, itens nas duas
posições e recusa de destino preenchido, origem e arquivo adulterado. O banco
publicado não foi restaurado nem modificado por esses testes.

## Ativação da recuperação tradicional

Execute database/migrations/038_recuperacao_senha.sql no banco do Render.
Configure Resend e remetente com domínio verificado, PUBLIC_BASE_URL e
RECUPERACAO_SENHA_ENABLED=true, conforme recuperacao-senha.md. Sem isso a
recuperação permanece desativada. O diagnóstico check:production também
verifica essa estrutura quando a função está habilitada.

## Monitoramento

Erros HTTP 5xx são registrados com requestId, status e tempo. O cabeçalho
X-Request-ID permite correlacionar um problema; erros internos não imprimem
mensagens ou detalhes SQL. MONITOR_HTTP_ENABLED=true registra também as
respostas sem erro. Configure a retenção/acesso dos logs no provedor.

O workflow monitoramento.yml pode ser executado manualmente em GitHub Actions.
Para verificar a publicação a cada 30 minutos, defina a variável do repositório
MONITORAMENTO_ENABLED=true. Sem essa variável, os horários agendados ficam
inativos. Ele verifica somente rotas públicas e tentativas inválidas, sem
entrar em contas. Configure as notificações de falha do GitHub conforme sua
preferência. Não há serviço pago de monitoramento configurado automaticamente.

## Backup somente local

Conforme solicitado, não há workflow de upload de backups nem cópia em
artefatos do GitHub. A rotina gera arquivo cifrado local e manifesto SHA-256.
O escopo é o schema public do PostgreSQL: não inclui credenciais do ambiente,
usuários externos Firebase, arquivos do repositório ou schemas gerenciados
externamente. Mantenha essas configurações separadamente e protegidas.

Instale as ferramentas PostgreSQL de versão compatível com o servidor (cliente
não pode ser mais antigo que o banco) e configure PG_BIN_DIR se não estiverem
no PATH. No ambiente local privado, configure DATABASE_URL e uma chave exclusiva
BACKUP_ENCRYPTION_KEY de 32 bytes em hexadecimal. Para gerar uma chave no seu
terminal privado, sem enviá-la ao chat ou Git:

```powershell
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
node --env-file=site/.env site/scripts/backupBanco.js criar
```

Os arquivos ficam em .cache/backups, ignorados pelo Git. Não perca a chave:
sem ela não é possível restaurar. O dump temporário é removido após a cifragem;
o arquivo final usa AES-256-GCM. Armazene a chave fora da pasta dos backups.
Não há remoção automática das cópias locais: revise a retenção e exclua somente
arquivos que não sejam mais necessários. Não envie backups ou chaves por chat.

## Restauração em ambiente isolado

Use um banco PostgreSQL descartável vazio, diferente da origem. Configure
RESTORE_DATABASE_URL e CONFIRM_RESTORE=RESTORE_EMPTY_DATABASE no ambiente
privado de restauração, mantendo a chave correta e DATABASE_URL da origem
apenas para a verificação de que o destino é diferente. A restauração não
usa --clean nem apaga tabelas existentes.

```powershell
node --env-file=site/.env.restore.local site/scripts/backupBanco.js restaurar CAMINHO_DO_ARQUIVO.dump.enc
```

O manifesto .json deve acompanhar o arquivo cifrado. O script confere o
checksum, autentica a cifra e recusa destino com tabelas. O dump é restaurado
em uma transação, sem proprietários/ACL originais. Configure permissões e RLS
do usuário da aplicação depois, conforme o ambiente. Nunca teste no banco real.
Mantenha recuperação/e-mails e coletas desativados no ambiente restaurado até
revisar destinatários e conexões. Não execute um backup de origem não confiável.

## Verificações de publicação

```powershell
npm --prefix site test
npm --prefix site run check:published
npm --prefix site run check:google:published
npm --prefix site run check:production
```

O último comando deve rodar no ambiente a verificar; o .env do computador não
comprova a configuração do Render. Login Google real foi confirmado pelo
proprietário na etapa 37. Troca de senha/e-mail real exige o Resend configurado;
os testes automatizados usam envio simulado. Confira os fluxos em uma conta
controlada antes de habilitar a recuperação publicamente.

O ensaio local de backup/restauração pode ser repetido com `npm --prefix site run test:backup:local`. Ele inicia um PostgreSQL isolado em loopback, usa apenas dados sintéticos e encerra esse processo ao terminar. Exige `initdb`, `pg_ctl`, `pg_dump` e `pg_restore` disponíveis.

Referência de direitos dos titulares: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares .
