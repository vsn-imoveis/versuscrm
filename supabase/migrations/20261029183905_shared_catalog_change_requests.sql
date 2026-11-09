create table if not exists public.crm_catalog_change_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('developer','condominium')),
  action text not null check (action in ('create','update','delete')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  record_id uuid,
  current_data jsonb,
  proposed_data jsonb not null default '{}'::jsonb,
  decision_by uuid references auth.users(id) on delete set null,
  decision_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_catalog_change_requests_status_created_idx on public.crm_catalog_change_requests(status, created_at desc);
create index if not exists crm_catalog_change_requests_company_idx on public.crm_catalog_change_requests(company_id, created_at desc);
alter table public.crm_catalog_change_requests enable row level security;
drop policy if exists "catalog requests insert by company members" on public.crm_catalog_change_requests;
create policy "catalog requests insert by company members" on public.crm_catalog_change_requests for insert to authenticated
with check (
 requested_by = auth.uid()
 and exists (select 1 from public.crm_memberships m where m.company_id = crm_catalog_change_requests.company_id and m.user_id = auth.uid())
 and status = 'pending'
);
drop policy if exists "catalog requests view by requester or admin" on public.crm_catalog_change_requests;
create policy "catalog requests view by requester or admin" on public.crm_catalog_change_requests for select to authenticated
using (
 requested_by = auth.uid()
 or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
drop policy if exists "catalog requests decision by admin" on public.crm_catalog_change_requests;
create policy "catalog requests decision by admin" on public.crm_catalog_change_requests for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
