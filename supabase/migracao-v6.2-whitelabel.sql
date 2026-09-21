-- Plataforma Imobiliária V6.2 - White-label / Admin Master

alter table public.imob_imobiliarias add column if not exists fonte text default 'Inter';
alter table public.imob_imobiliarias add column if not exists cor_fundo text default '#F4F6F8';
alter table public.imob_imobiliarias add column if not exists cor_texto_sidebar text default '#FFFFFF';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('imob-branding','imob-branding',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "imob_branding_select" on storage.objects;
create policy "imob_branding_select" on storage.objects for select to public using (bucket_id='imob-branding');
drop policy if exists "imob_branding_master_insert" on storage.objects;
create policy "imob_branding_master_insert" on storage.objects for insert to authenticated with check (bucket_id='imob-branding' and public.imob_is_admin_master());
drop policy if exists "imob_branding_master_update" on storage.objects;
create policy "imob_branding_master_update" on storage.objects for update to authenticated using (bucket_id='imob-branding' and public.imob_is_admin_master()) with check (bucket_id='imob-branding' and public.imob_is_admin_master());
drop policy if exists "imob_branding_master_delete" on storage.objects;
create policy "imob_branding_master_delete" on storage.objects for delete to authenticated using (bucket_id='imob-branding' and public.imob_is_admin_master());
