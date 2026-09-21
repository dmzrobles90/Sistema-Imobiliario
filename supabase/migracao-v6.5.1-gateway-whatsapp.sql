-- Plataforma Imobiliária V6.5.1 — Gateway WhatsApp (multi-imobiliária)
-- Execute após a V6.5. Não contém tokens da Meta.

create table if not exists public.imob_whatsapp_canais (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null unique references public.imob_imobiliarias(id) on delete cascade,
  waba_id text,
  phone_number_id text unique,
  numero_exibicao text,
  nome_exibicao text,
  ativo boolean not null default false,
  status text not null default 'nao_configurado' check (status in ('nao_configurado','configurando','conectado','erro','suspenso')),
  token_secret_name text,
  ultimo_webhook_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.imob_whatsapp_mensagens_recebidas (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  phone_number_id text,
  wamid text unique,
  remetente text,
  nome_remetente text,
  tipo text,
  texto text,
  payload jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null default now()
);

alter table public.imob_whatsapp_canais enable row level security;
alter table public.imob_whatsapp_mensagens_recebidas enable row level security;

drop policy if exists imob_whatsapp_canais_select on public.imob_whatsapp_canais;
create policy imob_whatsapp_canais_select on public.imob_whatsapp_canais for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

drop policy if exists imob_whatsapp_canais_owner_update on public.imob_whatsapp_canais;
create policy imob_whatsapp_canais_owner_update on public.imob_whatsapp_canais for update to authenticated
using (imobiliaria_id=public.imob_current_imobiliaria_id() and exists(
  select 1 from public.imob_usuarios u where u.id=auth.uid() and u.ativo=true and u.perfil in ('admin_imobiliaria','dono')
))
with check (imobiliaria_id=public.imob_current_imobiliaria_id());

drop policy if exists imob_whatsapp_recebidas_select on public.imob_whatsapp_mensagens_recebidas;
create policy imob_whatsapp_recebidas_select on public.imob_whatsapp_mensagens_recebidas for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

-- Cria o registro do canal para imobiliárias já existentes.
insert into public.imob_whatsapp_canais(imobiliaria_id,token_secret_name)
select id,'imob_whatsapp_'||id::text from public.imob_imobiliarias
on conflict(imobiliaria_id) do nothing;

create or replace function public.imob_criar_canal_whatsapp_nova_imobiliaria()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.imob_whatsapp_canais(imobiliaria_id,token_secret_name)
 values(new.id,'imob_whatsapp_'||new.id::text) on conflict(imobiliaria_id) do nothing;
 return new;
end $$;

drop trigger if exists trg_imob_criar_canal_whatsapp on public.imob_imobiliarias;
create trigger trg_imob_criar_canal_whatsapp after insert on public.imob_imobiliarias
for each row execute function public.imob_criar_canal_whatsapp_nova_imobiliaria();

-- Amplia os estados da fila para refletir o ciclo real da Meta.
do $$
declare r record;
begin
 for r in select conname from pg_constraint where conrelid='public.imob_comunicacoes'::regclass and contype='c'
          and pg_get_constraintdef(oid) ilike '%status%' loop
   execute format('alter table public.imob_comunicacoes drop constraint %I',r.conname);
 end loop;
end $$;

alter table public.imob_comunicacoes
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists entregue_em timestamptz,
  add column if not exists lida_em timestamptz,
  add column if not exists provider_payload jsonb;

alter table public.imob_comunicacoes add constraint imob_comunicacoes_status_check
check(status in ('pendente','processando','enviada','entregue','lida','erro','cancelada','sem_destinatario'));
create unique index if not exists ux_imob_comunicacoes_provider_message on public.imob_comunicacoes(provider_message_id) where provider_message_id is not null;

-- A Edge Function usa service_role e lê o token no Supabase Vault por esta função.
create or replace function public.imob_whatsapp_token_por_imobiliaria(p_imobiliaria_id uuid)
returns text language plpgsql security definer set search_path=public,vault as $$
declare v_name text; v_token text;
begin
 select token_secret_name into v_name from public.imob_whatsapp_canais where imobiliaria_id=p_imobiliaria_id;
 if v_name is null then return null; end if;
 select decrypted_secret into v_token from vault.decrypted_secrets where name=v_name limit 1;
 return v_token;
end $$;
revoke all on function public.imob_whatsapp_token_por_imobiliaria(uuid) from public,anon,authenticated;
grant execute on function public.imob_whatsapp_token_por_imobiliaria(uuid) to service_role;

grant select on public.imob_whatsapp_canais to authenticated;
grant update(waba_id,phone_number_id,numero_exibicao,nome_exibicao,ativo,status,atualizado_em) on public.imob_whatsapp_canais to authenticated;
grant select on public.imob_whatsapp_mensagens_recebidas to authenticated;
revoke all on public.imob_whatsapp_canais from anon;
revoke all on public.imob_whatsapp_mensagens_recebidas from anon;

comment on table public.imob_whatsapp_canais is 'V6.5.1: um canal WhatsApp por imobiliária; token armazenado no Vault, nunca no HTML.';
