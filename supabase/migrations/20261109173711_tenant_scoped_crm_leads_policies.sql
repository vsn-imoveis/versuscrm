create policy "crm_leads_tenant_select"
on public.crm_leads for select to authenticated
using (
  exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = crm_leads.company_id
  )
);

create policy "crm_leads_tenant_insert"
on public.crm_leads for insert to authenticated
with check (
  company_id is not null
  and exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = crm_leads.company_id
  )
);

create policy "crm_leads_tenant_update"
on public.crm_leads for update to authenticated
using (
  exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = crm_leads.company_id
  )
)
with check (
  company_id is not null
  and exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = crm_leads.company_id
  )
);

create policy "crm_leads_tenant_delete"
on public.crm_leads for delete to authenticated
using (
  exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = crm_leads.company_id
  )
);

create policy "crm_leads_public_insert_active_company"
on public.crm_leads for insert to anon
with check (
  company_id is not null
  and exists (
    select 1 from public.crm_companies c
    where c.id = crm_leads.company_id and c.status = 'active'
  )
);