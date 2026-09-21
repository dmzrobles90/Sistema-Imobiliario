-- Plataforma Imobiliária V6.2.7
-- Campo opcional para agenda/filtros rápidos do funil de vendas.
alter table public.imob_vendas
  add column if not exists data_proxima_acao date;

create index if not exists imob_vendas_data_proxima_acao_idx
  on public.imob_vendas (imobiliaria_id, data_proxima_acao);
