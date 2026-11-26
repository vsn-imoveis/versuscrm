-- Leads captados exclusivamente pelo site institucional do Versus CRM.
create table if not exists public.leads_site (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text not null,
  interesse text not null default 'Interesse comercial',
  mensagem text not null,
  origem_url text,
  status text not null default 'novo'
    check (status in ('novo', 'contatado', 'qualificado', 'convertido', 'perdido')),
  observacoes_internas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_site_created_at_idx
  on public.leads_site (created_at desc);
create index if not exists leads_site_status_idx
  on public.leads_site (status, created_at desc);

alter table public.leads_site enable row level security;
revoke all on table public.leads_site from anon, authenticated;
grant all on table public.leads_site to service_role;

-- Apenas o administrador da plataforma pode consultar os leads pelo painel.
grant select on table public.leads_site to authenticated;
drop policy if exists leads_site_platform_admin_select on public.leads_site;
create policy leads_site_platform_admin_select
on public.leads_site
for select
to authenticated
using ((select public.is_crm_admin()));
