-- Tenant-scoped CRUD for condominium and developer catalogs.
create policy crm_condominiums_member_insert
  on public.crm_condominiums for insert to authenticated
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

create policy crm_condominiums_member_update
  on public.crm_condominiums for update to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ))
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

create policy crm_condominiums_member_delete
  on public.crm_condominiums for delete to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

create policy crm_developers_member_insert
  on public.crm_developers for insert to authenticated
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));

create policy crm_developers_member_update
  on public.crm_developers for update to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ))
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));

create policy crm_developers_member_delete
  on public.crm_developers for delete to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));
