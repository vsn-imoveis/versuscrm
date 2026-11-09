-- Tenant-isolated CRM contacts; apply only to the dedicated VersusCRM Supabase project.
create table if not exists public.crm_contacts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.crm_companies(id) on delete cascade,
 name text not null,
 email text,
 phone text,
 contact_type text not null default 'lead' check (contact_type in ('lead','buyer','tenant','owner','other')),
 source text,
 notes text,
 status text not null default 'new' check (status in ('new','contacted','qualified','inactive','converted')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_contacts_company_created_idx on public.crm_contacts (company_id, created_at desc);
grant select, insert, update, delete on public.crm_contacts to authenticated;
alter table public.crm_contacts enable row level security;
drop policy if exists crm_contacts_member_select on public.crm_contacts;
create policy crm_contacts_member_select on public.crm_contacts for select to authenticated using (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid() and m.company_id = crm_contacts.company_id));
drop policy if exists crm_contacts_member_insert on public.crm_contacts;
create policy crm_contacts_member_insert on public.crm_contacts for insert to authenticated with check (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid() and m.company_id = crm_contacts.company_id));
drop policy if exists crm_contacts_member_update on public.crm_contacts;
create policy crm_contacts_member_update on public.crm_contacts for update to authenticated using (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid() and m.company_id = crm_contacts.company_id)) with check (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid() and m.company_id = crm_contacts.company_id));
drop policy if exists crm_contacts_member_delete on public.crm_contacts;
create policy crm_contacts_member_delete on public.crm_contacts for delete to authenticated using (exists (select 1 from public.crm_memberships m where m.user_id = auth.uid() and m.company_id = crm_contacts.company_id));
