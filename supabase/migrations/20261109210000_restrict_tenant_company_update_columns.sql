revoke update on table public.crm_companies from authenticated;

grant update (
  name,
  contact_name,
  contact_email,
  contact_phone,
  logo_url,
  primary_color,
  instagram_url,
  facebook_url,
  youtube_url,
  public_address,
  about_text,
  site_photo_url,
  site_cover_url,
  site_share_image_url,
  whatsapp,
  creci,
  updated_at
) on table public.crm_companies to authenticated;