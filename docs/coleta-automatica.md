# Operação da coleta automática — etapa 25

## Verificar antes de ativar

O workflow **Coleta diária de preços** tem dois modos manuais:

- **verificar** (padrão): consulta uma página JSON de até três produtos por
  alvo Shopify, com limite de resposta, timeout e validação de redirecionamento.
  Confere preços positivos na amostra sem banco, gravação ou IA. Não garante
  que todas as páginas ou variantes da coleta completa funcionarão.
- **coletar**: executa o scraper existente com banco, IA, lease de exclusão,
  limite de tempo e registro em `scrape_runs`. Pode consumir créditos da API.

Prévia local sem instalar dependências externas:

```bash
python api/check_scheduled_scrape.py --targets '["https://pedalokos.com.br/collections/componentes"]'
```

Também aceita `COLETA_URLS_JSON` no ambiente. A prévia não carrega `.env`.
O modo de gravação continua usando `python api/run_scheduled_scrape.py`,
que carrega `api/.env` quando disponível.

## Configuração no GitHub

Em **Settings → Secrets and variables → Actions**, configure:

| Tipo | Nome | Conteúdo |
|---|---|---|
| Secret | `DATABASE_URL` | Conexão da mesma base do site |
| Secret | `OPENAI_API_KEY` | Chave da API usada pela categorização |
| Variable | `COLETA_URLS_JSON` | Lista JSON explícita de URLs de lojas configuradas |
| Variable | `COLETA_AUTOMATICA_ENABLED` | `true` apenas depois de validar uma execução completa |

Essas configurações são do repositório; variáveis do Render não são
automaticamente compartilhadas com o GitHub Actions. Não envie segredos no
chat, em arquivos do projeto ou mensagens de commit.

1. Confira a migração `015_agendamento_precos.sql` no banco.
2. No Actions, escolha **Coleta diária de preços → Run workflow → verificar**.
3. Corrija TLS, endpoints ou preços ausentes apontados pela prévia.
4. Execute manualmente no modo **coletar** e confira o resumo do job.
5. Acesse `/admin/coletas` com uma conta administradora para verificar o
   histórico e a data dos preços. A revisão de produtos oferece um link.
6. Somente depois defina `COLETA_AUTOMATICA_ENABLED=true` para executar
   diariamente às 09:17 UTC (06:17 em Brasília). Push não inicia coleta.

## Acompanhamento

O job publica um resumo com fontes concluídas/falhas e quantidade processada.
`COLETA_RELATORIO_PATH` permite salvar esse resultado em JSON, sem mensagens
brutas de exceção ou credenciais. No workflow, o caminho é temporário e o
resumo fica na página da execução. Uma prévia não registra coleta de produtos.

O painel administrativo mostra as últimas 30 execuções e produtos ativos
consultados nas últimas 36 horas. Uma execução `running` há mais de 75
minutos é exibida como sem conclusão; isso sinaliza investigação, sem
alterar o registro ou afirmar que um processo ainda está vivo. Uma consulta
recente de alguns produtos não comprova atualização integral do catálogo.

Falhas mantêm código de saída diferente de zero, visível no Actions. Use as
notificações de falha do GitHub para sua conta; não foi configurado envio de
mensagens a terceiros pelo projeto.

## Evidências e pendências de 17/11/2026

- A consulta somente de leitura ao banco configurado localmente encontrou
  zero execuções em `scrape_runs`.
- A prévia real do alvo configurado falhou na verificação TLS
  (`SSLCertVerificationError`, código de verificação 10). A verificação do
  certificado foi mantida; não foi declarado sucesso nem gravado produto.
- O ambiente local não fornece `OPENAI_API_KEY` nem `COLETA_URLS_JSON`.
  Os secrets/variables do repositório não foram inspecionados ou alterados.
- A ativação recorrente e uma coleta completa com IA/banco seguem pendentes
  de configuração e resolução da falha de TLS. Nenhuma migração foi aplicada.

Teste: `python -B -X utf8 -m unittest discover -s api/tests` e
`npm --prefix site test`. As execuções integradas do painel usam PostgreSQL
temporário, incluindo autorização administrativa e escape dos dados exibidos.
