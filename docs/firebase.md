# Autenticação do Bikonfig

O site usa cadastro e login tradicionais por usuário e senha no PostgreSQL,
com **Entrar com Google** como opção adicional via Firebase. O login e cadastro
por e-mail/senha Firebase e o fluxo de migração de contas foram removidos.

## Configuração Google

No Firebase, registre um aplicativo Web, habilite Google em Authentication e
adicione o hostname publicado aos domínios autorizados. Configure no Render:

```dotenv
FIREBASE_ENABLED=true
FIREBASE_WEB_ENABLED=true
FIREBASE_PROJECT_ID=seu-projeto
FIREBASE_WEB_API_KEY=apiKey-do-aplicativo-web
FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
FIREBASE_WEB_APP_ID=appId-do-aplicativo-web
FIREBASE_AUTHORIZED_DOMAINS_JSON=["bikonfig.onrender.com"]
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json
```

A credencial JSON precisa pertencer ao mesmo projeto e ficar em Secret Files,
fora do repositório e de site/public. Não publique chaves privadas. As duas
flags habilitam somente a opção Google; os formulários locais continuam
funcionando. FIREBASE_LEGACY_ENABLED não é mais utilizada e pode ser removida
das variáveis do ambiente. O parâmetro legado=1 não é necessário.

Aplique database/migrations/031_vinculos_firebase.sql se a tabela de identidades
ainda não existir. Ela é necessária para Google. Não exclua vínculos, usuários,
hashes ou montagens ao atualizar o código.

## Fluxo atual

O SDK oficial abre um popup Google. POST /auth/firebase/google recebe apenas
idToken com CSRF e limite de tentativas. O servidor valida assinatura, projeto,
revogação, autenticação recente, provedor Google e e-mail verificado. Um acesso
já vinculado conserva o usuário e as permissões do banco; um novo acesso cria
usuário sem privilégios e vínculo em transação. Conflito de e-mail não associa
contas automaticamente: a pessoa deve usar o acesso local original.

As rotas POST /auth/firebase/session, /auth/firebase/register e
/auth/firebase/link e a página /migrar-conta não existem mais. Não há interface
ou serviço de migração nem criação/login de identidade por senha Firebase.
O cadastro tradicional continua armazenando bcrypt somente no banco do site.

Cookies de sessão Firebase são HttpOnly e, em produção, Secure. A identidade do
SDK fica em memória. Revogação, expiração ou perda do vínculo invalidam a
sessão. Falhas temporárias do provedor não liberam conteúdo protegido.
Contas já associadas a identidade externa continuam impedidas de contornar a
autenticação externa pelo bcrypt antigo; não há remoção de dados existentes.

A recuperação Firebase entregue anteriormente permanece em /recuperar-senha
para identidades Firebase já existentes; não autentica nem cria conta e não
altera a senha local. Ela não é oferecida como recuperação do login tradicional.
A redefinição usa a página padrão hospedada pelo Firebase. A recuperação da
conta Google é administrada pelo Google.

## Verificação

```powershell
npm --prefix site run check:firebase
npm --prefix site test
npm --prefix site run build:auth
```

O diagnóstico confere variáveis, credencial e estrutura local sem imprimir
segredos ou criar usuários remotos. O bundle é versionado. Os testes usam SDK
simulado e PostgreSQL temporário, sem enviar e-mails ou alterar o banco
publicado. Valide a autorização Google real após configurar o projeto.

Referências: [Google com Firebase](https://firebase.google.com/docs/auth/web/google-signin)
e [cookies de sessão](https://firebase.google.com/docs/auth/admin/manage-cookies).

## Validação de autenticação — etapa 37

O acesso Google real em produção foi confirmado pelo proprietário em
17/11/2026, após a aplicação da migração 031. As verificações públicas
confirmaram saúde, domínio autorizado, configuração do popup, CSRF e recusa
de token inválido. Para repetir sem entrar em contas ou criar usuários:

```powershell
npm --prefix site run check:published
npm --prefix site run check:google:published
```

O segundo comando consulta a configuração pública e os domínios autorizados
no Google e envia duas tentativas deliberadamente inválidas ao endpoint
de login (uma sem CSRF e outra com token inválido). Não modifica usuários
ou montagens; consome duas tentativas do limite de autenticação e cria
somente a sessão anônima necessária ao CSRF. Não execute em repetição
rápida. O relatório não imprime API key, cookies, tokens ou e-mails.
Ele não substitui uma validação autenticada de entrada, saída e montagens.

Quando o e-mail Google já pertence a uma conta local sem vínculo externo,
a resposta usa CONTA_LOCAL_EXISTENTE. A tela oferece entrar com usuário
e senha ou selecionar outra conta Google. No cadastro, a primeira opção
leva ao login; no login, coloca o foco no usuário. Conflitos com outro
acesso também apresentam orientação sem expor dados da conta. Nenhuma
associação, transferência de montagens ou migração ocorre automaticamente.
Depois de uma tentativa sem sucesso, a identidade temporária do SDK é
limpa antes de permitir nova seleção.

Os testes com HTTP, sessões reais e PostgreSQL temporário conferem conflito
local, integridade de credenciais, ausência de duplicação, logout que
invalida o cookie anterior e retorno à mesma conta com sua montagem.
O provedor é simulado nesses testes; não são usados tokens reais de usuários.
Não há nova migração SQL nem variável de ambiente nesta etapa.
