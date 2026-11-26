create table if not exists public.crm_company_slug_aliases (
  alias_slug text primary key,
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  target_slug text not null,
  created_at timestamptz not null default now()
);

alter table public.crm_company_slug_aliases enable row level security;

drop policy if exists crm_company_slug_aliases_public_read on public.crm_company_slug_aliases;
create policy crm_company_slug_aliases_public_read
on public.crm_company_slug_aliases
for select
to anon, authenticated
using (true);

grant select on public.crm_company_slug_aliases to anon, authenticated;
