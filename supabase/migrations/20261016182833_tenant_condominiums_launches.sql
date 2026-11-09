-- Tenant-isolated condominium and launch records for the VersusCRM client portal.
-- Dedicated VersusCRM database only. Do not run against the legacy VSN project.
create table if not exists public.crm_condominiums (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  name text not null,
  address text,
  neighborhood text,
  city text,
  state text,
  construction_year integer,
  builder text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_condominiums_company_name_idx
  on public.crm_condominiums (company_id, lower(name));

create table if not exists public.crm_launches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  name text not null,
  property_type text,
  description text,
  address text,
  neighborhood text,
  city text,
  price numeric(14,2),
  delivery_date date,
  photos text[] not null default '{}',
  published boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_launches_company_published_idx
  on public.crm_launches (company_id, published, created_at desc);

grant select, insert, update, delete on public.crm_condominiums to authenticated;
grant select, insert, update, delete on public.crm_launches to authenticated;
grant select on public.crm_launches to anon;

alter table public.crm_condominiums enable row level security;
alter table public.crm_launches enable row level security;

drop policy if exists crm_condominiums_member_select on public.crm_condominiums;
create policy crm_condominiums_member_select on public.crm_condominiums
  for select to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

drop policy if exists crm_condominiums_member_insert on public.crm_condominiums;
create policy crm_condominiums_member_insert on public.crm_condominiums
  for insert to authenticated
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

drop policy if exists crm_condominiums_member_update on public.crm_condominiums;
create policy crm_condominiums_member_update on public.crm_condominiums
  for update to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ))
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

drop policy if exists crm_condominiums_member_delete on public.crm_condominiums;
create policy crm_condominiums_member_delete on public.crm_condominiums
  for delete to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_condominiums.company_id
  ));

drop policy if exists crm_launches_member_select on public.crm_launches;
create policy crm_launches_member_select on public.crm_launches
  for select to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_launches.company_id
  ));

drop policy if exists crm_launches_member_insert on public.crm_launches;
create policy crm_launches_member_insert on public.crm_launches
  for insert to authenticated
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_launches.company_id
  ));

drop policy if exists crm_launches_member_update on public.crm_launches;
create policy crm_launches_member_update on public.crm_launches
  for update to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_launches.company_id
  ))
  with check (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_launches.company_id
  ));

drop policy if exists crm_launches_member_delete on public.crm_launches;
create policy crm_launches_member_delete on public.crm_launches
  for delete to authenticated
  using (exists (
    select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_launches.company_id
  ));

drop policy if exists crm_launches_public_select on public.crm_launches;
create policy crm_launches_public_select on public.crm_launches
  for select to anon, authenticated
  using (published = true and exists (
    select 1 from public.crm_companies c
    where c.id = crm_launches.company_id and c.status = 'active'
  ));
