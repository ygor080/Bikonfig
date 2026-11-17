# Qualidade do catálogo — etapa 26

Administradores acessam `/admin/qualidade` pelo link na revisão de produtos.
O painel mostra contagens gerais e analisa até 500 registros, priorizando
falta de categoria e revisão pendente. Cada registro pode ser aberto em
`/admin/revisao/:id`, inclusive se já estiver aprovado.

## Verificações

- Categoria ausente, especificações vazias e preço ausente/inválido.
- Campos das regras de compatibilidade cadastradas que estão ausentes ou
  não são reconhecidos pelo normalizador usado no site. São indicações para
  conferir na fonte, não especificações inferidas nem uma certificação técnica.
- Variantes sem detalhes de identificação e vínculos de duplicidade existentes.
- Identidades de oferta repetidas na amostra. O agrupamento considera loja,
  URL canônica, ID da variante, SKU, título e opções; tamanhos e variantes
  diferentes não são unidos por compartilhar uma URL. Mesmo identidades
  repetidas exigem conferência manual. Nenhum registro é mesclado ou excluído.

As contagens gerais vêm de todo o banco, mas os detalhes e possíveis repetições
cobrem somente a amostra. Ausência de pendência não garante qualidade integral.

## Revisão e preservação dos dados

Salvar uma revisão exige categoria existente e um produto que não esteja
vinculado como duplicata. Especificações aceitam uma chave por linha e
valores JSON (incluindo listas e booleanos) ou texto simples. Linhas sem
separador, chaves repetidas/inválidas e JSON incompleto impedem salvar;
o formulário não descarta silenciosamente esses trechos. Campo inteiro
vazio continua permitindo a limpeza intencional das especificações.

Produtos sem categoria deixam de ser oferecidos no catálogo público do site
e da API até serem classificados. Rejeitar um produto agora apenas o desativa;
montagens, itens e histórico de preços permanecem no banco. A reabertura da
montagem sinaliza a peça como indisponível. Salvar revisão não reativa uma
oferta desativada automaticamente.

## Diagnóstico de leitura em 17/11/2026

Na conexão configurada localmente, os 460 registros couberam na amostra:

| Verificação | Registros |
|---|---:|
| Com alguma pendência nas verificações | 96 |
| Sem categoria | 3 |
| Especificações a conferir pelas regras cadastradas | 66 |
| Sem especificações técnicas | 36 |
| Preço inválido ou ausente | 2 |
| Já vinculados como duplicata | 0 |

Um produto pode ter mais de uma pendência; as linhas não devem ser somadas.
Não foram encontrados candidatos repetidos por essa identidade na amostra.
O diagnóstico não altera dados. Não foram preenchidas especificações sem
evidência, reclassificados produtos no banco real ou excluídos registros.
Os 96 registros sinalizados seguem disponíveis para conferência manual.

## Validação

`npm --prefix site test` cobre variantes distintas, alertas técnicos, acesso
administrativo, revisão de aprovados, categoria inexistente, texto inválido,
bloqueio de duplicatas e preservação de montagem/histórico após rejeição no
PostgreSQL temporário. Os testes Python existentes também devem passar.
Não exige migração, dependência ou variável de ambiente nova.
