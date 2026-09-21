-- Plataforma Imobiliária V6.2.4
-- Anexos específicos para Financeiro, Vistorias e Manutenções.

alter table public.imob_documentos
  add column if not exists financeiro_id uuid references public.imob_financeiro(id) on delete cascade,
  add column if not exists vistoria_id uuid references public.imob_vistorias(id) on delete cascade,
  add column if not exists manutencao_id uuid references public.imob_manutencoes(id) on delete cascade;

create index if not exists idx_imob_documentos_financeiro_id on public.imob_documentos(financeiro_id);
create index if not exists idx_imob_documentos_vistoria_id on public.imob_documentos(vistoria_id);
create index if not exists idx_imob_documentos_manutencao_id on public.imob_documentos(manutencao_id);

-- Remove apenas constraints CHECK antigas que envolvam tipo_vinculo, independentemente do nome usado na criação original.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.imob_documentos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo_vinculo%'
  loop
    execute format('alter table public.imob_documentos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.imob_documentos
  add constraint imob_documentos_tipo_vinculo_check
  check (tipo_vinculo in ('imovel','proprietario','inquilino','contrato','financeiro','vistoria','manutencao','geral')),
  add constraint imob_documentos_referencia_check
  check (
    (tipo_vinculo='imovel' and imovel_id is not null) or
    (tipo_vinculo='proprietario' and proprietario_id is not null) or
    (tipo_vinculo='inquilino' and inquilino_id is not null) or
    (tipo_vinculo='contrato' and contrato_id is not null) or
    (tipo_vinculo='financeiro' and financeiro_id is not null) or
    (tipo_vinculo='vistoria' and vistoria_id is not null) or
    (tipo_vinculo='manutencao' and manutencao_id is not null) or
    (tipo_vinculo='geral')
  );

-- A RLS existente de imob_documentos continua válida porque o isolamento é feito por imobiliaria_id.
