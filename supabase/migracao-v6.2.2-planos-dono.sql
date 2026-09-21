-- Plataforma Imobiliária V6.2.2
-- Gestão comercial de planos + responsável/dono pelo Admin Master

-- Dados comerciais dos planos
alter table public.imob_planos add column if not exists valor_implantacao numeric(12,2) not null default 0;
alter table public.imob_planos add column if not exists limite_usuarios integer;

-- Contato do usuário/responsável
alter table public.imob_usuarios add column if not exists telefone text;

-- Exceções comerciais por cliente: módulos extras ou bloqueados sem criar outro plano.
alter table public.imob_imobiliarias add column if not exists modulos_extras jsonb not null default '[]'::jsonb;
alter table public.imob_imobiliarias add column if not exists modulos_bloqueados jsonb not null default '[]'::jsonb;
alter table public.imob_imobiliarias add column if not exists limite_usuarios_override integer;

-- Transferência segura da função de Dono. Somente Admin Master.
create or replace function public.imob_master_transferir_dono(p_imobiliaria_id uuid,p_novo_dono_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old uuid;
  v_new_imob uuid;
begin
  if not public.imob_is_admin_master() then
    raise exception 'Somente o Admin Master pode transferir o Dono';
  end if;

  select imobiliaria_id into v_new_imob
  from public.imob_usuarios
  where id=p_novo_dono_id and ativo=true;

  if v_new_imob is null or v_new_imob<>p_imobiliaria_id then
    raise exception 'O novo Dono deve ser um usuário ativo da mesma imobiliária';
  end if;

  select id into v_old
  from public.imob_usuarios
  where imobiliaria_id=p_imobiliaria_id
    and perfil in ('dono','admin_imobiliaria')
    and ativo=true
  order by case when perfil='dono' then 0 else 1 end
  limit 1;

  -- O antigo Dono continua como Sócio para não perder o acesso à operação.
  if v_old is not null and v_old<>p_novo_dono_id then
    update public.imob_usuarios set perfil='socio' where id=v_old;
  end if;

  update public.imob_usuarios
  set perfil='dono'
  where id=p_novo_dono_id and imobiliaria_id=p_imobiliaria_id;

  return true;
end;
$$;

grant execute on function public.imob_master_transferir_dono(uuid,uuid) to authenticated;

-- Observação de segurança:
-- O e-mail em public.imob_usuarios é o e-mail cadastral/contato da plataforma.
-- A credencial de login em auth.users não é alterada diretamente pelo frontend.
-- Mudança da credencial deve usar o fluxo oficial do Supabase Auth/Admin API.
