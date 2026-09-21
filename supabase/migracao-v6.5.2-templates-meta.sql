-- Plataforma Imobiliária V6.5.2 — Templates oficiais Meta / WhatsApp
-- Execute após V6.5.1. Não contém tokens ou segredos.

alter table public.imob_comunicacao_modelos
  add column if not exists meta_template_name text,
  add column if not exists meta_template_language text not null default 'pt_BR',
  add column if not exists meta_template_status text not null default 'nao_configurado',
  add column if not exists meta_template_category text not null default 'UTILITY';

do $$ begin
  alter table public.imob_comunicacao_modelos add constraint imob_modelo_meta_status_check
    check(meta_template_status in ('nao_configurado','rascunho','enviado','pendente','aprovado','rejeitado','pausado'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.imob_comunicacao_modelos add constraint imob_modelo_meta_category_check
    check(meta_template_category in ('UTILITY','MARKETING','AUTHENTICATION'));
exception when duplicate_object then null; end $$;

alter table public.imob_comunicacoes
  add column if not exists tipo_envio text not null default 'livre',
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists template_components jsonb;

do $$ begin
  alter table public.imob_comunicacoes add constraint imob_comunicacoes_tipo_envio_check
    check(tipo_envio in ('livre','template'));
exception when duplicate_object then null; end $$;

-- Nomes sugeridos, estáveis e únicos por evento. A aprovação final ocorre na Meta.
update public.imob_comunicacao_modelos
set meta_template_name = case evento
  when 'antes_5' then 'cobranca_5_dias_antes'
  when 'antes_3' then 'cobranca_3_dias_antes'
  when 'vence_hoje' then 'cobranca_vence_hoje'
  when 'atraso_1' then 'cobranca_atraso_1_dia'
  when 'atraso_3' then 'cobranca_atraso_3_dias'
  when 'atraso_5' then 'cobranca_atraso_5_dias'
  when 'atraso_10' then 'cobranca_atraso_10_dias'
  when 'atraso_15' then 'cobranca_atraso_15_dias'
  when 'atraso_30' then 'cobranca_atraso_30_dias'
  else 'cobranca_'||regexp_replace(lower(evento),'[^a-z0-9_]+','_','g') end,
    meta_template_language=coalesce(nullif(meta_template_language,''),'pt_BR'),
    meta_template_category='UTILITY'
where canal='whatsapp' and meta_template_name is null;

-- Corrige a policy da V6.5.1: imob_usuarios.id é o id interno; auth_user_id é o vínculo com Supabase Auth.
drop policy if exists imob_whatsapp_canais_owner_update on public.imob_whatsapp_canais;
create policy imob_whatsapp_canais_owner_update on public.imob_whatsapp_canais for update to authenticated
using (
  imobiliaria_id=public.imob_current_imobiliaria_id()
  and exists(
    select 1 from public.imob_usuarios u
    where u.auth_user_id=auth.uid()
      and u.imobiliaria_id=imob_whatsapp_canais.imobiliaria_id
      and u.ativo=true
      and u.perfil in ('admin_imobiliaria','dono')
  )
)
with check (
  imobiliaria_id=public.imob_current_imobiliaria_id()
  and exists(
    select 1 from public.imob_usuarios u
    where u.auth_user_id=auth.uid()
      and u.imobiliaria_id=imob_whatsapp_canais.imobiliaria_id
      and u.ativo=true
      and u.perfil in ('admin_imobiliaria','dono')
  )
);

-- Novos eventos passam a registrar o snapshot do template configurado.
create or replace function public.imob_enfileirar_comunicacao_evento()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; m record; v_dest text; v_status text; v_dias integer;
begin
  select coalesce(iq.nome,'Inquilino') inquilino, iq.telefone, iq.email,
         coalesce(cb.valor_total,cb.valor_base,0) valor, cb.data_vencimento,
         coalesce(ct.codigo,'Contrato') contrato, coalesce(im.nome_fantasia,im.nome,'Imobiliária') imobiliaria
  into r
  from public.imob_cobrancas cb
  join public.imob_contratos ct on ct.id=cb.contrato_id
  left join public.imob_inquilinos iq on iq.id=ct.inquilino_id
  join public.imob_imobiliarias im on im.id=cb.imobiliaria_id
  where cb.id=new.cobranca_id;
  if not found then return new; end if;
  v_dias := abs(coalesce((new.detalhes->>'dias')::integer,0));

  for m in select * from public.imob_comunicacao_modelos
           where imobiliaria_id=new.imobiliaria_id and evento=new.evento and ativo=true
  loop
    v_dest := case when m.canal='whatsapp' then r.telefone else r.email end;
    v_status := case when nullif(trim(coalesce(v_dest,'')),'') is null then 'sem_destinatario' else 'pendente' end;
    insert into public.imob_comunicacoes(imobiliaria_id,evento_id,cobranca_id,contrato_id,modelo_id,evento,canal,
      destinatario_nome,destinatario,assunto,mensagem,status,tipo_envio,template_name,template_language)
    values(new.imobiliaria_id,new.id,new.cobranca_id,new.contrato_id,m.id,new.evento,m.canal,
      r.inquilino,v_dest,
      public.imob_render_comunicacao(m.assunto,r.inquilino,r.valor,r.data_vencimento,v_dias,r.contrato,r.imobiliaria),
      public.imob_render_comunicacao(m.mensagem,r.inquilino,r.valor,r.data_vencimento,v_dias,r.contrato,r.imobiliaria),v_status,
      case when m.canal='whatsapp' then 'template' else 'livre' end,
      case when m.canal='whatsapp' then m.meta_template_name else null end,
      case when m.canal='whatsapp' then m.meta_template_language else null end)
    on conflict(evento_id,canal) do nothing;
  end loop;
  return new;
end $$;

-- Atualiza filas WhatsApp ainda pendentes para o template atual, sem alterar itens já enviados.
update public.imob_comunicacoes c
set tipo_envio='template', template_name=m.meta_template_name, template_language=m.meta_template_language, atualizado_em=now()
from public.imob_comunicacao_modelos m
where c.modelo_id=m.id and c.canal='whatsapp' and c.status='pendente';

grant update(meta_template_name,meta_template_language,meta_template_status,meta_template_category) on public.imob_comunicacao_modelos to authenticated;
comment on table public.imob_comunicacoes is 'V6.5.2: fila de comunicação com snapshot de template Meta para WhatsApp.';
