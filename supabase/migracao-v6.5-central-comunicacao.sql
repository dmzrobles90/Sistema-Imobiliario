-- Plataforma Imobiliária V6.5 - Central de Comunicação
-- Cria modelos por evento/canal e fila de comunicações. Nesta versão NÃO há envio externo.

create table if not exists public.imob_comunicacao_modelos (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  evento text not null,
  canal text not null check (canal in ('whatsapp','email')),
  ativo boolean not null default true,
  assunto text,
  mensagem text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(imobiliaria_id,evento,canal)
);

create table if not exists public.imob_comunicacoes (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid not null references public.imob_imobiliarias(id) on delete cascade,
  evento_id uuid references public.imob_automacao_eventos(id) on delete set null,
  cobranca_id uuid references public.imob_cobrancas(id) on delete set null,
  contrato_id uuid references public.imob_contratos(id) on delete set null,
  modelo_id uuid references public.imob_comunicacao_modelos(id) on delete set null,
  evento text not null,
  canal text not null check (canal in ('whatsapp','email')),
  destinatario_nome text,
  destinatario text,
  assunto text,
  mensagem text not null,
  status text not null default 'pendente' check (status in ('pendente','enviada','erro','cancelada','sem_destinatario')),
  tentativas integer not null default 0,
  enviado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(evento_id,canal)
);

alter table public.imob_comunicacao_modelos enable row level security;
alter table public.imob_comunicacoes enable row level security;

drop policy if exists imob_comunicacao_modelos_tenant on public.imob_comunicacao_modelos;
create policy imob_comunicacao_modelos_tenant on public.imob_comunicacao_modelos
for all to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id())
with check (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

drop policy if exists imob_comunicacoes_tenant on public.imob_comunicacoes;
create policy imob_comunicacoes_tenant on public.imob_comunicacoes
for select to authenticated
using (public.imob_is_admin_master() or imobiliaria_id=public.imob_current_imobiliaria_id());

-- Modelos padrão. O Dono poderá editar o texto pela plataforma.
with eventos(evento) as (values
 ('antes_5'),('antes_3'),('vence_hoje'),('atraso_1'),('atraso_3'),('atraso_5'),('atraso_10'),('atraso_15'),('atraso_30')
), canais(canal) as (values ('whatsapp'),('email'))
insert into public.imob_comunicacao_modelos(imobiliaria_id,evento,canal,assunto,mensagem)
select i.id,e.evento,c.canal,
  case when c.canal='email' then 'Aviso de cobrança - {imobiliaria}' else null end,
  case
    when e.evento like 'antes_%' then 'Olá, {inquilino}. Seu aluguel no valor de {valor} vence em {dias} dia(s), em {vencimento}. {imobiliaria}'
    when e.evento='vence_hoje' then 'Olá, {inquilino}. Seu aluguel no valor de {valor} vence hoje, {vencimento}. {imobiliaria}'
    else 'Olá, {inquilino}. Identificamos que o aluguel de {valor}, com vencimento em {vencimento}, permanece pendente há {dias} dia(s). Caso já tenha realizado o pagamento, desconsidere. {imobiliaria}'
  end
from public.imob_imobiliarias i cross join eventos e cross join canais c
on conflict(imobiliaria_id,evento,canal) do nothing;

create or replace function public.imob_render_comunicacao(p_texto text,p_inquilino text,p_valor numeric,p_vencimento date,p_dias integer,p_contrato text,p_imobiliaria text)
returns text language sql immutable as $$
 select replace(replace(replace(replace(replace(replace(coalesce(p_texto,''),
   '{inquilino}',coalesce(p_inquilino,'')),
   '{valor}','R$ '||replace(to_char(coalesce(p_valor,0),'FM999G999G990D00'),'.',',')),
   '{vencimento}',coalesce(to_char(p_vencimento,'DD/MM/YYYY'),'')),
   '{dias}',coalesce(p_dias,0)::text),
   '{contrato}',coalesce(p_contrato,'')),
   '{imobiliaria}',coalesce(p_imobiliaria,''));
$$;

create or replace function public.imob_enfileirar_comunicacao_evento()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  r record;
  m record;
  v_dest text;
  v_status text;
  v_dias integer;
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
      destinatario_nome,destinatario,assunto,mensagem,status)
    values(new.imobiliaria_id,new.id,new.cobranca_id,new.contrato_id,m.id,new.evento,m.canal,
      r.inquilino,v_dest,
      public.imob_render_comunicacao(m.assunto,r.inquilino,r.valor,r.data_vencimento,v_dias,r.contrato,r.imobiliaria),
      public.imob_render_comunicacao(m.mensagem,r.inquilino,r.valor,r.data_vencimento,v_dias,r.contrato,r.imobiliaria),v_status)
    on conflict(evento_id,canal) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists trg_imob_enfileirar_comunicacao on public.imob_automacao_eventos;
create trigger trg_imob_enfileirar_comunicacao
after insert on public.imob_automacao_eventos
for each row execute function public.imob_enfileirar_comunicacao_evento();

-- Permite ao Dono editar modelos, mas não fabricar status de envio pelo navegador.
revoke all on public.imob_comunicacao_modelos from anon;
revoke all on public.imob_comunicacoes from anon;
grant select,insert,update on public.imob_comunicacao_modelos to authenticated;
grant select on public.imob_comunicacoes to authenticated;

-- Registra versão sem disparar qualquer comunicação externa.
comment on table public.imob_comunicacoes is 'V6.5: fila interna de comunicação; envio externo ainda não habilitado.';
