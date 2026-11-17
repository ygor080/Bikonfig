# Verificação de produção — etapa 23

## Comandos sem alteração de dados

No ambiente que executa o site:

```bash
npm --prefix site run check:production
```

Se o diretório de trabalho já é `site`, use `npm run check:production`.
O comando verifica o ambiente efetivo, as colunas esperadas das etapas
anteriores e a tabela/permissões das sessões. Retorna código 0 quando as
verificações passam e 1 quando há pendências. Não executa SQL de migração,
não cria tabelas e não imprime URLs de conexão, senhas ou chaves.

Para verificar a conexão do `.env` local sem exigir `NODE_ENV=production`:

```bash
npm --prefix site run check:production -- --local
```

Um resultado local não comprova as variáveis do Render nem que o banco
localmente configurado seja o mesmo do deploy. A inspeção de colunas não
substitui a revisão de índices, constraints e permissões de todas as rotas.

## Configuração do Render

- Runtime Node 24; se Root Directory é `site`, Build Command `npm ci` e
  Start Command `npm start`. Com raiz do repositório, use
  `npm --prefix site ci` e `npm --prefix site start`.
- `DATABASE_URL`: conexão do banco usado pelo projeto; manter a mesma base
  na API/coletor. Não colocar o valor na documentação ou no Git.
- `SECRET`: chave aleatória com pelo menos 32 bytes, estável entre deploys
  e compartilhada entre instâncias. Alterá-la invalida cookies existentes.
- `NODE_ENV=production`: ativa cookies exclusivamente HTTPS e confiança
  em um proxy à frente do aplicativo, conforme a topologia atual do Render.
- Health Check Path: `/healthz`, **após publicar esta etapa**.

`GET /healthz` executa `SELECT 1` sem sessão, sem ler usuários e sem criar
cookies. Responde 200 com `{"status":"ok"}` ou 503 com
`{"status":"indisponivel"}`, sem detalhes internos. A resposta não pode
ser armazenada em cache. O prazo HTTP é de dois segundos; o pool limita
conexão e consulta a três segundos. O health check confirma conexão, não
substitui o comando completo de inspeção do ambiente e da estrutura.

Referência: [health checks do Render](https://render.com/docs/health-checks).

## Atualização de banco existente

Execute somente as migrações pendentes em `database/migrations`, em ordem:
008, 009, 010, 012, 013, 014 e 015. Se a base já estava atualizada até a
etapa 14, a única migração posterior é `015_agendamento_precos.sql`.
As etapas 16–28 não exigem uma migração manual nova. O store de sessões
cria `sessoes_site` no primeiro uso se ela não existir e houver permissão.
Não é necessário reaplicar todo o `schema.sql` em uma base existente.

## Evidências de 17/11/2026

- Inspeção somente de leitura pela conexão local: colunas esperadas presentes,
  tabela de sessões existente e permissões de sessões verificadas.
- Indicadores locais: banco e chave configurados, chave com tamanho mínimo;
  `NODE_ENV` não definido no arquivo local. Não foi exibido nenhum segredo.
- Site público: `/login` respondeu 200; `/css/estilo.css`, 200;
  `/catalogo`, 302 para `/login`. CSP e `nosniff` presentes nas respostas
  verificadas. A primeira consulta ao login expirou em 20 segundos; nova
  tentativa respondeu normalmente. Não foi determinada a causa do atraso.
- Antes do envio desta etapa, `/healthz` respondeu 404, como esperado para
  uma versão sem a nova rota.
- Nenhuma migração, cadastro, alteração de usuário ou configuração do
  painel do Render foi executada durante essas verificações.

Ainda é necessário confirmar no Render: variáveis efetivas, commit publicado,
Health Check Path e o fluxo autenticado após o deploy. Os testes integrados
locais usam PostgreSQL temporário; não demonstram o login real em produção.

Atualização da etapa 28: o fluxo autenticado foi validado no deploy com uma
conta temporária, removida ao final, e a mesma base foi confirmada. `/healthz`
respondeu 200 e o login emitiu cookie HTTPS protegido. As configurações do
painel e o SHA publicado continuam sem inspeção direta. Consulte o
[relatório final](validacao-final.md) para as evidências atualizadas.
