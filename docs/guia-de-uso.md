# Guia de uso e conferência

## Montar uma bicicleta

1. Crie uma conta ou entre pelo formulário de login.
2. No catálogo, busque pelo nome da peça, fabricante, loja ou SKU. Use
   Anterior/Próxima para navegar; confira as datas de preço e estoque.
3. Escolha uma oferta disponível e clique em **Configurar com essa peça**,
   ou abra o configurador vazio.
4. Selecione categorias e componentes. Para rodas, pneus e itens com duas
   aplicações, escolha a posição dianteira ou traseira. A mesma oferta pode
   ser usada nas duas posições. Acessórios permitem seleção múltipla.
5. Confira tipo de montagem, orçamento, componentes faltantes e alertas.
   Especificação ausente exige conferência; ausência de divergência nas
   regras existentes não garante compatibilidade integral ou montagem segura.
6. Use **Salvar configuração**, dê um nome de até 100 caracteres e confira
   a confirmação. O rascunho no navegador ajuda na recuperação do progresso;
   salvar na conta permite reabrir a montagem em outro dispositivo.
7. Em **Minhas configs**, escolha **Editar configuração**. **Salvar alterações**
   atualiza o mesmo registro. A retirada de peças antigas indisponíveis pede
   confirmação. Peças indisponíveis na seleção impedem salvar ou gerar PDF.
8. Use **Baixar PDF** para levar a lista à revisão do mecânico e confirme as
   especificações e os preços com os fabricantes/lojas antes da compra.
9. Use **Sair** para encerrar a sessão. Abrir `/logout` na barra de endereço
   não encerra a sessão.

## Celular e teclado

Os atalhos inferiores levam a categorias, peças e resumo. Categorias podem
ser abertas pelo botão correspondente. Tab percorre controles; Escape
fecha menu e diálogos. Diálogos devolvem o foco ao controle anterior.

## Administração

O acesso exige uma conta com permissão administrativa já concedida no banco.
O cadastro comum não oferece essa permissão.

- `/admin/revisao`: conferir categoria, fabricante e especificações antes
  de publicar. Rejeitar desativa a oferta e preserva montagens e histórico.
- `/admin/qualidade`: localizar pendências e abrir a revisão de um produto
  já aprovado. Possíveis duplicatas exigem conferência; não são mescladas.
- `/admin/coletas`: consultar registros de execução e atualização de preços.
  Uma execução sem conclusão exige investigação no Actions.

## Problemas frequentes

- **Formulário/sessão expirado (403):** recarregue a página e entre novamente
  se necessário. O rascunho fica neste navegador, separado por conta/montagem.
- **Muitas tentativas (429):** aguarde o período indicado antes de tentar login.
- **Orçamento indisponível:** use Atualizar orçamento e confira as peças.
- **Peça indisponível:** escolha substituta; o total pode ser parcial.
- **Rascunho não guardado:** o navegador pode estar sem espaço ou bloquear
  armazenamento. Use Salvar na conta.
- **Site indisponível:** consulte `/healthz` e o operador do projeto. Não
  envie senha, tokens ou conteúdo do `.env` ao relatar um problema.

Operação: [produção](producao.md), [coleta](coleta-automatica.md),
[qualidade](qualidade-catalogo.md), [desempenho](desempenho.md) e
[validação final](validacao-final.md).
