# Recuperação tradicional — etapa 38

A tela /recuperar-senha atende contas locais por usuário e senha. Google continua
com autenticação própria. Não existe mais envio de recuperação Firebase.

## Ativação no Render

1. Execute database/migrations/038_recuperacao_senha.sql no SQL Editor do banco
   usado pelo Render. Não resete o banco. A migração é repetível.
2. Crie uma conta no Resend e verifique um domínio remetente seguindo as
   instruções DNS do provedor. Use um endereço desse domínio em EMAIL_FROM.
   O remetente de testes do Resend não libera envio para qualquer destinatário.
3. Configure as variáveis somente no Render, nunca em commits:

```dotenv
RECUPERACAO_SENHA_ENABLED=true
PUBLIC_BASE_URL=https://bikonfig.onrender.com
RESEND_API_KEY=chave-privada-do-resend
EMAIL_FROM=acesso@seu-dominio-verificado.com
```

4. Publique a versão atual e teste com uma conta local e caixa de entrada sob
   seu controle. Confirme entrega/spam, troca de senha, recusa da senha antiga,
   expiração, uso único e encerramento de outra sessão anterior.

Por padrão a função permanece desativada, sem envio real. A habilitação exige
credencial, remetente e origem fixa HTTPS; o link não usa o Host da requisição.
O processo do site verifica a fila a cada 10 segundos. Em hospedagem que pausa
por inatividade, os envios retomam quando o processo volta a funcionar.

## Segurança e operação

Os links têm 256 bits aleatórios, expiram em 30 minutos e são de uso único.
O banco guarda somente o hash para validar o token; a fila guarda o destinatário
e o link cifrados com AES-GCM, derivado de SECRET. O conteúdo é eliminado após
o envio ou consumo. Não compartilhe SECRET; uma troca de SECRET invalida a
leitura de mensagens ainda na fila, que precisarão de nova solicitação.

O token vai no fragmento do link, que não é enviado em URLs HTTP. O navegador
retira o fragmento do endereço e envia o token somente no POST protegido por
CSRF. A nova senha respeita a política existente e o limite bcrypt de 72 bytes.
A troca incrementa a versão da senha e invalida sessões antigas, inclusive
quando o envio de recuperação for desabilitado depois. Cookies anteriores à
migração são considerados versão zero.

A resposta de solicitação é genérica para e-mail inexistente, ambíguo, Google
ou conta local. O envio é assíncrono: não é aguardada resposta do Resend para
renderizar a confirmação. Há limite por IP e intervalo persistente de um
minuto por usuário. Nova solicitação elegível invalida links anteriores.

A fila possui lease, até cinco tentativas e chave de idempotência no Resend.
Não registre corpo das requisições, links, e-mails, hashes ou senhas nos logs.
Falhas de envio não alteram a senha. Os testes usam banco temporário e envio
simulado; nenhuma mensagem real é enviada durante a validação automatizada.

Referências: [Resend](https://resend.com/docs/api-reference/emails/send-email)
e [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
