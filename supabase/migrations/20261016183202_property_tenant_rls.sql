-- Tenant-safe CRUD and public visibility for properties in the dedicated VersusCRM database.
-- Do not apply to the legacy VSN Imóveis database.

drop policy if exists properties_tenant_select on public.properties;
create policy properties_tenant_select
on public.properties for select to authenticated
using (
  exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid()
      and m.company_id = properties.company_id
  )
);

drop policy if exists properties_tenant_insert on public.properties;
create policy properties_tenant_insert
on public.properties for insert to authenticated
with check (
  company_id is not null
  and exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid()
      and m.company_id = properties.company_id
  )
);

drop policy if exists properties_tenant_update on public.properties;
create policy properties_tenant_update
on public.properties for update to authenticated
using (
  exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid()
      and m.company_id = properties.company_id
  )
)
with check (
  company_id is not null
  and exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid()
      and m.company_id = properties.company_id
  )
);

drop policy if exists properties_tenant_delete on public.properties;
create policy properties_tenant_delete
on public.properties for delete to authenticated
using (
  exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid()
      and m.company_id = properties.company_id
  )
);

-- Public visitors may only read published listings belonging to active tenants.
drop policy if exists properties_public_read_published on public.properties;
create policy properties_public_read_published
on public.properties for select to anon, authenticated
using (
  published = true
  and company_id is not null
  and exists (
    select 1 from public.crm_companies c
    where c.id = properties.company_id
      and c.status = 'active'
  )
);
