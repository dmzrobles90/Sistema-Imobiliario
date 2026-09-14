-- Plataforma Imobiliária V5.9 — Vendas, Vistorias e Manutenções
-- Cobranças e Financeiro já existem nas versões anteriores.

create table if not exists public.imob_vendas (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  imovel_id uuid references public.imob_imoveis(id) on delete set null,
  cliente_nome text not null,
  cliente_email text,
  cliente_telefone text,
  etapa text not null default 'lead' check (etapa in ('lead','visita','proposta','fechamento','concluida','cancelada')),
  valor_negociacao numeric(14,2),
  comissao_percentual numeric(8,4) default 0,
  corretor_nome text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_imob_vendas_imobiliaria on public.imob_vendas(imobiliaria_id);
create index if not exists idx_imob_vendas_imovel on public.imob_vendas(imovel_id);
alter table public.imob_vendas enable row level security;

drop policy if exists "imob_vendas_select" on public.imob_vendas;
drop policy if exists "imob_vendas_insert" on public.imob_vendas;
drop policy if exists "imob_vendas_update" on public.imob_vendas;
drop policy if exists "imob_vendas_delete" on public.imob_vendas;
create policy "imob_vendas_select" on public.imob_vendas for select to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_vendas_insert" on public.imob_vendas for insert to authenticated with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_vendas_update" on public.imob_vendas for update to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id()) with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_vendas_delete" on public.imob_vendas for delete to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

create table if not exists public.imob_vistorias (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  imovel_id uuid not null references public.imob_imoveis(id) on delete cascade,
  contrato_id uuid references public.imob_contratos(id) on delete set null,
  data_vistoria date not null,
  tipo text not null default 'entrada' check (tipo in ('entrada','saida','periodica')),
  responsavel text,
  status text not null default 'agendada' check (status in ('agendada','em_andamento','concluida','cancelada')),
  laudo text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_imob_vistorias_imobiliaria on public.imob_vistorias(imobiliaria_id);
create index if not exists idx_imob_vistorias_imovel on public.imob_vistorias(imovel_id);
create index if not exists idx_imob_vistorias_contrato on public.imob_vistorias(contrato_id);
alter table public.imob_vistorias enable row level security;

drop policy if exists "imob_vistorias_select" on public.imob_vistorias;
drop policy if exists "imob_vistorias_insert" on public.imob_vistorias;
drop policy if exists "imob_vistorias_update" on public.imob_vistorias;
drop policy if exists "imob_vistorias_delete" on public.imob_vistorias;
create policy "imob_vistorias_select" on public.imob_vistorias for select to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_vistorias_insert" on public.imob_vistorias for insert to authenticated with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_vistorias_update" on public.imob_vistorias for update to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id()) with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_vistorias_delete" on public.imob_vistorias for delete to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

create table if not exists public.imob_manutencoes (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  imovel_id uuid not null references public.imob_imoveis(id) on delete cascade,
  contrato_id uuid references public.imob_contratos(id) on delete set null,
  codigo text,
  descricao text not null,
  solicitante text,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  status text not null default 'aberto' check (status in ('aberto','aguardando_proprietario','em_execucao','concluido','cancelado')),
  valor_estimado numeric(14,2),
  valor_final numeric(14,2),
  fornecedor text,
  autorizacao_proprietario boolean not null default false,
  data_abertura date not null default current_date,
  data_conclusao date,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_imob_manutencoes_imobiliaria on public.imob_manutencoes(imobiliaria_id);
create index if not exists idx_imob_manutencoes_imovel on public.imob_manutencoes(imovel_id);
create index if not exists idx_imob_manutencoes_contrato on public.imob_manutencoes(contrato_id);
alter table public.imob_manutencoes enable row level security;

drop policy if exists "imob_manutencoes_select" on public.imob_manutencoes;
drop policy if exists "imob_manutencoes_insert" on public.imob_manutencoes;
drop policy if exists "imob_manutencoes_update" on public.imob_manutencoes;
drop policy if exists "imob_manutencoes_delete" on public.imob_manutencoes;
create policy "imob_manutencoes_select" on public.imob_manutencoes for select to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_manutencoes_insert" on public.imob_manutencoes for insert to authenticated with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_manutencoes_update" on public.imob_manutencoes for update to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id()) with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_manutencoes_delete" on public.imob_manutencoes for delete to authenticated using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
