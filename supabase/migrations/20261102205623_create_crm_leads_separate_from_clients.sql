create table if not exists public.crm_leads (
 id uuid primary key default gen_random_uuid(),
 company_id uuid null references public.crm_companies(id) on delete set null,
 contact_name text not null,
 email text null,
 phone text null,
 interest text null,
 message text null,
 status text not null default 'new' check (status in ('new','contacted','qualified','converted','lost')),
 source text null,
 source_url text null,
 converted_company_id uuid null references public.crm_companies(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.crm_leads enable row level security;
drop policy if exists crm_leads_admin_all on public.crm_leads;
create policy crm_leads_admin_all on public.crm_leads for all to authenticated using (public.is_crm_admin()) with check (public.is_crm_admin());
create index if not exists crm_leads_created_at_idx on public.crm_leads(created_at desc);
insert into public.crm_leads (id,company_id,contact_name,email,phone,interest,message,status,source,source_url,created_at)
select id,company_id,contact_name,email,phone,subject,message,
 case when status in ('contacted','qualified','converted','lost') then status else 'new' end,
 source,source_url,created_at
from public.crm_requests
where request_type='lead'
on conflict (id) do nothing;