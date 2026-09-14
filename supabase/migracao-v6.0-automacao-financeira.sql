-- Plataforma Imobiliária V6.0 — Automação de cobranças e financeiro
-- Gera cobranças automaticamente a partir dos contratos ativos
-- e cria receita/repasse financeiro quando uma cobrança é paga.

-- Evita duas cobranças para o mesmo contrato e competência.
create unique index if not exists ux_imob_cobrancas_contrato_competencia
on public.imob_cobrancas (contrato_id, competencia);

-- Evita lançamentos financeiros duplicados gerados pela mesma cobrança.
create unique index if not exists ux_imob_financeiro_referencia
on public.imob_financeiro (imobiliaria_id, referencia)
where referencia is not null;

create or replace function public.imob_vencimento_mes(p_competencia date, p_dia integer)
returns date
language sql
immutable
as $$
  select make_date(
    extract(year from p_competencia)::int,
    extract(month from p_competencia)::int,
    least(
      greatest(coalesce(p_dia, 10), 1),
      extract(day from (date_trunc('month', p_competencia) + interval '1 month - 1 day'))::int
    )
  );
$$;

create or replace function public.imob_gerar_cobrancas_contrato(p_contrato_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.imob_contratos%rowtype;
  mes date;
  mes_fim date;
  venc date;
  qtd integer := 0;
begin
  select * into c
  from public.imob_contratos
  where id = p_contrato_id;

  if not found or c.status <> 'ativo' or not c.ativo then
    return 0;
  end if;

  mes := date_trunc('month', c.data_inicio)::date;
  venc := public.imob_vencimento_mes(mes, c.dia_vencimento);

  -- Se o vencimento daquele mês já passou antes do início do contrato,
  -- começa no mês seguinte.
  if venc < c.data_inicio then
    mes := (mes + interval '1 month')::date;
  end if;

  -- Se não houver data fim, deixa 12 competências preparadas.
  mes_fim := date_trunc(
    'month',
    coalesce(c.data_fim, (c.data_inicio + interval '11 months')::date)
  )::date;

  while mes <= mes_fim loop
    venc := public.imob_vencimento_mes(mes, c.dia_vencimento);

    insert into public.imob_cobrancas (
      imobiliaria_id,
      contrato_id,
      competencia,
      data_vencimento,
      valor_base,
      valor_multa,
      valor_juros,
      valor_desconto,
      valor_total,
      status,
      observacoes
    )
    values (
      c.imobiliaria_id,
      c.id,
      mes,
      venc,
      c.valor_aluguel,
      0,
      0,
      0,
      c.valor_aluguel,
      case when venc < current_date then 'vencido' else 'pendente' end,
      'Cobrança gerada automaticamente pelo contrato ' || coalesce(c.codigo, c.id::text)
    )
    on conflict (contrato_id, competencia) do nothing;

    if found then qtd := qtd + 1; end if;
    mes := (mes + interval '1 month')::date;
  end loop;

  return qtd;
end;
$$;

create or replace function public.imob_trigger_gerar_cobrancas_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ativo' and new.ativo then
    perform public.imob_gerar_cobrancas_contrato(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_imob_contrato_gera_cobrancas on public.imob_contratos;
create trigger trg_imob_contrato_gera_cobrancas
after insert or update of status, ativo, data_inicio, data_fim, dia_vencimento, valor_aluguel
on public.imob_contratos
for each row
execute function public.imob_trigger_gerar_cobrancas_contrato();

create or replace function public.imob_atualizar_cobrancas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  qtd integer;
begin
  update public.imob_cobrancas c
  set status = 'vencido', atualizado_em = now()
  where c.status = 'pendente'
    and c.data_vencimento < current_date
    and (
      public.imob_is_admin_master()
      or c.imobiliaria_id = public.imob_current_imobiliaria_id()
    );
  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

grant execute on function public.imob_atualizar_cobrancas_vencidas() to authenticated;

create or replace function public.imob_trigger_baixa_cobranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.imob_contratos%rowtype;
  valor_recebido numeric(14,2);
  taxa numeric(14,2);
  repasse numeric(14,2);
  primeira boolean;
begin
  if new.status = 'pago' and (tg_op = 'INSERT' or old.status is distinct from 'pago') then
    if new.data_pagamento is null then
      new.data_pagamento := now();
    end if;
    if new.valor_pago is null then
      new.valor_pago := new.valor_total;
    end if;

    select * into c from public.imob_contratos where id = new.contrato_id;
    valor_recebido := coalesce(new.valor_pago, new.valor_total, 0);

    select (new.id = x.id)
      into primeira
    from public.imob_cobrancas x
    where x.contrato_id = new.contrato_id
    order by x.data_vencimento asc, x.criado_em asc
    limit 1;

    if coalesce(c.primeira_parcela_imobiliaria,false) and coalesce(primeira,false) then
      insert into public.imob_financeiro (
        imobiliaria_id, contrato_id, cobranca_id, proprietario_id,
        tipo, categoria, descricao, competencia, data_lancamento,
        data_pagamento, valor, status, forma_pagamento, referencia
      ) values (
        new.imobiliaria_id, new.contrato_id, new.id, c.proprietario_id,
        'receita_imobiliaria', 'Primeiro aluguel',
        'Primeiro aluguel - receita integral da imobiliária',
        new.competencia, current_date, current_date,
        valor_recebido, 'pago', new.forma_pagamento,
        'COBRANCA:' || new.id::text || ':RECEITA'
      ) on conflict (imobiliaria_id, referencia) where referencia is not null do nothing;
    else
      taxa := case
        when c.taxa_administracao_tipo = 'fixo' then least(coalesce(c.taxa_administracao_valor,0), valor_recebido)
        else round(valor_recebido * coalesce(c.taxa_administracao_valor,0) / 100.0, 2)
      end;
      repasse := greatest(valor_recebido - taxa, 0);

      insert into public.imob_financeiro (
        imobiliaria_id, contrato_id, cobranca_id, proprietario_id,
        tipo, categoria, descricao, competencia, data_lancamento,
        data_pagamento, valor, status, forma_pagamento, referencia
      ) values (
        new.imobiliaria_id, new.contrato_id, new.id, c.proprietario_id,
        'receita_imobiliaria', 'Taxa de administração',
        'Taxa de administração do aluguel',
        new.competencia, current_date, current_date,
        taxa, 'pago', new.forma_pagamento,
        'COBRANCA:' || new.id::text || ':TAXA'
      ) on conflict (imobiliaria_id, referencia) where referencia is not null do nothing;

      if repasse > 0 then
        insert into public.imob_financeiro (
          imobiliaria_id, contrato_id, cobranca_id, proprietario_id,
          tipo, categoria, descricao, competencia, data_lancamento,
          data_vencimento, valor, status, forma_pagamento, referencia
        ) values (
          new.imobiliaria_id, new.contrato_id, new.id, c.proprietario_id,
          'repasse_proprietario', 'Repasse de aluguel',
          'Repasse líquido ao proprietário',
          new.competencia, current_date, current_date,
          repasse, 'pendente', new.forma_pagamento,
          'COBRANCA:' || new.id::text || ':REPASSE'
        ) on conflict (imobiliaria_id, referencia) where referencia is not null do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_imob_cobranca_baixa_financeiro on public.imob_cobrancas;
create trigger trg_imob_cobranca_baixa_financeiro
before insert or update of status
on public.imob_cobrancas
for each row
execute function public.imob_trigger_baixa_cobranca();

-- Gera as cobranças que estiverem faltando para contratos ativos já existentes.
do $$
declare r record;
begin
  for r in select id from public.imob_contratos where status='ativo' and ativo=true loop
    perform public.imob_gerar_cobrancas_contrato(r.id);
  end loop;
end $$;
