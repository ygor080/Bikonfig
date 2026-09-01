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
