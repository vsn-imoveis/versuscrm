-- Advanced property address fields and tenant-safe condominium association.
-- Apply only to the dedicated VersusCRM Supabase project, never the legacy VSN database.
alter table public.properties
  add column if not exists cep text,
  add column if not exists state text,
  add column if not exists micro_neighborhood text,
  add column if not exists condominium_id uuid;

-- A composite key ensures a property can only reference a condominium belonging to its own company.
create unique index if not exists crm_condominiums_id_company_unique
  on public.crm_condominiums (id, company_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_condominium_company_fkey'
  ) then
    alter table public.properties
      add constraint properties_condominium_company_fkey
      foreign key (condominium_id, company_id)
      references public.crm_condominiums (id, company_id)
      on delete set null (condominium_id);
  end if;
end $$;

create index if not exists properties_company_condominium_idx
  on public.properties (company_id, condominium_id);
