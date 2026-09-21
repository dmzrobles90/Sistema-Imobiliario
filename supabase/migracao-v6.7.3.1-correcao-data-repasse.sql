-- Plataforma Imobiliária V6.7.3.1 — Correção da data prevista de repasse
-- Corrige repasses pendentes e garante que novos repasses usem:
-- data do recebimento + prazo_repasse_dias do contrato.
begin;

create or replace function public.imob_cobranca_baixa_financeiro()
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
  dt_recebimento date;
  dt_repasse date;
begin
  if new.status = 'pago' and (tg_op = 'INSERT' or old.status is distinct from 'pago') then
    if new.data_pagamento is null then new.data_pagamento := now(); end if;
    if new.valor_pago is null then new.valor_pago := new.valor_total; end if;

    select * into c from public.imob_contratos where id = new.contrato_id;
    if not found then raise exception 'Contrato não encontrado para a cobrança %', new.id; end if;

    valor_recebido := coalesce(new.valor_pago, new.valor_total, 0);
    dt_recebimento := coalesce(new.data_pagamento::date, current_date);
    dt_repasse := dt_recebimento + greatest(coalesce(c.prazo_repasse_dias,0),0);

    select (new.id = x.id) into primeira
    from public.imob_cobrancas x
    where x.contrato_id = new.contrato_id
    order by x.data_vencimento asc, x.criado_em asc limit 1;

    if coalesce(c.primeira_parcela_imobiliaria,false) and coalesce(primeira,false) then
      insert into public.imob_financeiro (
        imobiliaria_id, contrato_id, cobranca_id, proprietario_id,
        tipo, categoria, descricao, competencia, data_lancamento,
        data_pagamento, valor, status, forma_pagamento, referencia
      ) values (
        new.imobiliaria_id, new.contrato_id, new.id, c.proprietario_id,
        'receita_imobiliaria', 'Primeiro aluguel','Primeiro aluguel - receita integral da imobiliária',
        new.competencia, current_date, dt_recebimento,
        valor_recebido, 'pago', new.forma_pagamento,
        'COBRANCA:' || new.id::text || ':RECEITA'
      ) on conflict (imobiliaria_id, referencia) where referencia is not null do nothing;
    else
      taxa := case when c.taxa_administracao_tipo='fixo'
        then least(coalesce(c.taxa_administracao_valor,0),valor_recebido)
        else round(valor_recebido*coalesce(c.taxa_administracao_valor,0)/100.0,2) end;
      repasse := greatest(valor_recebido-taxa,0);

      insert into public.imob_financeiro (
        imobiliaria_id, contrato_id, cobranca_id, proprietario_id,
        tipo, categoria, descricao, competencia, data_lancamento,
        data_pagamento, valor, status, forma_pagamento, referencia
      ) values (
        new.imobiliaria_id,new.contrato_id,new.id,c.proprietario_id,
        'receita_imobiliaria','Taxa de administração','Taxa de administração do aluguel',
        new.competencia,current_date,dt_recebimento,taxa,'pago',new.forma_pagamento,
        'COBRANCA:'||new.id::text||':TAXA'
      ) on conflict (imobiliaria_id, referencia) where referencia is not null do nothing;

      if repasse > 0 then
        insert into public.imob_financeiro (
          imobiliaria_id, contrato_id, cobranca_id, proprietario_id,
          tipo, categoria, descricao, competencia, data_lancamento,
          data_vencimento, data_prevista_repasse, valor, status, forma_pagamento, referencia
        ) values (
          new.imobiliaria_id,new.contrato_id,new.id,c.proprietario_id,
          'repasse_proprietario','Repasse de aluguel','Repasse líquido ao proprietário',
          new.competencia,current_date,dt_repasse,dt_repasse,repasse,'pendente',new.forma_pagamento,
          'COBRANCA:'||new.id::text||':REPASSE'
        ) on conflict (imobiliaria_id, referencia) where referencia is not null do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Recalcula somente repasses ainda pendentes usando o pagamento real da cobrança
-- e o prazo atualmente configurado no contrato.
update public.imob_financeiro f
set data_prevista_repasse = c.data_pagamento::date + greatest(coalesce(ct.prazo_repasse_dias,0),0),
    data_vencimento = c.data_pagamento::date + greatest(coalesce(ct.prazo_repasse_dias,0),0),
    atualizado_em = now()
from public.imob_cobrancas c
join public.imob_contratos ct on ct.id = c.contrato_id
where f.tipo='repasse_proprietario'
  and f.status='pendente'
  and f.cobranca_id=c.id
  and c.data_pagamento is not null;

commit;
