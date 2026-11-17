# Preparação do Firebase — etapa 31

Esta etapa prepara configuração, SDK Admin e vínculo de contas. O login
existente continua usando os usuários e as sessões atuais. Não há login
Google, recuperação de senha ou envio de e-mail Firebase ainda; esses fluxos
serão integrados nas próximas etapas. Nenhum usuário foi importado.

## 1. Criar o projeto e o aplicativo web

1. No [console Firebase](https://console.firebase.google.com/), crie o projeto
   Bikonfig. Analytics é opcional para esta integração de autenticação.
2. Registre um aplicativo **Web** e copie os campos `projectId`, `apiKey`,
   `authDomain` e `appId` da configuração fornecida pelo console.
3. Abra **Authentication** e prepare os provedores **E-mail/senha** e
   **Google**. Configure o e-mail de suporte solicitado pelo Google.
4. Em Authentication, confira os domínios autorizados: `localhost`,
   `127.0.0.1`, `bikonfig.onrender.com` e seu domínio próprio, se houver.
   Declare somente hostnames, sem protocolo, porta ou caminho. A lista do
   `.env` é uma declaração local; não modifica a lista do console.
5. Prefira projetos distintos para desenvolvimento e produção. Os IDs ficam
   nos ambientes correspondentes. As montagens continuam no PostgreSQL.

Referência: [autenticação web](https://firebase.google.com/docs/auth/web/start).

## 2. Configuração pública e credencial privada

Use `site/.env.example` como referência. Para a preparação local:

```dotenv
FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=seu-project-id
FIREBASE_WEB_API_KEY=valor-do-console
FIREBASE_AUTH_DOMAIN=seu-project-id.firebaseapp.com
FIREBASE_WEB_APP_ID=1:numero-do-projeto:web:identificador
FIREBASE_AUTHORIZED_DOMAINS_JSON=["localhost","127.0.0.1","bikonfig.onrender.com"]
GOOGLE_APPLICATION_CREDENTIALS=/caminho/privado/firebase-admin.json
```

Os valores acima são ilustrativos. Os quatro campos web são configuração
pública; a chave privada de uma conta de serviço nunca faz parte deles.
O módulo público retorna somente esses quatro campos, sem credenciais.

No Firebase, obtenha a credencial em **Configurações do projeto → Contas de
serviço** e guarde o JSON fora do repositório e de `site/public/`. No Render,
use um **Secret File** e defina `GOOGLE_APPLICATION_CREDENTIALS` com seu caminho,
por exemplo `/etc/secrets/firebase-admin.json`. Não envie o arquivo no chat
nem o inclua em commits. O SDK usa Application Default Credentials.

`FIREBASE_ENABLED=false` é o padrão. Nesta etapa, `true` habilita apenas a
preparação/verificação e o acesso explícito ao SDK; não troca a autenticação
das rotas existentes. O SDK não é inicializado pelo servidor ao iniciar.
O backend não aceita emulador de autenticação em produção pela configuração
preparada. Não é necessário adicionar Firestore para guardar as montagens.

Referência: [configurar o Admin SDK](https://firebase.google.com/docs/admin/setup).

## 3. Preparar o banco existente

Antes de usar vínculos Firebase, execute uma vez o conteúdo completo de:

`database/migrations/031_vinculos_firebase.sql`

O `schema.sql` inclui a mesma estrutura para bancos novos. A migração cria
`usuarios_identidades`; não modifica senhas, IDs, permissões administrativas
ou montagens. A chave é `(firebase_project_id, firebase_uid)` e cada usuário
tem no máximo uma identidade por projeto. Repetir a migração é permitido.

A tabela usa RLS sem políticas de acesso público. A conexão do servidor
precisa ser proprietária, superusuária ou ter BYPASSRLS e permissões adequadas.
Não exponha esse vínculo pela API anônima do Supabase nem habilite acesso
público para contornar uma falha de configuração.

O modelo preparado permite consulta e vínculo internos, sem rota HTTP. Um
vínculo existente não pode ser movido para outro usuário nem substituído por
outro UID. A conta administrativa continua sendo determinada pelo banco.

## 4. Verificar sem criar usuários remotos

```bash
npm --prefix site ci
npm --prefix site run check:firebase
npm --prefix site test
```

Desabilitado, o diagnóstico não acessa Firebase nem banco. Habilitado, valida
as variáveis, o arquivo local de credencial, correspondência de projeto,
chave RSA e estrutura/permissões dos vínculos. Imprime apenas resumo e
contagens, sem senhas, hashes, chaves ou e-mails dos usuários.

Esse comando não chama APIs Firebase: não comprova permissões remotas,
provedores ativados ou domínios autorizados no console. A autenticação real
e a criação segura das sessões serão tratadas na etapa 32.

## 5. Preservar as contas durante a transição

- Manter `usuarios.id` como dono das montagens. O UID Firebase é associado
  por tabela, sem trocar as chaves estrangeiras das configurações.
- Planejar a importação dos usuários existentes com UID igual ao UUID atual,
  quando não houver conflito no projeto. O Firebase admite importação BCRYPT,
  mas nenhuma importação/exportação é executada nesta etapa.
- Resolver e-mails normalizados repetidos e conflitos de identidades antes
  da migração. Não marcar e-mails antigos como verificados sem evidência.
- Nunca vincular automaticamente pelo e-mail que o navegador enviou. As
  próximas etapas precisam comprovar identidade Firebase no servidor e posse
  da conta existente antes de associar Google ou outra credencial.
- Testar os fluxos das etapas 32–35 no ambiente de desenvolvimento e liberar
  o novo login em produção somente após validar a estratégia de transição
  da etapa 36. Isso evita criar contas paralelas antes de migrar as antigas.

Referência: [importação de usuários BCRYPT](https://firebase.google.com/docs/auth/admin/import-users).

## Estado desta entrega

153 testes Node aprovados, incluindo configuração pública/privada, credencial
simulada, migração repetida em PostgreSQL temporário, unicidade dos vínculos,
separação de projetos e preservação do login e montagens existentes.

O projeto Firebase será criado pelo proprietário. Nenhum projeto, credencial,
domínio no console, usuário remoto ou vínculo no banco real foi criado.
A migração 031 está entregue, mas não foi executada no banco publicado.
