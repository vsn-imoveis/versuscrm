-- Dedicated VersusCRM database only. Never apply to the legacy VSN project.
create table if not exists public.crm_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  contact_name text not null,
  email text,
  phone text,
  request_type text not null default 'general'
    check (request_type in ('general','property_info','visit','sale','rent','valuation','partnership','other')),
  subject text not null,
  message text,
  status text not null default 'new'
    check (status in ('new','in_progress','waiting','resolved','closed')),
  source text not null default 'manual',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_requests_company_status_created_idx
  on public.crm_requests (company_id, status, created_at desc);
create index if not exists crm_requests_company_email_idx
  on public.crm_requests (company_id, lower(email));

alter table public.crm_requests enable row level security;
grant select, insert, update, delete on public.crm_requests to authenticated;

drop policy if exists crm_requests_member_select on public.crm_requests;
create policy crm_requests_member_select on public.crm_requests
for select to authenticated using (
  exists (select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_requests.company_id)
);

drop policy if exists crm_requests_member_insert on public.crm_requests;
create policy crm_requests_member_insert on public.crm_requests
for insert to authenticated with check (
  exists (select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_requests.company_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists crm_requests_member_update on public.crm_requests;
create policy crm_requests_member_update on public.crm_requests
for update to authenticated using (
  exists (select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_requests.company_id)
) with check (
  exists (select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_requests.company_id)
);

drop policy if exists crm_requests_member_delete on public.crm_requests;
create policy crm_requests_member_delete on public.crm_requests
for delete to authenticated using (
  exists (select 1 from public.crm_memberships m
    where m.user_id = auth.uid() and m.company_id = crm_requests.company_id)
);

create or replace function public.crm_requests_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists crm_requests_updated_at on public.crm_requests;
create trigger crm_requests_updated_at before update on public.crm_requests
for each row execute function public.crm_requests_set_updated_at();
