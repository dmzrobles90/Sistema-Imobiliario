# Plataforma Imobiliária V6.6 — Gateway de E-mail

- Canal de e-mail por imobiliária com Resend.
- API key nunca vai para o HTML; fica no Supabase Vault com nome `imob_email_resend_<imobiliaria_uuid>`.
- Edge Function `imob-email-send` valida o usuário Dono, descobre a imobiliária no backend e envia apenas itens `email`/`pendente` da própria imobiliária.
- Usa Idempotency-Key por comunicação para reduzir risco de duplicidade em retries.
- Interface: Automações > Comunicações > Gateway E-mail.
- O remetente/domínio precisa estar validado no provedor antes de marcar o canal como conectado.
- WhatsApp continua independente e pode permanecer não configurado.

## Ordem de instalação
1. Executar `supabase/migracao-v6.6-gateway-email.sql`.
2. Criar/deploy da Edge Function `imob-email-send` com Verify JWT legacy OFF (a função valida o JWT internamente).
3. Criar conta/projeto no Resend e validar domínio/remetente.
4. Criar API key no Resend e salvá-la diretamente no Supabase Vault, sem colocá-la no frontend.
5. Preencher Gateway E-mail na Plataforma e, após backend pronto, marcar `status='conectado'` e `ativo=true`.
6. Fazer um único envio controlado antes de liberar a fila completa.
