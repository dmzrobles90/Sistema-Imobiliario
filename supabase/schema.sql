-- ZAMAR GESTÃO / Plataforma multi-imobiliária
-- Execute no SQL Editor do Supabase em um projeto novo.
create extension if not exists pgcrypto;

create type public.perfil_usuario as enum ('admin_master','admin_imobiliaria','corretor','financeiro','proprietario','inquilino');
create type public.finalidade_imovel as enum ('venda','locacao','venda_locacao');
create type public.status_imovel as enum ('disponivel','reservado','alugado','vendido','inativo');

create table public.imobiliarias (
 id uuid primary key default gen_random_uuid(),
 nome text not null,
 slug text unique not null,
 razao_social text,
 cnpj text,
 creci text,
 slogan text,
 logo_url text,
 cor_primaria text default '#FFE600',
 cor_secundaria text default '#111111',
 ativa boolean not null default true,
 created_at timestamptz not null default now()
);

create table public.perfis (
 id uuid primary key references auth.users(id) on delete cascade,
 imobiliaria_id uuid references public.imobiliarias(id) on delete cascade,
 nome text,
 perfil public.perfil_usuario not null default 'corretor',
 ativo boolean not null default true,
 created_at timestamptz not null default now()
);

create table public.proprietarios (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 nome text not null,
 cpf_cnpj text,
 telefone text,
 email text,
 banco text,
 agencia text,
 conta text,
 chave_pix text,
 observacoes text,
 created_at timestamptz not null default now()
);

create table public.imoveis (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 proprietario_id uuid references public.proprietarios(id) on delete set null,
 codigo text not null,
 titulo text not null,
 finalidade public.finalidade_imovel not null,
 status public.status_imovel not null default 'disponivel',
 tipo text,
 cep text,endereco text,numero text,complemento text,bairro text,cidade text,uf text,
 valor_venda numeric(14,2), valor_locacao numeric(14,2), valor_condominio numeric(14,2), valor_iptu numeric(14,2),
 quartos int default 0, suites int default 0, banheiros int default 0, vagas int default 0,
 area_util numeric(10,2), area_total numeric(10,2),
 descricao text,
 publicar_site boolean not null default false,
 destaque boolean not null default false,
 created_at timestamptz not null default now(),
 unique(imobiliaria_id,codigo)
);

create table public.imovel_fotos (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 imovel_id uuid not null references public.imoveis(id) on delete cascade,
 url text not null,
 ordem int not null default 0,
 capa boolean not null default false,
 created_at timestamptz not null default now()
);

create table public.inquilinos (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 nome text not null, cpf_cnpj text, telefone text, email text,
 created_at timestamptz not null default now()
);

create table public.contratos_locacao (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 imovel_id uuid not null references public.imoveis(id),
 proprietario_id uuid not null references public.proprietarios(id),
 inquilino_id uuid not null references public.inquilinos(id),
 inicio date not null, fim date not null,
 valor_aluguel numeric(14,2) not null,
 dia_vencimento int not null check(dia_vencimento between 1 and 31),
 primeiro_aluguel_imobiliaria boolean not null default true,
 taxa_administracao_percentual numeric(6,3) not null default 10.000,
 multa_atraso_percentual numeric(6,3) default 2.000,
 juros_mes_percentual numeric(6,3) default 1.000,
 indice_reajuste text default 'IGP-M',
 ativo boolean not null default true,
 created_at timestamptz not null default now()
);

create table public.cobrancas (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 contrato_id uuid references public.contratos_locacao(id) on delete cascade,
 competencia date not null,
 vencimento date not null,
 valor_original numeric(14,2) not null,
 valor_atualizado numeric(14,2),
 status text not null default 'pendente',
 provedor text,
 provedor_id text,
 boleto_url text,
 pix_copia_cola text,
 pago_em timestamptz,
 created_at timestamptz not null default now()
);

create table public.vendas (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 imovel_id uuid not null references public.imoveis(id),
 valor_negociado numeric(14,2),
 comissao_tipo text check(comissao_tipo in ('percentual','valor')),
 comissao_percentual numeric(6,3),
 comissao_valor numeric(14,2),
 status text default 'negociacao',
 created_at timestamptz not null default now()
);

-- Helper: usuário pertence à imobiliária ou é admin master
create or replace function public.pode_acessar_imobiliaria(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and (p.perfil='admin_master' or p.imobiliaria_id=target));
$$;

alter table public.imobiliarias enable row level security;
alter table public.perfis enable row level security;
alter table public.proprietarios enable row level security;
alter table public.imoveis enable row level security;
alter table public.imovel_fotos enable row level security;
alter table public.inquilinos enable row level security;
alter table public.contratos_locacao enable row level security;
alter table public.cobrancas enable row level security;
alter table public.vendas enable row level security;

create policy "imobiliarias_select" on public.imobiliarias for select using (public.pode_acessar_imobiliaria(id));
create policy "perfis_select" on public.perfis for select using (id=auth.uid() or public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "proprietarios_all" on public.proprietarios for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "imoveis_all" on public.imoveis for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "fotos_all" on public.imovel_fotos for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "inquilinos_all" on public.inquilinos for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "contratos_all" on public.contratos_locacao for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "cobrancas_all" on public.cobrancas for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "vendas_all" on public.vendas for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));

-- Storage para fotos dos imóveis
insert into storage.buckets (id,name,public) values ('imoveis','imoveis',true) on conflict (id) do nothing;

-- ============================================================
-- MÓDULOS COMPLEMENTARES DO MASTER
-- ============================================================
create table public.financeiro (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 data date not null default current_date,
 descricao text not null,
 tipo text not null,
 valor numeric(14,2) not null default 0,
 status text not null default 'Pendente',
 created_at timestamptz not null default now()
);

create table public.vistorias (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 imovel_id uuid references public.imoveis(id) on delete set null,
 data date not null,
 tipo text not null,
 responsavel text,
 status text not null default 'Agendada',
 observacoes text,
 created_at timestamptz not null default now()
);

create table public.manutencoes (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 imovel_id uuid references public.imoveis(id) on delete set null,
 chamado text not null,
 descricao text not null,
 status text not null default 'Aberto',
 valor numeric(14,2) default 0,
 created_at timestamptz not null default now()
);

create table public.documentos (
 id uuid primary key default gen_random_uuid(),
 imobiliaria_id uuid not null references public.imobiliarias(id) on delete cascade,
 nome text not null,
 categoria text,
 vinculo text,
 arquivo_url text,
 status text default 'Pendente',
 created_at timestamptz not null default now()
);

alter table public.imobiliarias add column if not exists plano text default 'Piloto';
alter table public.imobiliarias add column if not exists banco_integracao text default 'Não configurada';

alter table public.financeiro enable row level security;
alter table public.vistorias enable row level security;
alter table public.manutencoes enable row level security;
alter table public.documentos enable row level security;

create policy "financeiro_all" on public.financeiro for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "vistorias_all" on public.vistorias for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "manutencoes_all" on public.manutencoes for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));
create policy "documentos_all" on public.documentos for all using (public.pode_acessar_imobiliaria(imobiliaria_id)) with check (public.pode_acessar_imobiliaria(imobiliaria_id));

-- Apenas Admin Master pode criar/excluir imobiliárias.
create or replace function public.eh_admin_master()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.perfil='admin_master');
$$;

create policy "imobiliarias_insert_master" on public.imobiliarias for insert with check (public.eh_admin_master());
create policy "imobiliarias_update_master" on public.imobiliarias for update using (public.eh_admin_master()) with check (public.eh_admin_master());
create policy "imobiliarias_delete_master" on public.imobiliarias for delete using (public.eh_admin_master());

-- Admin Master pode administrar perfis. Usuário comum só lê o próprio perfil.
create policy "perfis_insert_master" on public.perfis for insert with check (public.eh_admin_master());
create policy "perfis_update_master" on public.perfis for update using (public.eh_admin_master()) with check (public.eh_admin_master());
create policy "perfis_delete_master" on public.perfis for delete using (public.eh_admin_master());

-- Storage: leitura pública somente das fotos de imóveis; escrita restrita a usuário autenticado.
create policy "imoveis_storage_select" on storage.objects for select using (bucket_id='imoveis');
create policy "imoveis_storage_insert" on storage.objects for insert to authenticated with check (bucket_id='imoveis');
create policy "imoveis_storage_update" on storage.objects for update to authenticated using (bucket_id='imoveis') with check (bucket_id='imoveis');
create policy "imoveis_storage_delete" on storage.objects for delete to authenticated using (bucket_id='imoveis');
