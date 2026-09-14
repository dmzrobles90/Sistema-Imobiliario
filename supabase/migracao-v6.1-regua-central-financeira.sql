-- Plataforma Imobiliária V6.1 — Régua de cobrança + Central Financeira
-- Execute após a migração V6.0.
-- A régua é processada quando o sistema abre e pelo botão "Atualizar régua".

-- Chave técnica para evitar alertas duplicados da mesma etapa.
alter table public.imob_notificacoes
  add column if not exists chave text;

create unique index if not exists ux_imob_notificacoes_imobiliaria_chave
on public.imob_notificacoes (imobiliaria_id, chave)
where chave is not null;

-- Processa vencimentos e gera alertas para cobrança e repasse.
create or replace function public.imob_processar_regua_financeira()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  f record;
  dias integer;
  etapa text;
  titulo text;
  mensagem text;
  chave_notif text;
  qtd_cobrancas integer := 0;
  qtd_repasses integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  -- Atualiza cobranças pendentes que já venceram.
  update public.imob_cobrancas x
     set status = 'vencido', atualizado_em = now()
   where x.status = 'pendente'
     and x.data_vencimento < current_date
     and (
       public.imob_is_admin_master()
       or x.imobiliaria_id = public.imob_current_imobiliaria_id()
     );

  -- Cobranças abertas: pré-vencimento, hoje e faixas de atraso.
  for c in
    select x.id, x.imobiliaria_id, x.contrato_id, x.data_vencimento,
           coalesce(x.valor_total, x.valor_base, 0) as valor,
           x.status,
           ct.codigo as contrato_codigo,
           iq.nome as inquilino_nome
      from public.imob_cobrancas x
      left join public.imob_contratos ct on ct.id = x.contrato_id
      left join public.imob_inquilinos iq on iq.id = ct.inquilino_id
     where x.status in ('pendente','vencido','parcial')
       and x.data_vencimento <= current_date + 5
       and (
         public.imob_is_admin_master()
         or x.imobiliaria_id = public.imob_current_imobiliaria_id()
       )
  loop
    dias := c.data_vencimento - current_date;
    etapa := null;

    if dias between 1 and 5 then
      etapa := 'pre_vencimento';
      titulo := 'Cobrança próxima do vencimento';
      mensagem := coalesce(c.inquilino_nome,'Inquilino') || ' · ' ||
                  coalesce(c.contrato_codigo,'Contrato') || ' · vence em ' || dias ||
                  case when dias = 1 then ' dia.' else ' dias.' end;
    elsif dias = 0 then
      etapa := 'vence_hoje';
      titulo := 'Cobrança vence hoje';
      mensagem := coalesce(c.inquilino_nome,'Inquilino') || ' · ' ||
                  coalesce(c.contrato_codigo,'Contrato') || ' · vencimento hoje.';
    elsif dias = -1 then
      etapa := 'atraso_1';
      titulo := 'Cobrança com 1 dia de atraso';
      mensagem := coalesce(c.inquilino_nome,'Inquilino') || ' · ' ||
                  coalesce(c.contrato_codigo,'Contrato') || ' · iniciar aviso de atraso.';
    elsif dias <= -10 then
      etapa := 'atraso_10';
      titulo := 'Cobrança crítica: 10+ dias de atraso';
      mensagem := coalesce(c.inquilino_nome,'Inquilino') || ' · ' ||
                  coalesce(c.contrato_codigo,'Contrato') || ' · escalonar cobrança.';
    elsif dias <= -3 then
      etapa := 'atraso_3';
      titulo := 'Cobrança com 3+ dias de atraso';
      mensagem := coalesce(c.inquilino_nome,'Inquilino') || ' · ' ||
                  coalesce(c.contrato_codigo,'Contrato') || ' · realizar nova cobrança.';
    elsif dias < 0 then
      etapa := 'atraso_inicial';
      titulo := 'Cobrança em atraso';
      mensagem := coalesce(c.inquilino_nome,'Inquilino') || ' · ' ||
                  coalesce(c.contrato_codigo,'Contrato') || ' · verificar contato.';
    end if;

    if etapa is not null then
      chave_notif := 'COBRANCA:' || c.id::text || ':' || etapa;

      -- Mantém apenas a etapa atual como pendência visível.
      update public.imob_notificacoes n
         set lida = true, lida_em = coalesce(n.lida_em, now())
       where n.imobiliaria_id = c.imobiliaria_id
         and n.modulo = 'cobrancas'
         and n.referencia_id = c.id
         and n.lida = false
         and coalesce(n.chave,'') <> chave_notif;

      insert into public.imob_notificacoes
        (imobiliaria_id, usuario_id, titulo, mensagem, tipo, modulo,
         referencia_id, lida, chave)
      values
        (c.imobiliaria_id, null, titulo, mensagem,
         case when dias < 0 then 'atencao' else 'info' end,
         'cobrancas', c.id, false, chave_notif)
      on conflict (imobiliaria_id, chave) where chave is not null do nothing;

      qtd_cobrancas := qtd_cobrancas + 1;
    end if;
  end loop;

  -- Cobranças encerradas não devem manter alerta de atraso pendente.
  update public.imob_notificacoes n
     set lida = true, lida_em = coalesce(n.lida_em, now())
   where n.modulo = 'cobrancas'
     and n.lida = false
     and n.referencia_id in (
       select x.id from public.imob_cobrancas x
        where x.status in ('pago','cancelado')
          and (public.imob_is_admin_master()
               or x.imobiliaria_id = public.imob_current_imobiliaria_id())
     )
     and coalesce(n.chave,'') not like '%:PAGO';

  -- Repasses aos proprietários pendentes.
  for f in
    select x.id, x.imobiliaria_id, x.proprietario_id, x.data_vencimento,
           x.valor, p.nome as proprietario_nome
      from public.imob_financeiro x
      left join public.imob_proprietarios p on p.id = x.proprietario_id
     where x.tipo = 'repasse_proprietario'
       and x.status = 'pendente'
       and (
         public.imob_is_admin_master()
         or x.imobiliaria_id = public.imob_current_imobiliaria_id()
       )
  loop
    dias := coalesce(f.data_vencimento, current_date) - current_date;
    etapa := case when dias < 0 then 'repasse_atrasado' else 'repasse_pendente' end;
    chave_notif := 'REPASSE:' || f.id::text || ':' || etapa;
    titulo := case when dias < 0 then 'Repasse ao proprietário em atraso' else 'Repasse ao proprietário pendente' end;
    mensagem := coalesce(f.proprietario_nome,'Proprietário') || ' · repasse de R$ ' ||
                trim(to_char(coalesce(f.valor,0), 'FM999G999G990D00')) || ' pendente.';

    update public.imob_notificacoes n
       set lida = true, lida_em = coalesce(n.lida_em, now())
     where n.imobiliaria_id = f.imobiliaria_id
       and n.modulo = 'financeiro'
       and n.referencia_id = f.id
       and n.lida = false
       and coalesce(n.chave,'') <> chave_notif;

    insert into public.imob_notificacoes
      (imobiliaria_id, usuario_id, titulo, mensagem, tipo, modulo,
       referencia_id, lida, chave)
    values
      (f.imobiliaria_id, null, titulo, mensagem,
       case when dias < 0 then 'atencao' else 'info' end,
       'financeiro', f.id, false, chave_notif)
    on conflict (imobiliaria_id, chave) where chave is not null do nothing;

    qtd_repasses := qtd_repasses + 1;
  end loop;

  -- Repasses já pagos/cancelados não deixam alerta pendente.
  update public.imob_notificacoes n
     set lida = true, lida_em = coalesce(n.lida_em, now())
   where n.modulo = 'financeiro'
     and n.lida = false
     and n.referencia_id in (
       select x.id from public.imob_financeiro x
        where x.tipo = 'repasse_proprietario'
          and x.status in ('pago','cancelado')
          and (public.imob_is_admin_master()
               or x.imobiliaria_id = public.imob_current_imobiliaria_id())
     )
     and coalesce(n.chave,'') not like '%:PAGO';

  return jsonb_build_object(
    'cobrancas_monitoradas', qtd_cobrancas,
    'repasses_monitorados', qtd_repasses,
    'processado_em', now()
  );
end;
$$;

grant execute on function public.imob_processar_regua_financeira() to authenticated;

-- Notificação imediata quando uma cobrança é paga.
create or replace function public.imob_notificar_pagamento_cobranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  codigo text;
  nome_inquilino text;
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    select ct.codigo, iq.nome
      into codigo, nome_inquilino
      from public.imob_contratos ct
      left join public.imob_inquilinos iq on iq.id = ct.inquilino_id
     where ct.id = new.contrato_id;

    update public.imob_notificacoes
       set lida = true, lida_em = coalesce(lida_em, now())
     where imobiliaria_id = new.imobiliaria_id
       and modulo = 'cobrancas'
       and referencia_id = new.id
       and lida = false;

    insert into public.imob_notificacoes
      (imobiliaria_id, usuario_id, titulo, mensagem, tipo, modulo,
       referencia_id, lida, chave)
    values
      (new.imobiliaria_id, null, 'Pagamento recebido',
       coalesce(nome_inquilino,'Inquilino') || ' · ' || coalesce(codigo,'Contrato') ||
       ' · ' || trim(to_char(coalesce(new.valor_pago,new.valor_total,0), 'FML999G999G990D00')),
       'sucesso', 'financeiro', new.id, false,
       'COBRANCA:' || new.id::text || ':PAGO')
    on conflict (imobiliaria_id, chave) where chave is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_imob_notificar_pagamento_cobranca on public.imob_cobrancas;
create trigger trg_imob_notificar_pagamento_cobranca
after update of status on public.imob_cobrancas
for each row execute function public.imob_notificar_pagamento_cobranca();

-- Notificação imediata quando o repasse é confirmado.
create or replace function public.imob_notificar_repasse_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nome_prop text;
begin
  if new.tipo = 'repasse_proprietario'
     and new.status = 'pago'
     and old.status is distinct from 'pago' then
    select nome into nome_prop from public.imob_proprietarios where id = new.proprietario_id;

    update public.imob_notificacoes
       set lida = true, lida_em = coalesce(lida_em, now())
     where imobiliaria_id = new.imobiliaria_id
       and modulo = 'financeiro'
       and referencia_id = new.id
       and lida = false;

    insert into public.imob_notificacoes
      (imobiliaria_id, usuario_id, titulo, mensagem, tipo, modulo,
       referencia_id, lida, chave)
    values
      (new.imobiliaria_id, null, 'Repasse confirmado',
       coalesce(nome_prop,'Proprietário') || ' · ' ||
       trim(to_char(coalesce(new.valor,0), 'FML999G999G990D00')),
       'sucesso', 'financeiro', new.id, false,
       'REPASSE:' || new.id::text || ':PAGO')
    on conflict (imobiliaria_id, chave) where chave is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_imob_notificar_repasse_pago on public.imob_financeiro;
create trigger trg_imob_notificar_repasse_pago
after update of status on public.imob_financeiro
for each row execute function public.imob_notificar_repasse_pago();

-- A primeira execução ocorrerá automaticamente ao abrir a Plataforma Imobiliária V6.1.
