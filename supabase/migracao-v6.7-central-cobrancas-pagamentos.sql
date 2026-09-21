-- Plataforma Imobiliária V6.7 — Central de Cobranças e Pagamentos
-- Execute após a V6.6. Não exige integração bancária ativa.

alter table public.imob_cobrancas add column if not exists meio_pagamento text;
alter table public.imob_cobrancas add column if not exists provider text;
alter table public.imob_cobrancas add column if not exists provider_cobranca_id text;
alter table public.imob_cobrancas add column if not exists pix_copia_cola text;
alter table public.imob_cobrancas add column if not exists pix_qr_code_url text;
alter table public.imob_cobrancas add column if not exists boleto_linha_digitavel text;
alter table public.imob_cobrancas add column if not exists boleto_url text;
alter table public.imob_cobrancas add column if not exists provider_status text;
alter table public.imob_cobrancas add column if not exists provider_payload jsonb;
alter table public.imob_cobrancas add column if not exists ultima_sincronizacao_em timestamptz;

create table if not exists public.imob_gateway_pagamentos (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null unique references public.imob_imobiliarias(id) on delete cascade,
  provider text not null default 'manual',
  nome_conta text,
  banco text,
  agencia text,
  conta text,
  chave_pix text,
  ativo boolean not null default false,
  status text not null default 'nao_configurado' check (status in ('nao_configurado','configurando','conectado','erro','suspenso')),
  credencial_secret_name text,
  webhook_secret_name text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.imob_gateway_pagamentos enable row level security;

drop policy if exists "imob_gateway_pagamentos_select" on public.imob_gateway_pagamentos;
drop policy if exists "imob_gateway_pagamentos_insert" on public.imob_gateway_pagamentos;
drop policy if exists "imob_gateway_pagamentos_update" on public.imob_gateway_pagamentos;
drop policy if exists "imob_gateway_pagamentos_delete" on public.imob_gateway_pagamentos;
create policy "imob_gateway_pagamentos_select" on public.imob_gateway_pagamentos for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_gateway_pagamentos_insert" on public.imob_gateway_pagamentos for insert to authenticated
with check (public.imob_is_admin_master() or (imobiliaria_id=public.imob_current_imobiliaria_id() and public.imob_is_dono_imobiliaria()));
create policy "imob_gateway_pagamentos_update" on public.imob_gateway_pagamentos for update to authenticated
using (public.imob_is_admin_master() or (imobiliaria_id=public.imob_current_imobiliaria_id() and public.imob_is_dono_imobiliaria()))
with check (public.imob_is_admin_master() or (imobiliaria_id=public.imob_current_imobiliaria_id() and public.imob_is_dono_imobiliaria()));
create policy "imob_gateway_pagamentos_delete" on public.imob_gateway_pagamentos for delete to authenticated
using (public.imob_is_admin_master() or (imobiliaria_id=public.imob_current_imobiliaria_id() and public.imob_is_dono_imobiliaria()));

insert into public.imob_gateway_pagamentos (imobiliaria_id)
select id from public.imob_imobiliarias
on conflict (imobiliaria_id) do nothing;

create or replace function public.imob_criar_gateway_pagamentos_imobiliaria()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.imob_gateway_pagamentos(imobiliaria_id) values(new.id) on conflict(imobiliaria_id) do nothing;
  return new;
end;$$;
drop trigger if exists trg_imob_criar_gateway_pagamentos on public.imob_imobiliarias;
create trigger trg_imob_criar_gateway_pagamentos after insert on public.imob_imobiliarias
for each row execute function public.imob_criar_gateway_pagamentos_imobiliaria();

create table if not exists public.imob_pagamentos (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  cobranca_id uuid not null references public.imob_cobrancas(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  meio_pagamento text not null default 'outro',
  origem text not null default 'manual' check (origem in ('manual','webhook','importacao','conciliacao')),
  provider text,
  provider_pagamento_id text,
  status text not null default 'confirmado' check (status in ('pendente','confirmado','estornado','cancelado')),
  data_pagamento timestamptz,
  comprovante_url text,
  observacoes text,
  provider_payload jsonb,
  criado_por uuid references public.imob_usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_imob_pagamentos_imobiliaria on public.imob_pagamentos(imobiliaria_id);
create index if not exists idx_imob_pagamentos_cobranca on public.imob_pagamentos(cobranca_id);
create unique index if not exists ux_imob_pagamentos_provider on public.imob_pagamentos(imobiliaria_id,provider,provider_pagamento_id)
where provider_pagamento_id is not null;
alter table public.imob_pagamentos enable row level security;

drop policy if exists "imob_pagamentos_select" on public.imob_pagamentos;
drop policy if exists "imob_pagamentos_insert" on public.imob_pagamentos;
drop policy if exists "imob_pagamentos_update" on public.imob_pagamentos;
create policy "imob_pagamentos_select" on public.imob_pagamentos for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_pagamentos_insert" on public.imob_pagamentos for insert to authenticated
with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());
create policy "imob_pagamentos_update" on public.imob_pagamentos for update to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id())
with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

create or replace function public.imob_registrar_pagamento_manual(
  p_cobranca_id uuid,
  p_valor numeric,
  p_meio_pagamento text default 'outro',
  p_data_pagamento timestamptz default now(),
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  c public.imob_cobrancas%rowtype;
  p_id uuid;
  total_pago numeric;
  usuario_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  select * into c from public.imob_cobrancas where id=p_cobranca_id;
  if not found then raise exception 'Cobrança não encontrada'; end if;
  if not public.imob_is_admin_master() and c.imobiliaria_id is distinct from public.imob_current_imobiliaria_id() then
    raise exception 'Acesso negado';
  end if;
  if c.status='cancelado' then raise exception 'Cobrança cancelada'; end if;
  if coalesce(p_valor,0)<=0 then raise exception 'Valor inválido'; end if;
  select id into usuario_id from public.imob_usuarios where auth_user_id=auth.uid() limit 1;

  insert into public.imob_pagamentos(imobiliaria_id,cobranca_id,valor,meio_pagamento,origem,status,data_pagamento,observacoes,criado_por)
  values(c.imobiliaria_id,c.id,p_valor,coalesce(nullif(p_meio_pagamento,''),'outro'),'manual','confirmado',coalesce(p_data_pagamento,now()),p_observacoes,usuario_id)
  returning id into p_id;

  select coalesce(sum(valor),0) into total_pago from public.imob_pagamentos
   where cobranca_id=c.id and status='confirmado';

  update public.imob_cobrancas set
    valor_pago=total_pago,
    data_pagamento=case when total_pago>=coalesce(valor_total,valor_base,0) then coalesce(p_data_pagamento,now()) else data_pagamento end,
    forma_pagamento=coalesce(nullif(p_meio_pagamento,''),forma_pagamento),
    meio_pagamento=coalesce(nullif(p_meio_pagamento,''),meio_pagamento),
    status=case when total_pago>=coalesce(valor_total,valor_base,0) then 'pago' else 'parcial' end,
    atualizado_em=now()
  where id=c.id;
  return p_id;
end;$$;
grant execute on function public.imob_registrar_pagamento_manual(uuid,numeric,text,timestamptz,text) to authenticated;
