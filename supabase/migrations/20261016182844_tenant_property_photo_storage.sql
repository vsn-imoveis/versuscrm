-- Dedicated VersusCRM database only. Never apply this migration to the legacy VSN project.
-- Public read access is intentional because published property pages display these images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-property-photos',
  'crm-property-photos',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.crm_can_upload_property_photo(p_company_id text, p_property_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_property_id uuid;
  v_external_photo_count integer;
  v_stored_photo_count integer;
begin
  begin
    v_company_id := p_company_id::uuid;
    v_property_id := p_property_id::uuid;
  exception when others then
    return false;
  end;

  if auth.uid() is null or not exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = v_company_id
  ) then
    return false;
  end if;

  -- Serialize uploads for a property so simultaneous requests cannot bypass the limit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':' || v_property_id::text, 0)
  );

  select coalesce((
    select count(*)::integer
    from unnest(coalesce(p.photos, array[]::text[])) as photos(photo_url)
    where photos.photo_url not like '%/storage/v1/object/public/crm-property-photos/%'
  ), 0)
  into v_external_photo_count
  from public.properties p
  where p.id = v_property_id and p.company_id = v_company_id;

  if not found then
    return false;
  end if;

  select count(*)::integer into v_stored_photo_count
  from storage.objects o
  where o.bucket_id = 'crm-property-photos'
    and (storage.foldername(o.name))[1] = v_company_id::text
    and (storage.foldername(o.name))[2] = v_property_id::text;

  return (v_external_photo_count + v_stored_photo_count) < 35;
end;
$$;

create or replace function public.crm_can_manage_property_photo(p_company_id text, p_property_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and exists (
      select 1 from public.crm_memberships m
      where m.user_id = auth.uid()
        and m.company_id::text = p_company_id
    )
    and exists (
      select 1 from public.properties p
      where p.id::text = p_property_id
        and p.company_id::text = p_company_id
    );
$$;

revoke all on function public.crm_can_upload_property_photo(text, text) from public, anon;
grant execute on function public.crm_can_upload_property_photo(text, text) to authenticated;
revoke all on function public.crm_can_manage_property_photo(text, text) from public, anon;
grant execute on function public.crm_can_manage_property_photo(text, text) to authenticated;

drop policy if exists crm_property_photos_member_insert on storage.objects;
create policy crm_property_photos_member_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'crm-property-photos'
  and array_length(storage.foldername(name), 1) = 2
  and public.crm_can_upload_property_photo(
    (storage.foldername(name))[1],
    (storage.foldername(name))[2]
  )
);

drop policy if exists crm_property_photos_member_delete on storage.objects;
create policy crm_property_photos_member_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'crm-property-photos'
  and array_length(storage.foldername(name), 1) = 2
  and public.crm_can_manage_property_photo(
    (storage.foldername(name))[1],
    (storage.foldername(name))[2]
  )
);
