create or replace function public.get_public_tenant_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  status text,
  logo_url text,
  primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.name, c.status, c.logo_url, c.primary_color
  from public.crm_companies c
  where c.slug = lower(trim(p_slug))
  limit 1;
$$;

revoke all on function public.get_public_tenant_by_slug(text) from public;
grant execute on function public.get_public_tenant_by_slug(text) to anon, authenticated;