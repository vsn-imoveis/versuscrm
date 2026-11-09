create or replace function public.get_public_crm_property(p_slug text, p_property_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', p.id, 'company_id', p.company_id, 'code', p.code, 'title', p.title,
    'description', p.description, 'transaction_type', p.transaction_type,
    'property_type', p.property_type, 'price', p.price, 'rent_price', p.rent_price,
    'condo_fee', p.condo_fee, 'iptu', p.iptu, 'area', p.area, 'bedrooms', p.bedrooms,
    'suites', p.suites, 'bathrooms', p.bathrooms, 'parking', p.parking,
    'neighborhood', p.neighborhood, 'micro_neighborhood', p.micro_neighborhood,
    'city', p.city, 'state', p.state, 'address', p.address, 'number', p.number,
    'complement', p.complement, 'condominium_name', p.condominium_name,
    'photos', p.photos, 'features', p.features, 'property_features', p.property_features,
    'video_url', p.video_url, 'updated_at', p.updated_at,
    'company_name', c.name, 'company_slug', c.slug,
    'company_logo_url', c.logo_url, 'company_primary_color', c.primary_color
  )
  from public.properties p
  join public.crm_companies c on c.id = p.company_id
  where c.slug = p_slug and c.status = 'active'
    and p.id = p_property_id and p.published = true
  limit 1;
$function$;

create or replace function public.get_public_crm_properties(p_slug text)
returns table(id uuid, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.updated_at
  from public.properties p
  join public.crm_companies c on c.id = p.company_id
  where c.slug = p_slug and c.status = 'active' and p.published = true
  order by p.updated_at desc nulls last;
$function$;

revoke all on function public.get_public_crm_property(text, uuid) from public;
revoke all on function public.get_public_crm_properties(text) from public;
grant execute on function public.get_public_crm_property(text, uuid) to anon, authenticated;
grant execute on function public.get_public_crm_properties(text) to anon, authenticated;