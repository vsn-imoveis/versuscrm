-- Enforce the per-property photo URL limit at the database boundary.
-- This complements the storage policies and client-side file-size validation.
create or replace function public.enforce_crm_property_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_limit integer;
  photo_count integer;
begin
  select c.max_photos_per_property
    into photo_limit
    from public.crm_companies c
   where c.id = new.company_id;

  if photo_limit is null then
    raise exception 'Imobiliária inválida para fotos do imóvel';
  end if;

  photo_count := coalesce(cardinality(new.photos), 0);
  if photo_count > photo_limit then
    raise exception 'Limite de % fotos por imóvel atingido', photo_limit;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_crm_property_photo_limit() from public, anon, authenticated;

drop trigger if exists properties_photo_limit_guard on public.properties;
create trigger properties_photo_limit_guard
before insert or update of photos, company_id on public.properties
for each row execute function public.enforce_crm_property_photo_limit();
