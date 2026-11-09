-- Dedicated VersusCRM database only. Never apply to the legacy VSN project.
-- Membership records link existing Supabase Auth users to one tenant and a role.
alter table public.crm_memberships
  add column if not exists role text not null default 'member';

create unique index if not exists crm_memberships_company_user_unique
  on public.crm_memberships (company_id, user_id);

create index if not exists crm_memberships_company_role_idx
  on public.crm_memberships (company_id, role);

alter table public.crm_memberships
  drop constraint if exists crm_memberships_role_check;
alter table public.crm_memberships
  add constraint crm_memberships_role_check
  check (role in ('owner','admin','manager','agent','member'));

create or replace function public.crm_is_company_admin(p_company_id uuid)
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
      and m.role in ('owner','admin')
  );
$$;

revoke all on function public.crm_is_company_admin(uuid) from public, anon;
grant execute on function public.crm_is_company_admin(uuid) to authenticated;

alter table public.crm_memberships enable row level security;
grant select, insert, update, delete on public.crm_memberships to authenticated;

drop policy if exists crm_memberships_self_or_admin_select on public.crm_memberships;
create policy crm_memberships_self_or_admin_select
on public.crm_memberships for select to authenticated
using (user_id = auth.uid() or public.crm_is_company_admin(company_id));

drop policy if exists crm_memberships_admin_insert on public.crm_memberships;
create policy crm_memberships_admin_insert
on public.crm_memberships for insert to authenticated
with check (public.crm_is_company_admin(company_id));

drop policy if exists crm_memberships_admin_update on public.crm_memberships;
create policy crm_memberships_admin_update
on public.crm_memberships for update to authenticated
using (public.crm_is_company_admin(company_id))
with check (public.crm_is_company_admin(company_id));

drop policy if exists crm_memberships_admin_delete on public.crm_memberships;
create policy crm_memberships_admin_delete
on public.crm_memberships for delete to authenticated
using (public.crm_is_company_admin(company_id));
