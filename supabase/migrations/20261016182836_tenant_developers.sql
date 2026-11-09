-- Tenant-isolated builders/developers for VersusCRM.
-- Apply only to the dedicated VersusCRM Supabase project, never the legacy VSN database.
create table if not exists public.crm_developers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  name text not null,
  legal_name text,
  document text,
  phone text,
  website text,
  partnership_manager_name text,
  partnership_manager_phone text,
  description text,
  logo_url text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_developers_company_name_idx
  on public.crm_developers (company_id, lower(name));

grant select, insert, update, delete on public.crm_developers to authenticated;
alter table public.crm_developers enable row level security;

drop policy if exists crm_developers_member_select on public.crm_developers;
create policy crm_developers_member_select on public.crm_developers
  for select to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));

drop policy if exists crm_developers_member_insert on public.crm_developers;
create policy crm_developers_member_insert on public.crm_developers
  for insert to authenticated
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));

drop policy if exists crm_developers_member_update on public.crm_developers;
create policy crm_developers_member_update on public.crm_developers
  for update to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ))
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));

drop policy if exists crm_developers_member_delete on public.crm_developers;
create policy crm_developers_member_delete on public.crm_developers
  for delete to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_developers.company_id
  ));
