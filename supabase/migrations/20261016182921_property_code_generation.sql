-- Generate a tenant-scoped property code when omitted and prevent duplicate codes per company.
-- Format: VSN0001, VSN0002, ... . Apply only to the dedicated VersusCRM database.
create or replace function public.assign_crm_property_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_number bigint;
begin
  if new.company_id is null then
    raise exception 'Imobiliária obrigatória para gerar o código do imóvel';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.company_id::text || ':property-code', 0)
  );

  new.code := nullif(btrim(new.code), '');

  if new.code is null then
    select coalesce(max((pg_catalog.regexp_match(upper(p.code), '^VSN([0-9]+)$'))[1]::bigint), 0)
      into last_number
      from public.properties p
     where p.company_id = new.company_id
       and upper(p.code) ~ '^VSN[0-9]+$'
       and p.id <> new.id;

    new.code := 'VSN' || lpad((last_number + 1)::text, 4, '0');
  end if;

  if exists (
    select 1
      from public.properties p
     where p.company_id = new.company_id
       and lower(p.code) = lower(new.code)
       and p.id <> new.id
  ) then
    raise exception 'Já existe um imóvel com o código % nesta imobiliária', new.code;
  end if;

  return new;
end;
$$;

revoke all on function public.assign_crm_property_code() from public, anon, authenticated;

drop trigger if exists properties_code_guard on public.properties;
create trigger properties_code_guard
before insert or update of code, company_id on public.properties
for each row execute function public.assign_crm_property_code();

create index if not exists properties_company_code_lookup_idx
  on public.properties (company_id, lower(code));
