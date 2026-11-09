-- Enforce the per-company property cap in the database, including concurrent inserts.
-- Apply only to the dedicated VersusCRM Supabase project.
create or replace function public.enforce_crm_property_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_limit integer;
  existing_count bigint;
begin
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.company_id::text, 0));

  select c.max_properties
    into company_limit
    from public.crm_companies c
   where c.id = new.company_id;

  if company_limit is null then
    raise exception 'Imobiliária inválida para cadastro de imóvel';
  end if;

  if tg_op = 'UPDATE' then
    select count(*)
      into existing_count
      from public.properties p
     where p.company_id = new.company_id
       and p.id <> old.id;
  else
    select count(*)
      into existing_count
      from public.properties p
     where p.company_id = new.company_id;
  end if;

  if existing_count >= company_limit then
    raise exception 'Limite de % imóveis atingido para esta imobiliária', company_limit;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_crm_property_limit() from public, anon, authenticated;

drop trigger if exists properties_company_limit_guard on public.properties;
create trigger properties_company_limit_guard
before insert or update of company_id on public.properties
for each row execute function public.enforce_crm_property_limit();
