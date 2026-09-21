# Plataforma Imobiliária V6.7 — Central de Cobranças e Pagamentos

## O que entra nesta versão
- Central de pagamentos dentro de Cobranças.
- KPIs: a receber, recebido, vencido e repasses pendentes.
- Histórico técnico de pagamentos em `imob_pagamentos`.
- Baixa manual atômica por RPC, inclusive pagamento parcial.
- Preparação de cada cobrança para PIX, boleto, IDs/status/payload do provedor.
- Configuração de gateway isolada por imobiliária em `imob_gateway_pagamentos`.
- Preparada para futura integração bancária/webhook sem prender a plataforma a um banco.

## Instalação
1. Execute `supabase/migracao-v6.7-central-cobrancas-pagamentos.sql`.
2. Publique esta pasta/ZIP como nova versão do frontend.
3. Entre em Cobranças e valide os novos KPIs.
4. Faça uma baixa controlada em uma cobrança de teste.

Nenhuma credencial bancária é necessária nesta versão. A integração real com banco/provedor fica para a próxima etapa.
