# Plataforma Imobiliária V6.5.2 — Templates oficiais Meta

## O que muda
- Mapeamento de cada evento de cobrança para um template oficial do WhatsApp.
- Nome, idioma e status de aprovação do template por imobiliária/evento.
- Mensagens automáticas WhatsApp ficam bloqueadas enquanto o template não estiver marcado como aprovado.
- A fila registra snapshot do template usado.
- Edge Function `imob-whatsapp-send` envia `type: template`, nunca texto livre para cobrança automática.
- Correção do vínculo de autenticação (`auth_user_id`) na policy do Gateway e na Edge Function.
- Botão de envio de pendentes preparado no painel.

## Instalação
1. Execute `supabase/migracao-v6.5.2-templates-meta.sql` no SQL Editor.
2. Faça deploy novamente da Edge Function `imob-whatsapp-send`.
3. Publique o frontend desta versão.
4. Em Automações > Comunicações > Modelos, configure os nomes exatamente como aprovados na Meta.

## Situação atual da Meta
A Plataforma Imobiliária ainda não concluiu Verificação da Empresa / Verificação de Acesso como Provedor de Tecnologia. Portanto, a V6.5.2 deixa o produto pronto, mas mantém o envio protegido até existir canal real conectado, token no Vault e templates aprovados.

Nenhum Access Token ou App Secret está incluído neste projeto.
