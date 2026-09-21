-- Plataforma Imobiliária V6.4 — Central de Automações
-- Corrige definitivamente o motor V6.3.1 e habilita controle seguro pelo Dono.

-- Dono/Admin da imobiliária pode atualizar apenas a própria configuração.
drop policy if exists imob_auto_config_update on public.imob_automacao_config;
create policy imob_auto_config_update on public.imob_automacao_config
for update to authenticated
using (
  public.imob_is_admin_master()
  or exists (
    select 1 from public.imob_usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
      and u.imobiliaria_id = imob_automacao_config.imobiliaria_id
      and u.perfil in ('admin_imobiliaria','dono')
  )
)
with check (
  public.imob_is_admin_master()
  or exists (
    select 1 from public.imob_usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
      and u.imobiliaria_id = imob_automacao_config.imobiliaria_id
      and u.perfil in ('admin_imobiliaria','dono')
  )
);

-- Motor interno parametrizado. NULL = todas as imobiliárias (cron).
create or replace function public.imob_motor_automatico_cobrancas_interno(p_imobiliaria_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  cfg record;
  v_contrato record;
  c record;
  exec_id uuid;
  geradas integer;
  total_geradas integer := 0;
  vencidas integer := 0;
  total_vencidas integer := 0;
  eventos integer := 0;
  total_eventos integer := 0;
  delta integer;
  etapa text;
  chave_evt text;
  titulo text;
  mensagem text;
begin
  for cfg in
    select ac.*
    from public.imob_automacao_config ac
    join public.imob_imobiliarias i on i.id=ac.imobiliaria_id
    where i.status='ativo'
      and ac.regua_cobranca_ativa=true
      and (p_imobiliaria_id is null or ac.imobiliaria_id=p_imobiliaria_id)
  loop
    geradas := 0; vencidas := 0; eventos := 0;
    insert into public.imob_automacao_execucoes(imobiliaria_id,detalhes)
    values(cfg.imobiliaria_id,jsonb_build_object('executado_por',case when p_imobiliaria_id is null then 'backend' else 'manual' end,'data',current_date))
    returning id into exec_id;

    begin
      if cfg.gerar_cobrancas_automaticamente then
        for v_contrato in
          select contratos.id as contrato_id
          from public.imob_contratos contratos
          where contratos.imobiliaria_id=cfg.imobiliaria_id
            and contratos.status='ativo' and contratos.ativo=true
        loop
          geradas := geradas + public.imob_gerar_cobrancas_contrato(v_contrato.contrato_id);
        end loop;
      end if;

      update public.imob_cobrancas
      set status='vencido', atualizado_em=now()
      where imobiliaria_id=cfg.imobiliaria_id
        and status='pendente' and data_vencimento < current_date;
      get diagnostics vencidas = row_count;

      for c in
        select cb.id, cb.imobiliaria_id, cb.contrato_id, cb.data_vencimento,
               cb.status, coalesce(cb.valor_total,cb.valor_base,0) valor,
               coalesce(iq.nome,'Inquilino') inquilino_nome,
               coalesce(contrato.codigo,'Contrato') contrato_codigo
        from public.imob_cobrancas cb
        join public.imob_contratos contrato on contrato.id=cb.contrato_id
        left join public.imob_inquilinos iq on iq.id=contrato.inquilino_id
        where cb.imobiliaria_id=cfg.imobiliaria_id
          and cb.status in ('pendente','vencido','parcial')
      loop
        delta := c.data_vencimento - current_date;
        etapa := null;
        if delta = 0 then etapa := 'vence_hoje';
        elsif delta > 0 and delta = any(cfg.dias_antes) then etapa := 'antes_'||delta::text;
        elsif delta < 0 and abs(delta) = any(cfg.dias_atraso) then etapa := 'atraso_'||abs(delta)::text;
        end if;

        if etapa is not null then
          chave_evt := 'REGUA:'||c.id::text||':'||etapa||':'||current_date::text;
          insert into public.imob_automacao_eventos
            (imobiliaria_id,cobranca_id,contrato_id,evento,data_referencia,chave,detalhes)
          values
            (c.imobiliaria_id,c.id,c.contrato_id,etapa,current_date,chave_evt,
             jsonb_build_object('vencimento',c.data_vencimento,'valor',c.valor,'dias',delta))
          on conflict(chave) do nothing;

          if found then
            eventos := eventos + 1;
            if delta > 0 then
              titulo := 'Lembrete: cobrança vence em '||delta||case when delta=1 then ' dia' else ' dias' end;
              mensagem := c.inquilino_nome||' · '||c.contrato_codigo||' · vencimento '||to_char(c.data_vencimento,'DD/MM/YYYY')||'.';
            elsif delta = 0 then
              titulo := 'Cobrança vence hoje';
              mensagem := c.inquilino_nome||' · '||c.contrato_codigo||' · vencimento hoje.';
            else
              titulo := 'Cobrança com '||abs(delta)||case when abs(delta)=1 then ' dia' else ' dias' end||' de atraso';
              mensagem := c.inquilino_nome||' · '||c.contrato_codigo||' · cobrança pendente.';
            end if;

            insert into public.imob_notificacoes
              (imobiliaria_id,usuario_id,titulo,mensagem,tipo,modulo,referencia_id,lida,chave)
            values
              (c.imobiliaria_id,null,titulo,mensagem,
               case when delta<0 then 'atencao' else 'info' end,
               'cobrancas',c.id,false,'AUTO:'||c.id::text||':'||etapa||':'||current_date::text)
            on conflict (imobiliaria_id,chave) where chave is not null do nothing;
          end if;
        end if;
      end loop;

      update public.imob_automacao_execucoes
      set fim_em=now(), status='sucesso', cobrancas_geradas=geradas,
          cobrancas_vencidas=vencidas, eventos_gerados=eventos,
          erro=null,
          detalhes=jsonb_build_object('executado_por',case when p_imobiliaria_id is null then 'backend' else 'manual' end,'data',current_date)
      where id=exec_id;
      total_geradas := total_geradas + geradas;
      total_vencidas := total_vencidas + vencidas;
      total_eventos := total_eventos + eventos;
    exception when others then
      update public.imob_automacao_execucoes
      set fim_em=now(), status='erro', erro=sqlerrm where id=exec_id;
    end;
  end loop;

  return jsonb_build_object('cobrancas_geradas',total_geradas,'cobrancas_vencidas',total_vencidas,
    'eventos_gerados',total_eventos,'processado_em',now());
end $$;

-- Mantém o nome usado pelo pg_cron.
create or replace function public.imob_motor_automatico_cobrancas()
returns jsonb language sql security definer set search_path=public
as $$ select public.imob_motor_automatico_cobrancas_interno(null); $$;

-- RPC segura para o botão "Executar agora" do Dono.
create or replace function public.imob_executar_automacao_agora()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_imobiliaria_id uuid;
  v_perfil text;
begin
  select u.imobiliaria_id,u.perfil into v_imobiliaria_id,v_perfil
  from public.imob_usuarios u
  where u.auth_user_id=auth.uid() and u.ativo=true
  limit 1;

  if v_imobiliaria_id is null or v_perfil not in ('admin_imobiliaria','dono') then
    raise exception 'Somente o Dono pode executar as automações manualmente.';
  end if;

  return public.imob_motor_automatico_cobrancas_interno(v_imobiliaria_id);
end $$;

revoke all on function public.imob_motor_automatico_cobrancas_interno(uuid) from public, anon, authenticated;
revoke all on function public.imob_motor_automatico_cobrancas() from public, anon, authenticated;
revoke all on function public.imob_executar_automacao_agora() from public, anon;
grant execute on function public.imob_motor_automatico_cobrancas_interno(uuid) to postgres, service_role;
grant execute on function public.imob_motor_automatico_cobrancas() to postgres, service_role;
grant execute on function public.imob_executar_automacao_agora() to authenticated;

-- Mantém o agendamento diário às 06:05 de Brasília (09:05 UTC).
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='imob-motor-cobrancas-diario';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('imob-motor-cobrancas-diario','5 9 * * *','select public.imob_motor_automatico_cobrancas();');
end $$;
