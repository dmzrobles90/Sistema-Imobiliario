# Plataforma Imobiliária V6.7.5.6 — Meta OAuth

## Alterações
- Atualiza cache do frontend para `app.js?v=6.7.5.6`.
- Mantém o Embedded Signup via `FB.login()` com callback síncrono.
- Inclui `EDGE-FUNCTION-imob-whatsapp-oauth-V6.7.5.6.ts` para substituir integralmente a Edge Function `imob-whatsapp-oauth`.
- Na troca do authorization code gerado pelo JSSDK, o backend envia `redirect_uri` explicitamente como string vazia, evitando usar indevidamente a URL da Vercel como redirect URI do code emitido pelo SDK.
- O Access Token continua restrito à Edge Function: não é retornado ao navegador e ainda não é persistido.

## Implantação
1. Publique este frontend na Vercel.
2. No Supabase, substitua o código da Edge Function `imob-whatsapp-oauth` pelo arquivo incluído e faça Deploy.
3. Não execute SQL.
4. Teste Gateway WhatsApp > Conectar WhatsApp uma única vez.

## Segurança
Os Secrets `META_APP_ID` e `META_APP_SECRET` permanecem no Supabase. Nunca coloque `META_APP_SECRET` no frontend.
