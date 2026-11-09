alter table public.crm_companies
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists youtube_url text,
  add column if not exists public_address text,
  add column if not exists about_text text,
  add column if not exists site_photo_url text,
  add column if not exists site_cover_url text,
  add column if not exists site_share_image_url text;

drop function if exists public.get_public_crm_company(text);
create function public.get_public_crm_company(p_slug text)
returns table (
  id uuid, name text, slug text, contact_name text, contact_email text,
  contact_phone text, logo_url text, primary_color text,
  instagram_url text, facebook_url text, youtube_url text, public_address text,
  about_text text, site_photo_url text, site_cover_url text, site_share_image_url text
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.slug, c.contact_name, c.contact_email, c.contact_phone,
         c.logo_url, c.primary_color, c.instagram_url, c.facebook_url, c.youtube_url,
         c.public_address, c.about_text, c.site_photo_url, c.site_cover_url, c.site_share_image_url
  from public.crm_companies c
  where c.slug = lower(trim(p_slug)) and c.status = 'active'
  limit 1;
$$;
revoke all on function public.get_public_crm_company(text) from public;
grant execute on function public.get_public_crm_company(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-site-assets', 'crm-site-assets', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.crm_can_manage_site_assets(p_company_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id::text = p_company_id
      and lower(m.role) in ('owner','admin')
  );
$$;
revoke all on function public.crm_can_manage_site_assets(text) from public, anon;
grant execute on function public.crm_can_manage_site_assets(text) to authenticated;

drop policy if exists crm_site_assets_member_insert on storage.objects;
create policy crm_site_assets_member_insert on storage.objects for insert to authenticated
with check (bucket_id = 'crm-site-assets' and array_length(storage.foldername(name), 1) = 1
  and public.crm_can_manage_site_assets((storage.foldername(name))[1]));

drop policy if exists crm_site_assets_member_update on storage.objects;
create policy crm_site_assets_member_update on storage.objects for update to authenticated
using (bucket_id = 'crm-site-assets' and array_length(storage.foldername(name), 1) = 1
  and public.crm_can_manage_site_assets((storage.foldername(name))[1]))
with check (bucket_id = 'crm-site-assets' and array_length(storage.foldername(name), 1) = 1
  and public.crm_can_manage_site_assets((storage.foldername(name))[1]));

drop policy if exists crm_site_assets_member_delete on storage.objects;
create policy crm_site_assets_member_delete on storage.objects for delete to authenticated
using (bucket_id = 'crm-site-assets' and array_length(storage.foldername(name), 1) = 1
  and public.crm_can_manage_site_assets((storage.foldername(name))[1]));