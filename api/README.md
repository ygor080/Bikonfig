# Bikonfig — Scraper + API + Montagem Compatível

Pipeline: coleta produtos de lojas parceiras autorizadas, categoriza via IA,
persiste no PostgreSQL com histórico de preço e serve uma API consumida pelo
site (`site/`), que deixa montar um conjunto de peças avisando se
alguma delas não bate com as outras.

## Arquitetura

```
scraper.py          -> scraper (CLI) + API (FastAPI) no mesmo arquivo
sites_config.py      -> perfis de seletores CSS por loja parceira
ai_categorizer.py    -> categorização (com subcategorias), specs e opcional/essencial via IA
db.py                -> camada de acesso ao PostgreSQL (produtos, categorias, regras)
```

`scraper.py` reúne scraper e API de propósito: os dois importam os mesmos
módulos (`db`, `sites_config`, `ai_categorizer`) e o projeto é pequeno o
bastante pra isso não virar um arquivo gigante de manter.

## Setup

### 1. Banco de dados

```bash
psql "$DATABASE_URL" -f ../database/schema.sql
```

O schema vive em `database/schema.sql`, na raiz do projeto — é o mesmo
arquivo usado pelo front-end (Node/Express). Isso garante que os dois lados
enxergam exatamente as mesmas tabelas/categorias.

### 2. Dependências Python

```bash
pip install -r requirements.txt
```

### 3. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha no `.env`:

```bash
DATABASE_URL="postgresql://usuario:senha@localhost:5432/bikonfig"
OPENAI_API_KEY="sua-chave-aqui"
```

### 4. Rodar

```bash
# coleta produtos e salva no banco
python scraper.py --url "https://lojaparceira.com.br/categoria/mtb"

# sobe a API (o front-end consome ela em localhost:8000)
uvicorn scraper:app --reload --port 8000
```

Ou, a partir da raiz do projeto:

```bash
npm run dev   # sobe front (:3000) + API (:8000) juntos
```

## Categorias e subcategorias

Câmbio dianteiro e traseiro são categorias "grupo": cada um tem 3
subcategorias (desviador, trocador/manete, cabo e capa). A IA prioriza
sempre a subcategoria mais específica; só cai na categoria "grupo" quando
o texto do produto não deixa claro qual peça exata é (ex: "kit câmbio
traseiro completo"). Cassete e corrente são categorias próprias — não
ficam mais misturadas em "câmbio traseiro" só porque o nome do produto
menciona "traseiro".

O front-end busca a árvore de categorias em `GET /api/categories` e
mostra um botão de expandir (›) ao lado de qualquer categoria que tenha
subcategorias.

O mesmo padrão foi estendido para **freios, rodas, pneus, guidão, selim,
pedivela e quadro**, que agora também têm subcategorias (ex:
`freios-dianteiro`/`freios-traseiro`, `rodas-dianteira`/`rodas-traseira`,
`quadro-garfo`/`quadro-amortecedor`) — ver `database/schema.sql` e a
lista `CATEGORIAS_VALIDAS` em `ai_categorizer.py`.

### Peças avulsas de reposição/montagem

Além dos conjuntos principais, o schema tem categoria própria para peças
que o usuário compra separadas na hora de montar a bike:

- `direcao` — caixa de direção (headset), categoria de topo.
- `pedal` — categoria de topo.
- `rodas-camara-ar` / `rodas-cubo-dianteiro` / `rodas-cubo-traseiro` — sob `rodas`.
- `freios-disco` / `freios-pastilha` / `freios-cabo` / `freios-manete` — sob `freios`.
- `guidao-fita` — sob `guidao` (fita de guidão, road).
- `pedivela-coroa` — sob `pedivela`.
- `paralama`, `bagageiro`, `descanso`, `iluminacao`, `fixacao-roda` — categorias de topo próprias, cada uma com subcategorias dianteiro/traseiro onde faz sentido.

## Usuários

A tabela `usuarios` (login/cadastro) é gerenciada pelo front-end
(`site/models/usuarioModel.js`), mas vive no mesmo `database/schema.sql`
compartilhado — a api Python não lê nem escreve nela. O acesso admin
(`is_admin`) só é concedido com um `UPDATE` direto no banco — não existe
endpoint na aplicação pra isso, de propósito (evita escalonamento de
privilégio via cadastro público).

## Peça opcional vs essencial

A IA também classifica `opcional: true/false` — acessórios (bolsa de
quadro, suporte de ciclocomputador, buzina, luzes) entram como opcionais;
componentes estruturais (quadro, rodas, câmbio, cassete, corrente, freios,
selim, pneus, pedivela, guidão) como essenciais. Isso vira a coluna
`is_optional` em `products` e aparece como uma tag "opcional" no card.

## Compatibilidade entre peças

A tabela `compatibility_rules` define pares de categoria + uma spec que
precisa bater entre elas (ex: câmbio traseiro x cassete precisam ter o
mesmo número de velocidades). No front-end, ao adicionar peças à "sua
montagem", cada par de itens selecionados é checado contra essas regras
usando o `specs` (JSONB) de cada produto — se os valores da spec
divergirem, aparece um aviso explicando o motivo. Se um dos dois produtos
não tiver a spec informada (a IA só extrai o que está explícito no texto),
a regra é simplesmente ignorada para aquele par — o sistema não afirma
incompatibilidade sem ter como confirmar.

Pra adicionar mais regras, é só inserir linhas em `compatibility_rules`:

```sql
INSERT INTO compatibility_rules (category_a, category_b, spec_key, description)
VALUES ('cambio-dianteiro-desviador', 'pedivela', 'velocidades',
        'O câmbio dianteiro precisa ser compatível com o pedivela.');
```

## Adicionando uma loja parceira

Antes de rodar contra um site real:

1. **Confirme a autorização** da loja.
2. Abra a página de listagem de produtos no navegador, use o DevTools →
   Elements (não Network) para achar os seletores do card de produto.
3. Adicione uma entrada em `sites_config.py`:

```python
SITE_PROFILES = {
    "lojaparceira.com.br": {
        "display_name": "Loja Parceira",
        "product_card": "div.product-item",
        "name": ".product-item__title",
        "price": ".product-item__price",
        "image": ".product-item__img img",
        "link": "a.product-item__link",
        "requires_js": False,
    },
}
```

## Sobre a categorização por IA

Produtos com confiança da IA **abaixo de 0.7** (ajustável em
`ai_categorizer.py` → `CONFIDENCE_THRESHOLD`) entram automaticamente como
`needs_review = true` no banco.

```sql
SELECT name, ai_confidence, specs
FROM products
WHERE needs_review = true
ORDER BY ai_confidence ASC;
```

## O "vigia de preço"

Toda vez que o scraper roda e encontra um preço diferente do salvo, uma
linha nova é gravada em `price_history`:

```sql
SELECT p.name, ph1.price AS preco_atual, ph2.price AS preco_anterior
FROM products p
JOIN price_history ph1 ON ph1.product_id = p.id
JOIN price_history ph2 ON ph2.product_id = p.id
WHERE ph1.recorded_at = (SELECT MAX(recorded_at) FROM price_history WHERE product_id = p.id)
  AND ph2.recorded_at = (
      SELECT MAX(recorded_at) FROM price_history
      WHERE product_id = p.id AND recorded_at < ph1.recorded_at
  )
  AND ph1.price < ph2.price;
```

## Próximos passos sugeridos

- Rodar o scraper periodicamente (cron job ou `APScheduler`) por loja parceira.
- Criar um endpoint/admin simples para revisar produtos com `needs_review = true`.
- Adicionar retry/backoff em `fetch_html` para falhas de rede transitórias.
- Expandir `compatibility_rules` conforme forem aparecendo mais casos reais de incompatibilidade.

## Fabricante e loja (etapa 9)

Aplique `../database/migrations/009_fabricante_produto.sql` no banco
compartilhado antes de executar esta versão da coleta/API. O campo
`products.manufacturer` é opcional e independente de `sources.name`.
O endpoint `/api/products` devolve `manufacturer` e `source_name`.

Para Shopify, o perfil pode declarar `manufacturer_field: "vendor"`
**somente após verificar** que `vendor` identifica fabricantes naquela
loja. Sem mapeamento, o fabricante permanece desconhecido. Para HTML,
configure o seletor opcional `manufacturer`, por exemplo `.product-brand`.
Não se usa o título do anúncio ou nome da loja como substituto.

`upsert_product` aceita o argumento opcional `manufacturer`; valores
ausentes não apagam um fabricante existente. A revisão administrativa
do site permite corrigir ou limpar esse campo explicitamente.

Os testes isolados dessa coleta podem ser executados sem rede, IA ou
banco com `python -m unittest discover -s api/tests` a partir da raiz.

## Estoque em três estados (etapa 10)

Aplique `../database/migrations/010_disponibilidade_estoque.sql` antes da
publicação. A coleta grava `in_stock` como `true`, `false` ou `null`, e
registra `stock_checked_at`. `is_active` permanece independente. O endpoint
`/api/products` devolve os três campos; a data é serializada em ISO 8601.

Para HTML, configure marcadores explícitos no perfil, por exemplo:

```python
"availability": {
    "in_stock": ".stock.available",
    "out_of_stock": ".stock.sold-out",
},
```

Sem marcador, ou com marcadores contraditórios, o estoque fica desconhecido.
No Shopify, o booleano `available` da variante usada para o preço fornece
o estado. Valores ausentes, strings e números não confirmam estoque.
Uma nova coleta sem evidência substitui a informação anterior por `null`,
sem modificar a ativação administrativa do produto.

## Identidade e variantes (etapa 12)

Aplique `../database/migrations/012_identidade_variantes.sql` antes de
publicar e recolete as fontes. O coletor Shopify registra cada variante
com ID, SKU, título, opções, preço, estoque, imagem e link específicos.
Os campos são expostos por `/api/products`, que exclui duplicatas,
pendências de revisão e ofertas sem preço válido.

URLs são normalizadas em `product_identity.py`, preservando parâmetros
funcionais. Duplicidades da coleta são reduzidas antes das chamadas à IA;
conflitos são encaminhados à revisão. O banco usa unicidade parcial por
fonte+variante e, sem ID de variante, por fonte+URL. Há bloqueio transacional
por identidade durante a gravação. SKU e nome não são chaves de identidade.

`reconcile_product_urls` registra URLs canônicas e marca duplicatas antigas
com `duplicate_of`, sem apagar registros, itens de configurações ou histórico.
Identificadores explícitos de variantes distintas não são agrupados por URL.
Um produto antigo sem variante não é convertido na primeira opção encontrada.

Para HTML, seletores opcionais `sku`, `external_product_id`,
`external_variant_id`, `variant_title` e `variant_options` (mapa opção/seletor)
permitem coletar metadados explícitos. IDs de variante devem ser únicos por
fonte e estáveis. Sem esses seletores, preservam-se as opções já expressas
na URL; não se adivinham tamanho, cor ou IDs.

## Contexto técnico da categorização (etapa 13)

Aplique `../database/migrations/013_contexto_tecnico_coleta.sql` antes de
executar esta versão. Nome, descrição saneada, atributos técnicos e opções
de variante são enviados separadamente à categorização e registrados em
`raw_scrapes`. Há limite de texto e de atributos; truncamento exige revisão.

O Shopify usa `body_html` e as opções da variante. Para JSON adicional,
`technical_attribute_fields` mapeia chaves técnicas a campos explícitos da
fonte. Em fontes HTML, os seletores são opcionais e devem ser configurados:

```python
"description": ".product-description",
"technical_attributes": {"aro": ".spec-wheel-size"},
"detail_page": {
    "description": ".description-content",
    "technical_attributes": {"diametro_eixo": ".spec-axle"},
},
```

`detail_page` é opt-in, só acessa a mesma origem e usa cache por URL e
intervalo entre requisições. Falhas e conflitos entre card e detalhe não
interrompem todos os produtos; exigem revisão do item afetado.

A resposta da IA inclui `evidencias` por spec. O validador exige trecho
presente na fonte, valor sustentado pelo trecho, tipos válidos e ausência
de conflito com opções explícitas da variante. Specs reprovadas não entram
na nova extração. O conteúdo do anúncio é tratado como dado, sem seguir
instruções nele contidas. Os testes de categorização usam respostas
simuladas, sem consumo de API, e não medem acurácia real do modelo.

## Campos revisados manualmente (etapa 14)

Aplique `../database/migrations/014_preservar_revisao_manual.sql` antes
de publicar. `upsert_product` respeita `category_manually_reviewed`,
`specs_manually_reviewed` e `manufacturer_manually_reviewed` diretamente
no SQL. O site grava essas flags, `manual_reviewed_at` e
`manual_reviewed_by` quando o administrador confirma a revisão.

A coleta não remove proteções nem altera sua autoria/data. Valores vazios
revisados permanecem vazios. Preço, estoque, imagem e histórico continuam
atualizados. Se todos os três campos estiverem revisados, uma incerteza
da IA não desfaz a aprovação. `force_review=True`, usado para conflitos
de identidade, ainda reabre a fila sem modificar os campos protegidos.
As verificações de duplicidade da etapa 12 continuam válidas.

Flags começam falsas; aprovação antiga não comprova revisão humana.
Correções anteriores precisam ser confirmadas novamente após a migração.

## Atualização agendada de preços (etapa 15)

Antes de executar, aplique `../database/migrations/015_agendamento_precos.sql`.
O job lê `DATABASE_URL`, `OPENAI_API_KEY` e `COLETA_URLS_JSON`. Alvos devem
estar nos perfis de lojas autorizadas; rastreamento é normalizado e URLs
duplicadas são removidas. A configuração inteira é verificada antes de
iniciar os processos de coleta.

```bash
python api/run_scheduled_scrape.py
```

O GitHub Actions oferece execução manual e agendamento diário às 09:17 UTC.
Configure os dois secrets e a variable `COLETA_URLS_JSON`, teste uma
execução manual e depois habilite `COLETA_AUTOMATICA_ENABLED=true`.
O workflow fica desativado por padrão para execuções agendadas e não é
acionado em push. O arquivo está em `../.github/workflows/coleta-precos.yml`.

Cada fonte cria uma linha em `scrape_runs`: `running`, depois `success`
com quantidade processada, ou `error` com código de falha. Em falha parcial,
a contagem não é inventada; itens já gravados continuam na base. Retorno
do processo sem resultado ou coleta vazia não são considerados sucesso.
Há timeout de 900 segundos por fonte, orçamento de 2700 segundos e uma
lease em `scrape_job_locks` com expiração após 75 minutos. Encerramentos
abruptos podem deixar execuções em `running`, identificáveis pela data
de início; não são convertidas em sucesso. O registro não contém stderr
bruto de provedores. Para diagnóstico detalhado, execute a coleta da fonte
manualmente em ambiente controlado.

`products.price_checked_at` é atualizado só com preço finito e positivo.
Nova consulta sem mudança de preço renova a data, sem criar histórico
duplicado. Valores inválidos não recebem data confirmada. A API expõe
`price_checked_at`, e o site apresenta a consulta de cada oferta. Esse
campo é independente de `updated_at` e `stock_checked_at`.

Referências: [GitHub Actions: schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
e [controle de concorrência](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).
