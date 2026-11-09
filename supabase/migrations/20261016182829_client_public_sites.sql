-- Public client microsites for Versus CRM.
-- This migration does not alter authentication, sessions, or admin permissions.

alter table public.properties
  add column if not exists company_id uuid
  references public.crm_companies(id) on delete set null;

create index if not exists properties_company_published_idx
  on public.properties (company_id, published, created_at desc);

create or replace function public.get_public_crm_company(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  contact_name text,
  contact_email text,
  contact_phone text,
  logo_url text,
  primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.contact_name, c.contact_email,
         c.contact_phone, c.logo_url, c.primary_color
  from public.crm_companies c
  where c.slug = lower(trim(p_slug))
    and c.status = 'active'
  limit 1;
$$;

revoke all on function public.get_public_crm_company(text) from public;
grant execute on function public.get_public_crm_company(text) to anon, authenticated;
