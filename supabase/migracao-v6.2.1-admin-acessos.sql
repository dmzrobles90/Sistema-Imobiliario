-- Plataforma Imobiliária V6.2.1
-- Separação do Admin Master + Planos + Usuários/Permissões da imobiliária

-- 1) Novos perfis internos da imobiliária
alter table public.imob_usuarios drop constraint if exists imob_usuarios_perfil_check;
alter table public.imob_usuarios
  add constraint imob_usuarios_perfil_check
  check (perfil in ('admin_master','admin_imobiliaria','dono','socio','administrativo','corretor','financeiro','atendimento','proprietario','inquilino'));
alter table public.imob_usuarios add column if not exists email text;

-- O perfil admin_imobiliaria já existente continua sendo tratado como Dono para compatibilidade.
create or replace function public.imob_is_dono_imobiliaria()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.imob_usuarios u
    where u.auth_user_id=auth.uid()
      and u.ativo=true
      and u.perfil in ('admin_imobiliaria','dono')
  );
$$;

-- 2) Planos comerciais
create table if not exists public.imob_planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  valor_mensal numeric(12,2) not null default 0,
  modulos jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.imob_imobiliarias add column if not exists plano_id uuid references public.imob_planos(id) on delete set null;

insert into public.imob_planos(nome,descricao,valor_mensal,modulos,ordem)
values
 ('Essencial','Operação básica para pequenas imobiliárias',0,'["imoveis","proprietarios","inquilinos","contratos","documentos"]',1),
 ('Profissional','Gestão completa de locação e comercial',0,'["imoveis","proprietarios","inquilinos","contratos","cobrancas","financeiro","vendas","vistorias","manutencoes","documentos","relatorios"]',2),
 ('Premium','Todos os módulos e futuras automações/integracões',0,'["imoveis","proprietarios","inquilinos","contratos","cobrancas","financeiro","vendas","vistorias","manutencoes","documentos","relatorios"]',3)
on conflict (nome) do nothing;

alter table public.imob_planos enable row level security;
drop policy if exists imob_planos_select on public.imob_planos;
create policy imob_planos_select on public.imob_planos for select to authenticated using (true);
drop policy if exists imob_planos_master_insert on public.imob_planos;
create policy imob_planos_master_insert on public.imob_planos for insert to authenticated with check (public.imob_is_admin_master());
drop policy if exists imob_planos_master_update on public.imob_planos;
create policy imob_planos_master_update on public.imob_planos for update to authenticated using (public.imob_is_admin_master()) with check (public.imob_is_admin_master());
drop policy if exists imob_planos_master_delete on public.imob_planos;
create policy imob_planos_master_delete on public.imob_planos for delete to authenticated using (public.imob_is_admin_master());

-- 3) Convites de equipe. O Dono gera o convite; o novo usuário ativa usando a própria conta autenticada.
create table if not exists public.imob_convites_usuarios (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  email text not null,
  nome text not null,
  perfil text not null check (perfil in ('socio','administrativo','corretor','financeiro','atendimento')),
  permissoes jsonb not null default '{}'::jsonb,
  token uuid not null default gen_random_uuid() unique,
  usado boolean not null default false,
  expira_em timestamptz not null default (now()+interval '7 days'),
  criado_por uuid references public.imob_usuarios(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.imob_permissoes_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.imob_usuarios(id) on delete cascade,
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  modulo text not null,
  visualizar boolean not null default false,
  cadastrar boolean not null default false,
  editar boolean not null default false,
  excluir boolean not null default false,
  unique(usuario_id,modulo)
);

alter table public.imob_convites_usuarios enable row level security;
alter table public.imob_permissoes_usuario enable row level security;

drop policy if exists imob_convites_dono_select on public.imob_convites_usuarios;
create policy imob_convites_dono_select on public.imob_convites_usuarios for select to authenticated
using (public.imob_is_admin_master() or (public.imob_is_dono_imobiliaria() and imobiliaria_id=public.imob_current_imobiliaria_id()));
drop policy if exists imob_permissoes_select on public.imob_permissoes_usuario;
create policy imob_permissoes_select on public.imob_permissoes_usuario for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

-- Gera convite apenas dentro da imobiliária do Dono.
create or replace function public.imob_criar_convite_usuario(p_email text,p_nome text,p_perfil text,p_permissoes jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_imob uuid; v_creator uuid; v_token uuid;
begin
  if not public.imob_is_dono_imobiliaria() then raise exception 'Somente o Dono pode cadastrar usuários'; end if;
  if p_perfil not in ('socio','administrativo','corretor','financeiro','atendimento') then raise exception 'Perfil inválido'; end if;
  v_imob:=public.imob_current_imobiliaria_id();
  select id into v_creator from public.imob_usuarios where auth_user_id=auth.uid() limit 1;
  insert into public.imob_convites_usuarios(imobiliaria_id,email,nome,perfil,permissoes,criado_por)
  values(v_imob,lower(trim(p_email)),trim(p_nome),p_perfil,coalesce(p_permissoes,'{}'::jsonb),v_creator)
  returning token into v_token;
  return v_token;
end;$$;

-- Após criar a conta no Supabase Auth, o convidado informa o código e assume o perfil/permissões do convite.
create or replace function public.imob_aceitar_convite(p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare c public.imob_convites_usuarios%rowtype; v_user uuid; kv record;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  select * into c from public.imob_convites_usuarios where token=p_token and usado=false and expira_em>now() for update;
  if c.id is null then raise exception 'Convite inválido ou expirado'; end if;
  if lower(coalesce(auth.jwt()->>'email',''))<>lower(c.email) then raise exception 'O e-mail da conta não corresponde ao convite'; end if;
  insert into public.imob_usuarios(auth_user_id,imobiliaria_id,nome,email,perfil,ativo)
  values(auth.uid(),c.imobiliaria_id,c.nome,c.email,c.perfil,true)
  returning id into v_user;
  for kv in select key,value from jsonb_each(c.permissoes) loop
    insert into public.imob_permissoes_usuario(usuario_id,imobiliaria_id,modulo,visualizar,cadastrar,editar,excluir)
    values(v_user,c.imobiliaria_id,kv.key,
      coalesce((kv.value->>'visualizar')::boolean,false),coalesce((kv.value->>'cadastrar')::boolean,false),
      coalesce((kv.value->>'editar')::boolean,false),coalesce((kv.value->>'excluir')::boolean,false));
  end loop;
  update public.imob_convites_usuarios set usado=true where id=c.id;
  return true;
end;$$;

grant execute on function public.imob_criar_convite_usuario(text,text,text,jsonb) to authenticated;
grant execute on function public.imob_aceitar_convite(uuid) to authenticated;
