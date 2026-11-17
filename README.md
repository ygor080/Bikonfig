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
`configuracoes` e `configuracao_itens`. Para bancos novos, use o schema
completo. Para bases existentes, as alterações incrementais ficam em
`database/migrations/`; aplique as migrações correspondentes antes de
publicar: `008_tipo_montagem.sql` (etapa 8) e
`009_fabricante_produto.sql` (etapa 9) e
`010_disponibilidade_estoque.sql` (etapa 10) e
`012_identidade_variantes.sql` (etapa 12) e
`013_contexto_tecnico_coleta.sql` (etapa 13) e
`014_preservar_revisao_manual.sql` (etapa 14) e
`015_agendamento_precos.sql` (etapa 15). A etapa 11 não exige migração.

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

Produtos sem preço válido ficam fora do catálogo e da seleção. Uma imagem
ausente ou que falha ao carregar é substituída por um ícone local, sem
impedir a seleção de uma oferta com preço e disponibilidade elegíveis.
Os filtros estão em `site/models/produtoModel.js` e nos critérios
compartilhados de publicação e seleção. A revisão administrativa continua
permitindo inspecionar os produtos pendentes fora desses filtros.

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

### Coleta agendada e data dos preços (etapa 15)

A rotina diária está em `.github/workflows/coleta-precos.yml`. O horário
é **09:17 UTC (06:17 em Brasília, UTC-3)**, com acionamento manual em
Actions. O GitHub pode atrasar execuções agendadas; não se promete preço
em tempo real. O site no Render não precisa ficar acordado para o job.

Para ativar, nesta ordem:

1. Aplique `database/migrations/015_agendamento_precos.sql` no Supabase.
2. Em Settings → Secrets and variables → Actions, adicione os **secrets**
   `DATABASE_URL` (mesmo banco do site) e `OPENAI_API_KEY`.
3. Nas **variables**, defina `COLETA_URLS_JSON` como uma lista JSON de
   URLs autorizadas cujos domínios estejam em `api/sites_config.py`.
   Exemplo de formato: `["https://loja-configurada/colecao"]`.
4. Execute manualmente **Coleta diária de preços → Run workflow** e
   confira o resultado em Actions e na tabela `scrape_runs`.
5. Só então defina a variable `COLETA_AUTOMATICA_ENABLED` como `true`.
   Para desativar, remova essa variable ou altere para `false`.

O workflow não roda em push e o agendamento fica inativo por padrão.
Não inclua chaves no código, JSON de URLs ou chat. Cada execução pode
consumir a API de categorização já usada pelo projeto.

O comando `python api/run_scheduled_scrape.py` executa uma rodada finita.
Há limite de 15 minutos por fonte e 45 minutos para a rodada, continuidade
entre falhas de fontes, registro de início/fim/status e bloqueio de
execuções simultâneas. A lease de 75 minutos no banco expira mesmo após
interrupção abrupta e funciona com pool de transações do Supabase. O
workflow tem também `concurrency` e limite de uma hora. Não habilite dois
agendadores para a mesma rotina.

`price_checked_at` registra a consulta de preço válido, inclusive se o
valor não mudou. Não é atualizado por revisão administrativa e não é
preenchido retroativamente com `updated_at`. Preço inválido fica sem
consulta confirmada. Catálogo, cartões e resumo exibem a data por oferta,
ou informam que ela é desconhecida. O resumo usa preço e data devolvidos
pelo servidor, preservando as posições e a proteção contra respostas antigas.
Antes da migração, a leitura da data retorna desconhecida, sem impedir
a abertura do catálogo. A coleta exige a migração antes de executar.

Nenhum secret, agendamento ativo ou banco de produção foi configurado
automaticamente no desenvolvimento desta etapa.

### Preservação da revisão administrativa (etapa 14)

Aplique `database/migrations/014_preservar_revisao_manual.sql` antes de
publicar esta versão do site e da coleta. Uma aprovação registra data,
administrador e quais campos foram revisados: categoria, especificações
e fabricante. Somente os campos efetivamente enviados recebem proteção.
Uma edição posterior por administrador continua permitida.

A recoleta protege esses campos no próprio `UPDATE`, sem depender de uma
cópia anterior lida em Python. Assim, uma aprovação concorrente também é
respeitada. Limpar o fabricante ou deixar as especificações vazias são
correções válidas e ficam protegidas contra preenchimento automático.
Valores booleanos, numéricos, listas e objetos das specs preservam o tipo
ao passar pelo formulário; texto sem formato JSON continua aceito.

Preço, estoque, imagem, nome da oferta, metadados de variante e histórico
continuam sendo atualizados. Uma revisão completa não perde a aprovação
apenas por baixa confiança da IA ou por specs que a nova extração deixou
de trazer. Conflitos de identidade/duplicidade ainda podem devolver o
item à fila, mantendo os valores corrigidos. A interface distingue a
categoria revisada da confiança da última coleta.

**Revisões anteriores à migração não são inferidas por `needs_review=false`**,
pois esse estado também pode vir da IA. Para proteger correções antigas,
encaminhe apenas os produtos conhecidos à revisão e confirme-os novamente
com esta versão. Não há marcação automática de todos os produtos aprovados
como revisados por uma pessoa. O banco de produção não foi modificado no
desenvolvimento desta etapa.

### Descrições, atributos e evidências (etapa 13)

Antes de usar esta versão da coleta, aplique
`database/migrations/013_contexto_tecnico_coleta.sql`. Ela acrescenta a
`raw_scrapes` os campos `raw_description`, `raw_attributes` e
`raw_variant_options`, para registrar o contexto usado na categorização.
Não foi executada no banco de produção durante o desenvolvimento.

No Shopify, a descrição vem de `body_html`, com remoção de marcação,
scripts e estilos. As opções da variante selecionada acompanham cada
registro. `technical_attribute_fields` pode mapear chaves técnicas a
campos explícitos do JSON da fonte; não se deduzem medidas de tags genéricas.

Em HTML, configure `description` e `technical_attributes` no perfil. A
configuração opcional `detail_page` usa esses mesmos seletores na página
do produto, com intervalo entre requisições e cache por URL durante a
coleta. Somente a mesma origem (protocolo, domínio e porta) é consultada.
Falhas de detalhe e dados truncados encaminham o produto à revisão.

O modelo recebe nome, descrição saneada, atributos e opções em JSON.
Cada especificação retornada precisa ter uma evidência literal da fonte,
incluindo o valor extraído. Valores sem evidência, resultados inválidos
ou divergências em relação a atributos/opções explícitos são removidos
da extração e reduzem a confiança para revisão. A validação textual não
certifica a correção técnica; precisão real depende de avaliação com
produtos rotulados. Especificações antigas ausentes na nova extração
também impedem aprovação automática, sem apagá-las silenciosamente.

### Identidade, duplicidades e variantes (etapa 12)

Antes de publicar site e API, aplique a migração transacional
`database/migrations/012_identidade_variantes.sql` e execute uma nova
coleta. Não houve alteração do banco de produção durante o desenvolvimento.

Cada variante Shopify possui um registro próprio, com identificadores
externos de produto e variante, SKU, título e opções, preço, estoque e
imagem correspondente. O link inclui `?variant=<id>` para abrir a mesma
opção na loja, conforme o [padrão Shopify](https://shopify.dev/docs/storefronts/themes/product-merchandising/variants).
As opções aparecem como ofertas distintas no catálogo/configurador.
O nome persistido inclui a variação para identificá-la também no resumo,
nas configurações salvas e no PDF. A busca aceita SKU. A coleta ignora
variantes sem ID estável, sem inventar uma identidade pelo preço ou título.

Em HTML, é possível configurar seletores opcionais `external_product_id`,
`external_variant_id`, `sku`, `variant_title` e `variant_options` (mapa de
nomes de opções para seletores). O identificador de variante configurado
precisa ser estável e único por loja; rótulos como "M" não servem como ID.
Sem identificador explícito, a identidade usa a URL, mantendo parâmetros
funcionais como tamanho, cor e variante. A coleta de páginas que dependem
de seleção interativa requer configuração própria da fonte.

Normalizam-se protocolo/domínio e removem-se fragmentos e parâmetros
conhecidos de rastreamento (`utm_*`, `gclid`, `fbclid`, `msclkid`, `dclid`).
Não se remove a consulta inteira, não se altera caixa do caminho e não
se juntam ofertas apenas por nome, SKU ou fabricante iguais. A unicidade
é por fonte+ID de variante; sem variante explícita, por fonte+URL.
Variantes identificadas podem compartilhar uma página sem colidir na base.

Listagens repetidas são deduplicadas antes da categorização. Valores
contraditórios para a mesma identidade entram em revisão. Na recoleta,
URLs antigas são reconciliadas por fonte; duplicatas recebem `duplicate_of`
e ficam fora da seleção, sem exclusão dos registros, montagens ou histórico.
Ofertas antigas sem variante que passaram a ter opções explícitas vão
para revisão, sem atribuir uma opção arbitrária a uma montagem salva.
O controle de revisão não resolve conflitos de identidade automaticamente.

### Imagens externas com falha (etapa 11)

Catálogo, cartões e resumo do configurador e revisão administrativa usam
um ícone local da categoria se a foto externa falhar. O modelo fornece
`imagemFallback` com o ícone apropriado; imagens ausentes já utilizam
esse ícone desde a primeira renderização. Categorias desconhecidas usam
o ícone padrão.

O tratamento compartilhado em `site/public/js/app.js` captura erros de
imagens marcadas com `data-imagem-fallback`, inclusive imagens inseridas
dinamicamente. Também verifica falhas ocorridas antes do carregamento do
script. Uma imagem válida é preservada. Há uma única tentativa de
substituição por elemento; se o ícone local também falhar, permanece um
texto alternativo sem novas tentativas em ciclo. Não há migração de banco
para esta etapa.

### Disponibilidade de estoque (etapa 10)

Antes de publicar esta versão, aplique
`database/migrations/010_disponibilidade_estoque.sql` no banco compartilhado.
Ela adiciona `products.in_stock` (booleano opcional) e `stock_checked_at`.
Produtos antigos ficam com estoque desconhecido. Não se converte
`is_active` em evidência de estoque: esse campo continua controlando a
presença administrativa do produto na aplicação.

O catálogo exibe ofertas ativas, aprovadas e com preço válido, inclusive
as sem estoque, que aparecem com a seleção desabilitada. Consultas de
seleção, orçamento, PDF, salvamento e totais de montagens excluem estoque
explicitamente falso. Estoque desconhecido permite planejamento, com
aviso para confirmar na loja. Montagens salvas mantêm o tratamento de
itens indisponíveis da etapa 3. A interface usa os rótulos "Em estoque na
última coleta", "Sem estoque na última coleta" e "Disponibilidade
desconhecida", e mostra a data da consulta quando registrada.

No Shopify, estoque e preço vêm da mesma variante. A partir da etapa 12,
todas as variantes identificadas são coletadas individualmente, em vez
de selecionar uma representante do produto. Apenas booleanos são aceitos
como confirmação de estoque.

Em HTML, o perfil pode declarar `availability` com seletores `in_stock`
e `out_of_stock`. Ausência ou presença simultânea dos marcadores resulta
em estoque desconhecido. Cada coleta concluída atualiza a data da
consulta e substitui o estado anterior, inclusive por desconhecido se
a evidência não estiver mais disponível. A coleta não altera `is_active`.

### Fabricante e loja

`products.manufacturer` armazena o fabricante do produto; `sources.name`
continua sendo a loja que publicou a oferta. O site devolve os campos
`fabricante` e `loja`, apresenta ambos no catálogo e configurador e permite
pesquisar por nome, fabricante ou loja. Fabricante ausente aparece como
"Não informado"; não se copia o nome da loja nem se deduz pelo título.
A revisão administrativa permite preencher, corrigir ou limpar o fabricante.

**Antes de publicar a etapa 9**, aplique
`database/migrations/009_fabricante_produto.sql` no banco compartilhado.
A migração apenas adiciona a coluna opcional; produtos existentes ficam
com fabricante desconhecido até coleta explícita ou revisão manual.

Na coleta Shopify, configure `manufacturer_field` no perfil apenas após
verificar qual campo representa o fabricante naquela fonte. Não há
mapeamento automático de `vendor`, pois ele também pode ser a própria
loja. Em fontes HTML, o seletor opcional `manufacturer` deve apontar para
a identificação explícita do fabricante. Recoletas sem esse dado preservam
o fabricante já registrado. A API Python mantém `source_name` e acrescenta
`manufacturer` como campos independentes.

### Componentes essenciais e tipo de montagem

O resumo inclui uma lista orientativa de componentes principais calculada
no servidor com os produtos disponíveis. O seletor permite `com-marchas`
(sem suspensão traseira), `single-speed` e `suspensao-total` (com marchas).
O perfil é enviado no orçamento e salvo em `configuracoes.tipo_montagem`.
Montagens anteriores recebem o padrão `com-marchas`.

**Antes de publicar a etapa 8 em uma base existente**, aplique
`database/migrations/008_tipo_montagem.sql`. A migração adiciona uma coluna
com valor padrão, sem apagar configurações. Ela não foi executada no
banco de produção durante o desenvolvimento.

As regras de inventário estão em `site/models/completudeMontagem.js`.
Elas consideram as duas posições de rodas/pneus/freios/fixações, rodas
completas ou aro+cubo+raios avulsos, transmissão, cockpit e estrutura.
Múltiplas coroas exigem câmbio e comando dianteiros; quando o número
de coroas não está informado, aparece uma pendência de confirmação.
O perfil de suspensão total exige também amortecedor traseiro.

Não se deduz o conteúdo de um kit pelo nome do anúncio. Campos explícitos
em `specs` podem indicar `componentes_inclusos` (lista de slugs),
`vendido_em_par: true`, `inclui_disco: true` e
`tipo_transmissao: "single-speed"`. O uso de tubeless só é reconhecido
com `tubeless: true` e permanece pendente de confirmação do sistema;
não basta o pneu ser anunciado como tubeless-ready. Uma roda completa
não preenche automaticamente pneu, câmara, disco ou fixação da roda.

Montagens incompletas podem ser salvas como trabalho em andamento.
Ter todos os componentes principais selecionados não atesta quantidades,
compatibilidade, itens pequenos ou segurança da montagem. Os detalhes
de cada sistema devem seguir a documentação do fabricante, por exemplo
[SHIMANO: instalação de pneus tubeless](https://si.shimano.com/en/pdfs/dm/WH0007/DM-WH0007-05-ENG.pdf).

### Revisão das regras de compatibilidade

O orçamento recebe `itens: [{ id, posicao }]`, mantendo também o suporte
ao campo legado `ids`. Produtos e preços são sempre consultados no banco.
As aplicações dianteira e traseira do mesmo produto são preservadas na
avaliação. Categorias que já indicam o lado têm precedência sobre a posição
enviada. Em comparações de aro, eixo e freio, lados diferentes não são
comparados; quando uma categoria genérica exige posição e ela não foi
informada, o relatório indica dados insuficientes.

Regras para `rodas`, `quadro` e `freios` não se estendem automaticamente
a todos os acessórios e componentes filhos. As rodas completas são
comparadas com a estrutura correspondente: dianteira com garfo, traseira
com quadro. Cada par de aplicações e atributo é comparado uma única vez,
mesmo com regras sobrepostas. Divergências informam peças, posições,
atributo e valores; o relatório também inclui `divergencias` estruturadas.

O schema para novas bases usa `numero_coroas` entre câmbio dianteiro e
pedivela, e `padrao_freehub` entre cubo traseiro e cassete. A antiga regra
de igualdade de velocidades entre coroa avulsa e câmbio dianteiro foi
removida. O motor aplica essas mesmas correções às regras antigas lidas
do banco, sem exigir alteração imediata da base existente. A ausência
dos novos atributos é sinalizada; os valores não são deduzidos de
`velocidades`. Nenhuma base de produção foi alterada nesta revisão.

Referência de domínio para o encaixe cubo/cassete:
[SHIMANO: FREEHUB and cassette spline compatibility](https://productinfo.shimano.com/en/compatibility/C-731).
As verificações implementadas continuam parciais e não substituem as
tabelas de compatibilidade dos fabricantes.

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
