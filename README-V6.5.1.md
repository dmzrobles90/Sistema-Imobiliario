# Plataforma Imobiliária V6.5.1 — Gateway WhatsApp

## O que esta versão faz
- Mantém um único SaaS, mas cria um canal WhatsApp separado por `imobiliaria_id`.
- O número, WABA ID e Phone Number ID pertencem à imobiliária.
- O Access Token não fica no HTML: fica no Supabase Vault.
- Webhook recebe `sent`, `delivered`, `read`, `failed` e mensagens recebidas.
- A fila passa a guardar `provider_message_id` e status de entrega.

## Ordem de instalação
1. Execute `supabase/migracao-v6.5.1-gateway-whatsapp.sql`.
2. Publique a Edge Function `imob-whatsapp-webhook` com JWT desabilitado (a Meta precisa acessá-la publicamente).
3. Defina os secrets `WHATSAPP_VERIFY_TOKEN` e `META_APP_SECRET` na Edge Function.
4. Na Meta, use como Callback URL:
   `https://fzfjaypxmpmcnspaznkv.supabase.co/functions/v1/imob-whatsapp-webhook`
5. Em "Verificar token", use exatamente o valor que você definiu em `WHATSAPP_VERIFY_TOKEN`.
6. Depois de validar o webhook, registre o número real da imobiliária na Meta.
7. Salve WABA ID, Phone Number ID e número exibido em Automações > Comunicações > Gateway WhatsApp.
8. Quando houver token permanente da imobiliária, salve-o no Vault com o nome exibido em `imob_whatsapp_canais.token_secret_name`.

## Importante sobre mensagens de cobrança
Mensagens iniciadas pela imobiliária fora da janela de atendimento do WhatsApp precisam usar **templates aprovados pela Meta**. A função de envio incluída nesta versão deixa a infraestrutura pronta, mas o disparo automático de cobrança deve ser habilitado somente após mapear os modelos da Plataforma para templates oficiais da Meta (V6.5.2).

## Multi-imobiliária
Não compartilhe token nem Phone Number ID entre clientes. Cada linha de `imob_whatsapp_canais` representa uma imobiliária. A evolução para onboarding self-service de clientes será feita com o fluxo de Provedor de Tecnologia / Embedded Signup da Meta.
