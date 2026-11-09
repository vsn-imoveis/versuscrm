-- Owner portal terms and owner-originated property change requests.
create table if not exists public.crm_owner_term_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  user_id uuid not null,
  term_version text not null,
  created_at timestamptz not null default now(),
  unique(company_id, user_id, term_version)
);
alter table public.crm_owner_term_acceptances enable row level security;
create policy crm_owner_terms_select_self on public.crm_owner_term_acceptances
  for select to authenticated using (user_id = auth.uid());
create policy crm_owner_terms_insert_self on public.crm_owner_term_acceptances
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.crm_owner_accounts oa
      where oa.company_id = crm_owner_term_acceptances.company_id
        and oa.user_id = auth.uid() and oa.status = 'active'
    )
  );

create policy crm_catalog_requests_owner_select on public.crm_catalog_change_requests
  for select to authenticated using (
    exists (
      select 1 from public.crm_owner_accounts oa
      join public.properties p on p.company_id = oa.company_id and p.owner_contact_id = oa.contact_id
      where oa.user_id = auth.uid() and oa.status = 'active'
        and p.id = crm_catalog_change_requests.record_id
        and crm_catalog_change_requests.entity_type = 'property'
    )
  );
create policy crm_catalog_requests_owner_insert on public.crm_catalog_change_requests
  for insert to authenticated with check (
    requested_by = auth.uid() and status = 'pending'
    and entity_type = 'property'
    and exists (
      select 1 from public.crm_owner_accounts oa
      join public.properties p on p.company_id = oa.company_id and p.owner_contact_id = oa.contact_id
      where oa.user_id = auth.uid() and oa.status = 'active'
        and p.id = crm_catalog_change_requests.record_id
        and p.company_id = crm_catalog_change_requests.company_id
    )
  );
create policy crm_catalog_requests_tenant_admin_select on public.crm_catalog_change_requests
  for select to authenticated using (
    exists (
      select 1 from public.crm_memberships m
      where m.user_id = auth.uid()
        and m.company_id = crm_catalog_change_requests.company_id
        and m.role in ('owner','admin','manager')
    )
  );
create policy crm_catalog_requests_tenant_admin_update on public.crm_catalog_change_requests
  for update to authenticated using (
    exists (
      select 1 from public.crm_memberships m
      where m.user_id = auth.uid()
        and m.company_id = crm_catalog_change_requests.company_id
        and m.role in ('owner','admin','manager')
    )
  ) with check (
    exists (
      select 1 from public.crm_memberships m
      where m.user_id = auth.uid()
        and m.company_id = crm_catalog_change_requests.company_id
        and m.role in ('owner','admin','manager')
    )
  );
