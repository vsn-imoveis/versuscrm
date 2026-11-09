import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getPublicTenant(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_tenant_by_slug", { p_slug: slug });
  if (error || !data?.length || data[0].status !== "active") return null;
  return data[0] as {
    id: string; slug: string; name: string; status: string;
    logo_url: string | null; primary_color: string | null;
    contact_name: string | null; contact_email: string | null; contact_phone: string | null;
    whatsapp: string | null; creci: string | null;
    instagram_url: string | null; facebook_url: string | null; youtube_url: string | null;
    public_address: string | null; about_text: string | null;
    site_photo_url: string | null; site_cover_url: string | null; site_share_image_url: string | null;
  };
}

export async function requireTenantMember(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${encodeURIComponent(slug)}/admin/login`);

  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  const { data: membership, error } = await supabase
    .from("crm_memberships")
    .select("company_id, user_id, role")
    .eq("company_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !membership) redirect(`/${encodeURIComponent(slug)}/admin/login?erro=acesso`);
  return { supabase, user, tenant, membership };
}
