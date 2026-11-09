create or replace function public.crm_can_upload_property_photo(
  p_company_id text,
  p_property_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_property_id uuid;
  v_external_photo_count integer;
  v_stored_photo_count integer;
  v_photo_limit integer;
begin
  begin
    v_company_id := p_company_id::uuid;
    v_property_id := p_property_id::uuid;
  exception when others then
    return false;
  end;

  if (select auth.uid()) is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.properties p
    where p.id = v_property_id
      and p.company_id = v_company_id
      and (
        exists (
          select 1 from public.crm_memberships m
          where m.user_id = (select auth.uid())
            and m.company_id = v_company_id
        )
        or exists (
          select 1 from public.crm_owner_accounts oa
          where oa.user_id = (select auth.uid())
            and oa.company_id = v_company_id
            and oa.contact_id = p.owner_contact_id
            and oa.status = 'active'
        )
      )
  ) then
    return false;
  end if;

  select coalesce(c.max_photos_per_property, 35)
  into v_photo_limit
  from public.crm_companies c
  where c.id = v_company_id and c.status = 'active';

  if not found or v_photo_limit < 1 then
    return false;
  end if;

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

  return (v_external_photo_count + v_stored_photo_count) < v_photo_limit;
end;
$function$;

create or replace function public.crm_can_manage_site_assets(p_company_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id::text = p_company_id
      and lower(m.role) in ('owner','admin','manager')
  );
$function$;

drop policy if exists crm_property_photos_insert on storage.objects;
drop policy if exists crm_property_photos_delete on storage.objects;
drop policy if exists crm_site_assets_insert on storage.objects;
drop policy if exists crm_site_assets_update on storage.objects;
drop policy if exists crm_site_assets_delete on storage.objects;
drop policy if exists crm_profile_photos_user_insert on storage.objects;
drop policy if exists crm_profile_photos_user_update on storage.objects;
drop policy if exists crm_profile_photos_user_delete on storage.objects;
