# ARDIRE — Site de Crédito

Projeto completo, pronto para subir em um repositório GitHub.

## O que já está implementado

- Home institucional da ARDIRE.
- Produtos:
  - Crédito Pessoal para CLT — R$ 500 a R$ 2.000.
  - Crédito Pessoal INSS — até R$ 2.000.
  - Capital de Giro — R$ 1.000 a R$ 5.000.
  - Crédito com Garantia de Veículo — até R$ 30.000 e até 36 meses.
- Simulador por produto.
- Pré-filtro automático.
- CLT:
  - mínimo de 6 meses no emprego atual;
  - atendimento em Franca/SP e raio de até 50 km.
- INSS:
  - atendimento em Franca/SP e raio de até 50 km.
- Giro:
  - CNPJ com no mínimo 6 meses.
- Upload de documentos.
- Aceite de privacidade/LGPD.
- Envio seguro pelo backend para um webhook n8n.
- Validação de CEP e distância até Franca usando BrasilAPI.
- Limite de 10 MB por arquivo.
- Tipos aceitos: PDF, JPG, JPEG e PNG.
- Rate limiting e headers de segurança.

## Como rodar

1. Instale Node.js 20 ou superior.
2. No terminal:

```bash
npm install
cp .env.example .env
npm run dev
```

3. Abra:

```text
http://localhost:3000
```

## Integração com Kommo / n8n

A forma recomendada é:

Site -> backend -> webhook n8n -> Kommo

Nunca coloque token do Kommo diretamente no JavaScript do navegador.

No arquivo `.env`, configure:

```text
N8N_WEBHOOK_URL=https://SEU-N8N/webhook/ardire-credito
```

O backend envia para esse webhook:
- dados do cliente;
- produto;
- valor solicitado;
- respostas da pré-análise;
- CEP;
- distância calculada;
- documentos anexados.

## GitHub

Você pode subir a pasta inteira no GitHub.

Este projeto possui backend Node/Express, então **GitHub Pages sozinho não executa o backend**. O repositório pode ficar no GitHub, mas o deploy completo deve ser feito em um serviço que execute Node.js, como Render, Railway, Fly.io, VPS ou outro servidor compatível.

## Segurança

Documentos pessoais não devem ser armazenados em um repositório GitHub.

O modo `ALLOW_LOCAL_DEV_STORAGE=true` existe apenas para testes locais. Em produção, use o webhook n8n e armazenamento seguro, com controle de acesso, retenção definida e política de privacidade adequada.

## Observação jurídica

Os textos comerciais deste projeto evitam promessa de aprovação, taxa de juros fixa ou liberação garantida. Antes da publicação definitiva, revise os textos legais, política de privacidade, termos de uso e a identificação de parceiros responsáveis pela originação/contratação da operação.
