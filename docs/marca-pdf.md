# Marca e PDF — etapa 39

A imagem original foi preservada. Os cabeçalhos usam uma versão WebP de 80 px
(1.456 bytes), o favicon PNG tem 32 px, o ícone para dispositivos Apple tem
180 px e o PDF usa PNG de 96 px. O navegador não precisa baixar o original
de 1.244.446 bytes para o cabeçalho. Para regenerar: npm --prefix site run build:brand.

O PDF tem marca em todas as páginas, numeração, preço por item, links para lojas,
total e avisos sobre preços/compatibilidade. Nomes extensos continuam em blocos
sem cruzar o rodapé; nomes acima de 6.000 caracteres são abreviados na exportação.
Foi inspecionada visualmente uma montagem sintética com 55 itens e seis páginas,
incluindo nome extenso, totais e links. Não foram usados dados de usuários.
