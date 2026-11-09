-- Tighten helper-function permissions and pin the trigger function search_path.
-- Dedicated VersusCRM database only.
create or replace function public.validate_crm_subscription_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  company_limit integer;
  company_photos integer;
begin
  select c.max_properties, c.max_photos_per_property
    into company_limit, company_photos
    from public.crm_companies c
   where c.id = new.company_id;

  if company_limit is null then
    raise exception 'Empresa inválida';
  end if;

  if new.property_limit <> company_limit or new.photo_limit <> company_photos then
    raise exception 'Limites devem ser definidos pelo administrador';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_crm_subscription_limits() from public, anon, authenticated;
revoke all on function public.is_crm_admin() from public, anon;
grant execute on function public.is_crm_admin() to authenticated;
