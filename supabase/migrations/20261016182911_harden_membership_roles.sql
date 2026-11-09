-- Harden membership role changes: admins cannot grant, demote, or remove owners.
-- Owners retain full membership management; admins can manage non-owner roles only.
create or replace function public.crm_is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crm_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

revoke all on function public.crm_is_company_owner(uuid) from public, anon;
grant execute on function public.crm_is_company_owner(uuid) to authenticated;

drop policy if exists crm_memberships_admin_insert on public.crm_memberships;
create policy crm_memberships_admin_insert
on public.crm_memberships for insert to authenticated
with check (
  public.crm_is_company_owner(company_id)
  or (public.crm_is_company_admin(company_id) and role <> 'owner')
);

drop policy if exists crm_memberships_admin_update on public.crm_memberships;
create policy crm_memberships_admin_update
on public.crm_memberships for update to authenticated
using (
  public.crm_is_company_owner(company_id)
  or (public.crm_is_company_admin(company_id) and role <> 'owner')
)
with check (
  public.crm_is_company_owner(company_id)
  or (public.crm_is_company_admin(company_id) and role <> 'owner')
);

drop policy if exists crm_memberships_admin_delete on public.crm_memberships;
create policy crm_memberships_admin_delete
on public.crm_memberships for delete to authenticated
using (
  public.crm_is_company_owner(company_id)
  or (public.crm_is_company_admin(company_id) and role <> 'owner')
);
