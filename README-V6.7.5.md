# Plataforma Imobiliária V6.7.5 — Meta Embedded Signup

## Alterações
- Botão **Conectar WhatsApp** no Gateway WhatsApp.
- SDK oficial da Meta carregado no frontend.
- Estrutura de Embedded Signup usando `metaAppId` e `whatsappEmbeddedConfigId`.
- Nenhum Access Token, App Secret ou código OAuth é persistido no navegador.
- `vercel.json` incluído para publicação HTTPS.

## Antes de publicar
Em `js/config.js`, preencher apenas:
- `metaAppId`: App ID da aplicação Plataforma Imobiliária na Meta.
- `whatsappEmbeddedConfigId`: Identification/Configuration ID criado em Login do Facebook para Empresas.

Esses dois identificadores não são segredos. **Não** inserir App Secret, Access Token ou token permanente no frontend.

## Próxima etapa backend
A Edge Function `imob-whatsapp-oauth` deve receber o `code` temporário do Embedded Signup, trocar pelo token no backend e persistir as credenciais protegidas/Vault por imobiliária. A V6.7.5 não envia o `code` automaticamente enquanto essa função não for revisada para o fluxo atual, evitando exposição ou gravação insegura.

## SQL
Nenhuma migration SQL é necessária para esta versão.
