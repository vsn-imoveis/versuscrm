-- Restrict catalog maintenance to tenant owners, admins and managers.
-- Brokers retain read access but cannot mutate shared catalog tables directly.

drop policy if exists crm_condominiums_member_insert on public.crm_condominiums;
drop policy if exists crm_condominiums_member_update on public.crm_condominiums;
drop policy if exists crm_condominiums_member_delete on public.crm_condominiums;
create policy crm_condominiums_admin_insert on public.crm_condominiums
for insert to authenticated with check (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_condominiums.company_id
    and m.role in ('owner','admin','manager')
));
create policy crm_condominiums_admin_update on public.crm_condominiums
for update to authenticated using (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_condominiums.company_id
    and m.role in ('owner','admin','manager')
)) with check (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_condominiums.company_id
    and m.role in ('owner','admin','manager')
));
create policy crm_condominiums_admin_delete on public.crm_condominiums
for delete to authenticated using (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_condominiums.company_id
    and m.role in ('owner','admin','manager')
));

drop policy if exists crm_developers_member_insert on public.crm_developers;
drop policy if exists crm_developers_member_update on public.crm_developers;
drop policy if exists crm_developers_member_delete on public.crm_developers;
create policy crm_developers_admin_insert on public.crm_developers
for insert to authenticated with check (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_developers.company_id
    and m.role in ('owner','admin','manager')
));
create policy crm_developers_admin_update on public.crm_developers
for update to authenticated using (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_developers.company_id
    and m.role in ('owner','admin','manager')
)) with check (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_developers.company_id
    and m.role in ('owner','admin','manager')
));
create policy crm_developers_admin_delete on public.crm_developers
for delete to authenticated using (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_developers.company_id
    and m.role in ('owner','admin','manager')
));

drop policy if exists crm_launches_member_insert on public.crm_launches;
drop policy if exists crm_launches_member_update on public.crm_launches;
drop policy if exists crm_launches_member_delete on public.crm_launches;
create policy crm_launches_admin_insert on public.crm_launches
for insert to authenticated with check (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_launches.company_id
    and m.role in ('owner','admin','manager')
));
create policy crm_launches_admin_update on public.crm_launches
for update to authenticated using (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_launches.company_id
    and m.role in ('owner','admin','manager')
)) with check (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_launches.company_id
    and m.role in ('owner','admin','manager')
));
create policy crm_launches_admin_delete on public.crm_launches
for delete to authenticated using (exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id=crm_launches.company_id
    and m.role in ('owner','admin','manager')
));
