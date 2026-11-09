-- Do not expose public contact/branding fields for suspended tenant accounts.
create or replace function public.get_public_tenant_by_slug(p_slug text)
returns table(
  id uuid, slug text, name text, status text, logo_url text, primary_color text,
  contact_name text, contact_email text, contact_phone text, whatsapp text, creci text,
  instagram_url text, facebook_url text, youtube_url text, public_address text,
  about_text text, site_photo_url text, site_cover_url text, site_share_image_url text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id,c.slug,c.name,c.status,c.logo_url,c.primary_color,
    c.contact_name,c.contact_email,c.contact_phone,c.whatsapp,c.creci,
    c.instagram_url,c.facebook_url,c.youtube_url,c.public_address,c.about_text,
    c.site_photo_url,c.site_cover_url,c.site_share_image_url
  from public.crm_companies c
  where c.slug = lower(trim(p_slug))
    and c.status = 'active'
  limit 1;
$function$;
