# Migração e transição de acesso — etapa 36

A migração individual está em `/migrar-conta`, com links no login e na home
de sessões antigas. Ela conserva `usuarios.id`, nome, e-mail, permissões e
montagens. Não importa hashes em massa, não cria outro usuário local e não
associa contas só pela coincidência de e-mail.

## Como migrar uma conta

1. Ative a integração e a interface Firebase, configure os provedores e aplique
   a migração SQL 031. Esta etapa não acrescenta migração SQL.
2. Na página de migração, informe usuário e senha antigos e confirme a mudança.
3. Escolha Google com o mesmo e-mail cadastrado, ou use e-mail e senha Firebase.
   Para criar o acesso Firebase nessa página, informe e confirme a nova senha.
   Se a identidade já existir, marque **Já tenho acesso Firebase** e informe
   a senha desse acesso. A senha antiga nunca é enviada ao SDK Firebase.
4. Por e-mail, a interface envia um link de verificação se necessário. Confirme
   o endereço e entre novamente na página de migração, com a opção de acesso
   Firebase existente marcada. O token precisa comprovar e-mail confirmado.
5. Após validar ambos os acessos, o servidor cria o vínculo em uma transação,
   renova a sessão e abre a home. As montagens continuam no mesmo usuário.

O endpoint `POST /auth/firebase/link` recebe apenas `idToken`, `usuario` e
`senha`, com CSRF e limite de tentativas. Exige token recente, válido e não
revogado do projeto configurado, provedor password ou google.com, e-mail
verificado e igual ao cadastro antigo, e comprovação bcrypt da senha antiga.
Nunca aceita ID local, UID, e-mail ou permissão escolhidos pelo navegador.
Um vínculo existente não pode ser movido ou substituído. A repetição da mesma
operação retorna a mesma conta, sem duplicar usuário ou montagem.

Se a criação Firebase funcionar e a migração local falhar, marque a opção
de acesso Firebase existente para retomar. Não apague identidades remotas
automaticamente: outra tentativa pode ter concluído a operação. Se a sessão
falhar depois que o vínculo foi salvo, use o login Firebase/Google normal.

## Política de transição

`FIREBASE_LEGACY_ENABLED=true` é o padrão. Contas sem vínculo no projeto atual
continuam entrando pelo acesso antigo. Quando a conta é vinculada, a senha
antiga deixa de liberar login legado, e sessões legadas anteriores são
invalidadas na próxima requisição dinâmica. A senha antiga não permite
contornar uma redefinição, revogação ou desativação do acesso Firebase.
O formulário de migração continua exigindo os dois acessos inclusive para
operações repetidas; não permite trocar o UID de uma conta vinculada.

Execute na pasta raiz do projeto:

```powershell
npm --prefix site run check:firebase
```

O diagnóstico informa `migracao.total`, `vinculados` e `sem_vinculo` **no projeto
Firebase configurado**, sem imprimir e-mails, senhas, hashes ou tokens.
Não comprova a disponibilidade do provedor nem consulta identidades remotas.

Depois de validar a integração real e revisar as contas sem vínculo, pode-se
definir `FIREBASE_LEGACY_ENABLED=false` no Render e publicar novamente. Isso
fecha login e cadastro legados e invalida as sessões legadas restantes; a
rota de migração permanece disponível para comprovar os dois acessos. O
servidor recusa essa configuração se a interface Firebase não estiver ativa.
Não desligue o acesso antigo indiscriminadamente antes de revisar as contas
pendentes e validar recuperação de senha e acesso administrativo.

Para reabrir a transição, volte **somente** `FIREBASE_LEGACY_ENABLED=true`.
Isso reabre o acesso das contas não vinculadas; as contas migradas continuam
protegidas pelo Firebase. Mantenha `FIREBASE_ENABLED=true`. Desabilitar toda
a integração ou restaurar uma versão anterior que aceite bcrypt pode reabrir
o acesso antigo também para contas migradas, pois os hashes locais são
preservados. Não use essa opção como alternativa a falhas do provedor.

## Limitações e validação antes da publicação

Não há migração automática do banco publicado nem importação remota em massa.
Cada titular precisa comprovar os dois acessos. Quem perdeu a senha antiga,
tem e-mail divergente ou encontrou vínculo conflitante precisa de revisão
assistida pelo responsável, com comprovação de identidade; não remova vínculos
ou una usuários apenas pelo e-mail. Dados locais antigos não são marcados
como verificados no Firebase.

Em homologação, confira conta comum e administrativa, montagens antes e
depois, verificação de e-mail, Google, retomada após falha, senha incorreta,
e-mail diferente e tentativas de substituir vínculos. Abra duas sessões
antigas e confira que a outra é encerrada após a migração. Depois, redefina
a senha Firebase e confirme que a senha antiga não entra pelo acesso legado.
Valide o corte e a reabertura da transição antes de aplicá-los em produção.

Os testes automatizados exercitam SDK simulado, HTTP/CSRF/sessões reais e
PostgreSQL temporário, incluindo preservação de proprietário e itens da
montagem. Não enviam e-mails, não migram usuários do banco publicado e não
comprovam a autorização Google ou entrega de mensagens do projeto real.
