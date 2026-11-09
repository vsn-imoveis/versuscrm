-- Dedicated VersusCRM database only. Never apply to the legacy VSN project.
-- Only tenant owners/admins can read and edit company configuration through the client API.
alter table public.crm_companies enable row level security;

drop policy if exists crm_companies_admin_select on public.crm_companies;
create policy crm_companies_admin_select
on public.crm_companies for select to authenticated
using (public.crm_is_company_admin(id));

drop policy if exists crm_companies_admin_update on public.crm_companies;
create policy crm_companies_admin_update
on public.crm_companies for update to authenticated
using (public.crm_is_company_admin(id))
with check (public.crm_is_company_admin(id));

grant select, update on public.crm_companies to authenticated;
