-- Link launches to a developer within the same tenant. Apply only to dedicated VersusCRM Supabase.
create unique index if not exists crm_developers_id_company_unique on public.crm_developers (id, company_id);
alter table public.crm_launches add column if not exists developer_id uuid;
alter table public.crm_launches drop constraint if exists crm_launches_developer_company_fk;
alter table public.crm_launches add constraint crm_launches_developer_company_fk foreign key (developer_id, company_id) references public.crm_developers (id, company_id) on delete set null (developer_id);
create index if not exists crm_launches_company_developer_idx on public.crm_launches (company_id, developer_id);
