# Plataforma Imobiliária V6.7.5.4 — Meta Embedded Signup + Backend OAuth

- Envia o authorization code temporário do Embedded Signup diretamente para a Edge Function `imob-whatsapp-oauth`.
- Usa a sessão autenticada do Supabase na chamada da função.
- Não armazena authorization code, App Secret ou Access Token no navegador.
- Exibe o resultado da troca segura realizada no backend.
- Nenhuma alteração SQL nesta versão.

## Backend necessário
A Edge Function `imob-whatsapp-oauth` deve estar implantada com `META_APP_ID` e `META_APP_SECRET` configurados nos Secrets do Supabase.

Esta versão valida somente a autorização/troca segura. A persistência do token no Vault e o vínculo definitivo de WABA/Phone Number ID permanecem para a próxima etapa.
