-- Return only the current tenant's effective limits to authenticated members/owners.
-- This avoids querying crm_companies directly from ordinary member sessions, where
-- RLS intentionally restricts company profile visibility to administrators.
create or replace function public.get_my_crm_company_limits(p_company_id uuid)
returns table (
  property_limit integer,
  photo_limit integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with authorized as (
    select 1
    where auth.uid() is not null
      and (
        exists (
          select 1
          from public.crm_memberships m
          where m.company_id = p_company_id
            and m.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.crm_owner_accounts oa
          where oa.company_id = p_company_id
            and oa.user_id = auth.uid()
            and oa.status = 'active'
        )
      )
  ),
  limits as (
    select
      coalesce(c.max_properties, 100) as company_properties,
      coalesce(c.max_photos_per_property, 35) as company_photos,
      (
        select min(s.property_limit)
        from public.crm_subscriptions s
        where s.company_id = c.id
          and s.status in ('active', 'trial')
      ) as subscription_properties,
      (
        select min(s.photo_limit)
        from public.crm_subscriptions s
        where s.company_id = c.id
          and s.status in ('active', 'trial')
      ) as subscription_photos
    from public.crm_companies c
    where c.id = p_company_id
  )
  select
    greatest(0, least(
      l.company_properties,
      coalesce(l.subscription_properties, l.company_properties)
    ))::integer,
    greatest(0, least(
      l.company_photos,
      coalesce(l.subscription_photos, l.company_photos)
    ))::integer
  from limits l
  cross join authorized;
$function$;

revoke all on function public.get_my_crm_company_limits(uuid) from public;
revoke all on function public.get_my_crm_company_limits(uuid) from anon;
grant execute on function public.get_my_crm_company_limits(uuid) to authenticated;

comment on function public.get_my_crm_company_limits(uuid) is
'Returns effective property/photo limits only to a member or active owner account of the requested CRM company.';
