-- BOOTSTRAP INICIAL DA ZAMAR
-- 1) Execute schema.sql primeiro.
-- 2) No Supabase > Authentication > Users, crie o seu usuário ADMIN MASTER.
-- 3) Copie o UUID desse usuário e substitua SEU_UUID_AQUI abaixo.

insert into public.imobiliarias (
  id,nome,slug,creci,slogan,cor_primaria,cor_secundaria,plano,ativa
) values (
  '11111111-1111-4111-8111-111111111111',
  'Zamar Imóveis',
  'zamar',
  '047529-J',
  'SEU SONHO TEM NOME, ZAMAR IMÓVEIS',
  '#FFE600',
  '#111111',
  'Piloto',
  true
) on conflict (slug) do nothing;

-- IMPORTANTE: troque SEU_UUID_AQUI pelo UUID do usuário criado no Auth.
-- Exemplo:
-- insert into public.perfis (id,imobiliaria_id,nome,perfil,ativo)
-- values ('00000000-0000-0000-0000-000000000000',null,'Diego','admin_master',true);

-- Depois, para criar um administrador exclusivo da Zamar:
-- 1) crie outro usuário no Authentication > Users;
-- 2) use o UUID dele nesta instrução:
-- insert into public.perfis (id,imobiliaria_id,nome,perfil,ativo)
-- values ('UUID_DO_ADMIN_ZAMAR','11111111-1111-4111-8111-111111111111','Nome do administrador','admin_imobiliaria',true);
