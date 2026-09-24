[README.md](https://github.com/user-attachments/files/32632052/README.md)
# ARDIRE Capital / Destravo Cred — v6

Versão consolidada com integração direta do backend com Kommo e envio de propostas por e-mail.

## Fluxo

1. Cliente escolhe CLT, INSS ou Bolsa Família e simula a parcela.
2. Ao concluir a pré-análise, o backend cria/atualiza o contato e cria um lead no Kommo na etapa **Pré-análise concluída**.
3. Ao enviar os documentos, o mesmo lead vai para **Documentos recebidos**.
4. Os arquivos são enviados ao Files API do Kommo e vinculados ao lead.
5. O backend envia e-mail para `MAIL_TO` com os dados legíveis e, quando o pacote couber com segurança no e-mail, um ZIP organizado dos documentos.
6. Se o ZIP ultrapassar 18 MB, o e-mail é enviado sem ZIP e informa que os documentos estão vinculados no Kommo.

## Campos esperados no Kommo

### Contato
- CPF
- Cidade
- Telefone e E-mail são campos padrão do contato

### Lead
- Produto solicitado
- Valor solicitado
- Prazo escolhido
- Valor da parcela
- Renda / benefício
- Empresa atual
- Meses no emprego
- Tipo de benefício
- Resultado da pré-análise
- Origem do lead
- Data/hora da solicitação
- Observações

## Etapas esperadas no funil

- Nova solicitação
- Pré-análise concluída
- Aguardando documentos
- Documentos recebidos
- Em análise de crédito
- Aprovado / Formalização
- Fechado - ganho
- Fechado - perdido

## Variáveis de ambiente

As credenciais nunca devem ser colocadas no GitHub. Configure-as somente no Render.

- `KOMMO_SUBDOMAIN`
- `KOMMO_ACCESS_TOKEN`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_TO`
- `MAIL_FROM`

## Observação

O backend localiza automaticamente IDs de campos, pipeline e etapas pelos nomes configurados no Kommo. Não é necessário gravar IDs no código.
