# Montagens salvas — etapa 41

A reabertura preserva ID, nome, tipo e aplicações do mesmo produto nas duas
posições. Produtos indisponíveis permanecem no registro original e aparecem
como aviso; são excluídos do orçamento e PDF. Removê-los ao salvar exige a
confirmação já existente. Montagens de outro usuário continuam inacessíveis.

As respostas de leitura/salvamento agora incluem uma versão derivada de nome,
tipo e itens. Ao editar, o configurador envia essa versão; o servidor bloqueia
a linha e compara o estado atual antes de substituir itens. Se outra aba
salvou primeiro, retorna 409 sem alterar o registro e conserva a seleção na
tela. Reabra a montagem para revisar a versão atual antes de salvar novamente.
Clientes antigos sem versão continuam compatíveis, sem essa proteção adicional.

Na criação, o navegador gera uma chave UUID e a reutiliza ao repetir o mesmo
conteúdo após falha. O servidor usa a chave como ID da nova montagem: repetir
não duplica o registro nem seus itens. Uma chave de outro usuário ou com
conteúdo diferente é recusada. Não é necessária migração SQL adicional.

Testes: transações reais em PostgreSQL temporário, duas aplicações do mesmo
pneu, reabertura, tipo, repetição de criação, versão antiga recusada e proteção
do proprietário. A interface também verifica envio da versão e reuso da chave.
