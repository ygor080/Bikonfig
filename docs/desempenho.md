# Desempenho do catálogo — etapa 27

O catálogo web entrega 24 ofertas por página em vez de renderizar toda a
base. A mesma consulta calcula o total e devolve somente os registros da
página, mantendo os filtros de publicação e a busca por nome, fabricante,
loja ou SKU. A ordenação usa prioridade, nome e ID para desempatar.

`?pagina=2&busca=termo` preserva a busca nos links Anterior/Próxima. Nova
busca começa na primeira página. Parâmetros inválidos retornam 400; páginas
além da última redirecionam para a última página válida. O total continua
correto mesmo quando a página consultada está vazia. O tamanho é fixo no
servidor e não pode ser aumentado por parâmetros do cliente.

No catálogo e na grade do configurador, as primeiras três imagens usam
carregamento normal; as seguintes usam `loading="lazy"`. Todas indicam
dimensões e `decoding="async"`, mantendo os ícones de fallback. O navegador
decide quando carregar imagens próximas à área visível.

## Medições de leitura em 17/11/2026

Na conexão local configurada, com 455 ofertas públicas:

| Medida | Antes: catálogo completo | Depois: primeira página |
|---|---:|---:|
| Ofertas transferidas para renderização | 455 | 24 |
| Dados JSON serializados pelo modelo | 337.358 bytes | 18.200 bytes |
| Três leituras com conexão aberta | 880, 353, 352 ms | 198, 250, 273 ms |
| Mediana dessas três leituras | 353 ms | 250 ms |

A primeira página usa aproximadamente 94,6% menos dados nessa amostra.
Isso mede os dados do modelo, não o tamanho final do HTML, imagens ou tempo
de carregamento no dispositivo. Os tempos incluem rede, variam e não são
uma garantia de desempenho em produção.

`EXPLAIN (ANALYZE, BUFFERS)` da consulta paginada nessa base indicou 0,673 ms
de planejamento e 8,788 ms de execução no banco. Não foi acrescentado índice
ou cache de preços sem evidência de necessidade. A contagem ainda percorre
o conjunto filtrado; para bases muito maiores, reavalie plano, contagem,
busca por substring e paginação por cursor. Navegar entre páginas enquanto
as ofertas mudam também pode alterar os resultados.

## Reproduzir

```bash
npm --prefix site run benchmark:catalog
npm --prefix site test
```

O benchmark lê a conexão efetiva do ambiente/`site/.env`, faz três pares
de consultas e imprime somente tempos, quantidades e tamanhos. Não modifica
dados, imprime produtos ou revela segredos. A suíte integrada verifica 53
ofertas em três páginas, sem duplicação, preservação da busca, imagens,
página inexistente e parâmetros inválidos em PostgreSQL temporário.

O endpoint Python existente e a API de peças por categoria mantêm o contrato
anterior. Esta etapa não aplica migração nem exige nova configuração.
