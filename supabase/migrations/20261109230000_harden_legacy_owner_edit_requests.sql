-- Restrict legacy owner edit requests to the linked owner and tenant managers.
-- This table remains in the Versus database for compatibility with legacy portal flows.

drop policy if exists property_owner_requests_insert_self on public.property_owner_edit_requests;
drop policy if exists property_owner_requests_insert_linked_property on public.property_owner_edit_requests;
create policy property_owner_requests_insert_linked_property
on public.property_owner_edit_requests for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.properties p
    join public.crm_owner_accounts oa
      on oa.company_id = p.company_id and oa.contact_id = p.owner_contact_id
    where p.id = property_owner_edit_requests.property_id
      and oa.user_id = (select auth.uid())
      and oa.status = 'active'
  )
);

drop policy if exists property_owner_requests_admin_select_tenant on public.property_owner_edit_requests;
create policy property_owner_requests_admin_select_tenant
on public.property_owner_edit_requests for select to authenticated
using (
  exists (
    select 1 from public.properties p
    join public.crm_memberships m on m.company_id = p.company_id
    where p.id = property_owner_edit_requests.property_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','manager')
  )
);

drop policy if exists property_owner_requests_admin_update_tenant on public.property_owner_edit_requests;
create policy property_owner_requests_admin_update_tenant
on public.property_owner_edit_requests for update to authenticated
using (
  exists (
    select 1 from public.properties p
    join public.crm_memberships m on m.company_id = p.company_id
    where p.id = property_owner_edit_requests.property_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','manager')
  )
)
with check (
  exists (
    select 1 from public.properties p
    join public.crm_memberships m on m.company_id = p.company_id
    where p.id = property_owner_edit_requests.property_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','manager')
  )
);

drop policy if exists property_owner_requests_select_linked_property on public.property_owner_edit_requests;
create policy property_owner_requests_select_linked_property
on public.property_owner_edit_requests for select to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.properties p
    join public.crm_owner_accounts oa
      on oa.company_id = p.company_id and oa.contact_id = p.owner_contact_id
    where p.id = property_owner_edit_requests.property_id
      and oa.user_id = (select auth.uid())
      and oa.status = 'active'
  )
);
