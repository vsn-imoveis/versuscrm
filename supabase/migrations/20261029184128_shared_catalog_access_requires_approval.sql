drop policy if exists crm_developers_member_insert on public.crm_developers;
drop policy if exists crm_developers_member_update on public.crm_developers;
drop policy if exists crm_developers_member_delete on public.crm_developers;
drop policy if exists crm_condominiums_member_insert on public.crm_condominiums;
drop policy if exists crm_condominiums_member_update on public.crm_condominiums;
drop policy if exists crm_condominiums_member_delete on public.crm_condominiums;
drop policy if exists crm_developers_shared_select on public.crm_developers;
create policy crm_developers_shared_select on public.crm_developers for select to authenticated
using (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid()));
drop policy if exists crm_condominiums_shared_select on public.crm_condominiums;
create policy crm_condominiums_shared_select on public.crm_condominiums for select to authenticated
using (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid()));
