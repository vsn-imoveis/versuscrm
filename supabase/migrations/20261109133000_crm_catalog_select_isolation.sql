drop policy if exists crm_condominiums_shared_select on public.crm_condominiums;
create policy crm_condominiums_tenant_select on public.crm_condominiums for select to authenticated using (
 exists(select 1 from public.crm_memberships m where m.user_id=auth.uid() and m.company_id=crm_condominiums.company_id)
 or exists(select 1 from public.crm_owner_accounts oa where oa.user_id=auth.uid() and oa.company_id=crm_condominiums.company_id and oa.status='active')
 or public.is_crm_admin()
);
drop policy if exists crm_developers_shared_select on public.crm_developers;
create policy crm_developers_tenant_select on public.crm_developers for select to authenticated using (
 exists(select 1 from public.crm_memberships m where m.user_id=auth.uid() and m.company_id=crm_developers.company_id)
 or public.is_crm_admin()
);