# Bikonfig (projeto único)

- **`api/`**: scraper Python + API FastAPI. Coleta produtos de lojas
  parceiras, categoriza com IA e grava no Postgres com histórico de preço.
- **`site/`**: site Node + Express + EJS. Login/cadastro, catálogo e o
  configurador de bike (monta a bicicleta peça por peça).
- **`database/schema.sql`**: arquivo único do Postgres, compartilhado pelos
  dois lados (é a mesma base de dados — a api só escreve
  produtos/categorias, o site só escreve/lê usuários e lê
  produtos/categorias).

```
Bikonfig/
├── api/         (Python: scraper.py, ai_categorizer.py, db.py, sites_config.py)
├── site/        (Node: server.js, controllers/, models/, routes/, views/, public/ = site do usuário)
├── database/
│   └── schema.sql
└── package.json (orquestra os dois com `npm run dev`)
```

## Setup

### 1. Banco (Supabase)

O projeto usa um único banco Postgres (Supabase) para tudo. Num banco novo
e vazio, rode:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

Rodar de novo é seguro — todo `INSERT` usa `ON CONFLICT DO NOTHING` e
nenhuma tabela existente é recriada (`CREATE TABLE IF NOT EXISTS`).

### 2. Variáveis de ambiente

```bash
cp api/.env.example api/.env
cp site/.env.example site/.env
```

**Preencha os dois `.env` com a MESMA `DATABASE_URL`** (o mesmo projeto
Supabase) — os dois lados leem/escrevem no mesmo schema, então não faz
sentido apontar para bancos diferentes.

### 3. Dependências

```bash
pip install -r api/requirements.txt
npm --prefix site install
npm --prefix api install
npm install
```

### 4. Rodar

```bash
npm run dev
# site:  http://localhost:3000  (site/server.js)
# API:   http://localhost:8000  (api, uvicorn scraper:app)
```

O scraper em si (`python api/scraper.py --url "..."`) você roda à parte,
quando quiser coletar produtos de uma loja parceira.

---

## Estrutura do banco

`database/schema.sql` é um único arquivo que cria todas as tabelas do zero:
`categories` (com hierarquia via `parent_id`), `sources`, `raw_scrapes`,
`products`, `price_history`, `compatibility_rules`, `usuarios`,
`configuracoes` e `configuracao_itens`. Não há mais arquivos de migração
separados — o schema já nasce na versão final, pronta para rodar direto
num banco Supabase resetado.

A coluna `is_admin` (controla o acesso à tela de revisão de produtos) só é
alterada com `UPDATE` direto no banco — não existe nenhum jeito de virar
admin pela própria aplicação, de propósito, já que o cadastro do site é
público.

## Configurações salvas ("Minhas configs")

Um usuário logado pode salvar a seleção de peças que montou no
configurador (`POST /catalogo/api/configuracoes`) e revê-las depois em
`/catalogo/minhas-configuracoes`, com a opção de reabrir cada uma no
configurador (`?config=<id>`) ou excluir. Isso fica em duas tabelas:
`configuracoes` (nome + dono) e `configuracao_itens` (as peças daquela
montagem, uma linha por peça). A lógica vive em
`site/models/configuracaoModel.js`.

## Produtos sem preço ou imagem

Quando a página original de um produto sai do ar, o scraper pode acabar
salvando o produto sem `current_price`/`image_url`. Esses produtos ficam
ocultos e impossíveis de selecionar em todo lugar visível ao usuário
(catálogo, configurador, orçamento e PDF) — o filtro está em
`site/models/produtoModel.js`. A tela de revisão do admin
(`/admin/revisao`) não usa esse filtro, então é lá que dá pra encontrar
e excluir esses produtos de vez.

## Usuários

A tabela `usuarios` (login/cadastro) é gerenciada pelo site
(`site/models/usuarioModel.js`), mas vive no mesmo `database/schema.sql`
compartilhado — a api Python não lê nem escreve nela.

## Compatibilidade entre peças

A tabela `compatibility_rules` define pares de categoria + uma spec que
precisa bater entre elas (ex: câmbio traseiro x cassete precisam ter o
mesmo número de velocidades). No configurador, cada par de peças
selecionadas é checado contra essas regras usando o `specs` (JSONB) de
cada produto — se os valores divergirem, aparece um aviso explicando o
motivo. Ver `api/README.md` para detalhes e exemplos de como adicionar
novas regras.

## Front-end

### Padronização das especificações na comparação

O site normaliza os valores em `site/models/normalizarSpec.js`, sem alterar
as especificações originais no banco. As regras e a verificação adicional
de aro utilizam a mesma função:

- `aro`: aceita valores numéricos, prefixo `aro`, vírgula decimal e
  indicação de polegadas (ex.: `ARO 27,5` e `27.5 polegadas`). Não deduz
  equivalências entre nomenclaturas como `700c` e `29`.
- `velocidades`: aceita número inteiro e sufixos como `v`, `velocidades`
  e `speed`. Relações e listas como `2x11` e `10/11v` exigem revisão.
- `diametro_eixo`: padroniza espaços, separador `x`/`×`, milímetros e
  centímetros. Preserva espaçamento, diâmetro e marcadores como `boost`,
  `superboost`, `qr` e `thru-axle`. Não deduz medidas ou unidades ausentes.
- `padrao_freio`: reconhece grafias como `freio a disco`, `disc brake`,
  `V brake` e `V-Brake`, preservando qualificadores adicionais.

Valores vazios, tipos inválidos ou medidas não reconhecidas nos campos
numéricos geram dados insuficientes. A normalização não amplia as regras
técnicas nem certifica a compatibilidade completa da montagem.

`site/public/js/app.js` expõe `window.Bikonfig` com `toast()`,
`confirmDialog()` e `promptDialog()` — usados no lugar de
`alert()`/`confirm()`/`prompt()` nativos, pra manter o visual consistente
com o resto do site. Um `<form>` que precisa de confirmação antes de
enviar só precisa da classe `js-form-confirmar` mais os atributos
`data-confirmar-titulo`/`data-confirmar-mensagem` (ver exemplo em
`views/minhas-configuracoes.ejs` ou `views/admin-revisao.ejs`).

## ⚠️ Segurança

Nenhum `.env` real é incluído neste projeto — só os `.env.example`. Se
alguma chave (ex: OpenAI) tiver sido exposta em algum momento, revogue-a e
gere uma nova antes de reusar o projeto.
