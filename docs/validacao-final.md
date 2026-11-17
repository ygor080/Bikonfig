# Validação final — etapa 28

Verificações realizadas em 17/11/2026. Este relatório separa os resultados
locais, o que foi observado no deploy e as pendências operacionais.

## Resultado automatizado local

- 147 testes Node aprovados: autenticação, sessões, CSRF, autorização,
  catálogo/paginação, orçamento, compatibilidade, disponibilidade, montagens,
  PDF, revisão, qualidade, coletas, rascunhos, teclado e publicação.
- 47 testes Python aprovados: identidade de produtos, contexto técnico,
  especificações, estoque, revisão manual e operação do coletor.
- Diagnóstico do banco configurado localmente aprovado, em modo de leitura.
- Testes integrados usam PostgreSQL temporário. Testes locais não executam
  coleta com IA nem alteram produtos do banco publicado.

## Verificação pública do site publicado

`npm --prefix site run check:published` executa somente GETs, sem login,
cadastro ou alteração de dados de negócio. Não carrega `.env`, não imprime
cookies, tokens ou corpos das páginas e retorna código 1 diante de falha.

| Rota | Resultado observado |
|---|---|
| `/healthz` | 200, banco disponível, sem cookie |
| `/login` | 200, token CSRF, cookie HttpOnly/SameSite=Lax/Secure, CSP e nosniff |
| `/css/estilo.css` | 200 |
| `/js/configurador.js` | 200 |
| `/catalogo` sem autenticação | 302 para `/login` |
| `/admin/qualidade` sem autenticação | 302 para `/login` |
| `/logout` por GET | 405, Allow: POST |

O comando aceita outra origem como argumento, exigindo HTTPS (HTTP somente
para localhost). Não confirma o SHA publicado nem a configuração do painel
do Render. Endpoints disponíveis não provam que o health check do painel
foi ativado.

## Fluxo autenticado no deploy

Foi usada uma conta temporária exclusiva, com e-mail de domínio reservado
`.invalid` e senha gerada somente em memória. O ID da conta foi encontrado
na conexão local, confirmando que esse teste e o deploy usavam a mesma base.

Passaram: cadastro, login, logout POST, catálogo, orçamento com uma oferta
real disponível, criação de montagem, edição do mesmo ID, reabertura,
exportação de PDF, exclusão da montagem e encerramento da sessão. Uma
conta comum recebeu 403 na administração e uma ação sem CSRF foi bloqueada.

Ao final, foram removidas somente a conta, as sessões e as montagens criadas
por esse teste. Nenhum produto, histórico de preços ou usuário existente
foi alterado. Não foi usado acesso administrativo real em produção.

## Celular, desktop e teclado

Catálogo e configurador autenticados foram abertos no Chrome com viewports
de 320, 390 e 1280 px. Houve inspeção das capturas e confirmação de ausência
de rolagem horizontal nas seis combinações. O catálogo exibiu até 24 cards.

Os testes de teclado cobrem foco nos diálogos, Tab/Shift+Tab, Escape,
cancelamento e categorias. Nesta etapa, o menu mobile fechado passou a ser
`inert`, evitando foco em links visualmente ocultos. Os textos da home e
do catálogo foram ajustados para não prometer garantia técnica, preços
sempre atuais ou visualização 3D. Essas alterações finais foram testadas
localmente; as capturas do deploy foram feitas antes do commit da etapa 28.

Não foi realizada certificação de acessibilidade, auditoria completa de
contraste, teste em aparelho físico, leitor de tela, Safari ou Firefox.

## Pendências que continuam abertas

1. Coleta: resolver a falha TLS observada na etapa 25, confirmar secrets e
   alvos no Actions, executar uma coleta completa e só então ativar a
   recorrência. Não houve coleta de gravação nesta validação.
2. Catálogo: conferir manualmente os 96 registros sinalizados na etapa 26;
   a contagem é uma fotografia daquele diagnóstico, não uma garantia atual.
3. Render: conferir SHA publicado, variáveis efetivas e Health Check Path
   no painel. Os cookies HTTPS funcionaram, mas o painel não foi inspecionado.
4. Uso real: validar os navegadores/dispositivos e tecnologias assistivas
   usados pelo público e revisar as especificações com fontes técnicas.

O encerramento do plano de implementação não elimina essas pendências.
Não é necessário executar uma migração nova para a etapa 28.

## Repetir as verificações

```bash
npm --prefix site ci
npm --prefix site test
python -B -X utf8 -m unittest discover -s api/tests
npm --prefix site run check:production -- --local
npm --prefix site run check:published
```

Os testes de CI usam dados temporários e não repetem o cadastro em produção.
Para validar manualmente o deploy, siga [o guia de uso](guia-de-uso.md).
