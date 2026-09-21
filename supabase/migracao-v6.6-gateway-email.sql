-- Plataforma Imobiliária V6.6 — Gateway de E-mail (Resend, multi-imobiliária)
-- Execute após a V6.5.2. Não contém API keys.

create table if not exists public.imob_email_canais (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null unique references public.imob_imobiliarias(id) on delete cascade,
  provedor text not null default 'resend' check (provedor in ('resend')),
  remetente_nome text,
  remetente_email text,
  reply_to text,
  ativo boolean not null default false,
  status text not null default 'nao_configurado' check (status in ('nao_configurado','configurando','conectado','erro','suspenso')),
  api_key_secret_name text,
  ultimo_envio_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.imob_email_canais enable row level security;

drop policy if exists imob_email_canais_select on public.imob_email_canais;
create policy imob_email_canais_select on public.imob_email_canais for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

drop policy if exists imob_email_canais_owner_update on public.imob_email_canais;
create policy imob_email_canais_owner_update on public.imob_email_canais for update to authenticated
using (imobiliaria_id=public.imob_current_imobiliaria_id() and exists(
  select 1 from public.imob_usuarios u
  where u.auth_user_id=auth.uid() and u.imobiliaria_id=imob_email_canais.imobiliaria_id
    and u.ativo=true and u.perfil in ('admin_imobiliaria','dono')
))
with check (imobiliaria_id=public.imob_current_imobiliaria_id());

insert into public.imob_email_canais(imobiliaria_id,api_key_secret_name)
select id,'imob_email_resend_'||id::text from public.imob_imobiliarias
on conflict(imobiliaria_id) do nothing;

create or replace function public.imob_criar_canal_email_nova_imobiliaria()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.imob_email_canais(imobiliaria_id,api_key_secret_name)
 values(new.id,'imob_email_resend_'||new.id::text) on conflict(imobiliaria_id) do nothing;
 return new;
end $$;

drop trigger if exists trg_imob_criar_canal_email on public.imob_imobiliarias;
create trigger trg_imob_criar_canal_email after insert on public.imob_imobiliarias
for each row execute function public.imob_criar_canal_email_nova_imobiliaria();

create or replace function public.imob_email_token_por_imobiliaria(p_imobiliaria_id uuid)
returns text language plpgsql security definer set search_path=public,vault as $$
declare v_name text; v_token text;
begin
 select api_key_secret_name into v_name from public.imob_email_canais where imobiliaria_id=p_imobiliaria_id;
 if v_name is null then return null; end if;
 select decrypted_secret into v_token from vault.decrypted_secrets where name=v_name limit 1;
 return v_token;
end $$;
revoke all on function public.imob_email_token_por_imobiliaria(uuid) from public,anon,authenticated;
grant execute on function public.imob_email_token_por_imobiliaria(uuid) to service_role;

grant select on public.imob_email_canais to authenticated;
grant update(provedor,remetente_nome,remetente_email,reply_to,ativo,status,atualizado_em) on public.imob_email_canais to authenticated;
revoke all on public.imob_email_canais from anon;

-- Corrige também a policy antiga do WhatsApp para o vínculo real do Supabase Auth.
drop policy if exists imob_whatsapp_canais_owner_update on public.imob_whatsapp_canais;
create policy imob_whatsapp_canais_owner_update on public.imob_whatsapp_canais for update to authenticated
using (imobiliaria_id=public.imob_current_imobiliaria_id() and exists(
  select 1 from public.imob_usuarios u
  where u.auth_user_id=auth.uid() and u.imobiliaria_id=imob_whatsapp_canais.imobiliaria_id
    and u.ativo=true and u.perfil in ('admin_imobiliaria','dono')
))
with check (imobiliaria_id=public.imob_current_imobiliaria_id());

comment on table public.imob_email_canais is 'V6.6: canal transacional de e-mail por imobiliária via Resend; API key fica no Supabase Vault.';
