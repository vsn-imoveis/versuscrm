import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getPublicTenant(slug: string) {
  const normalizedSlug = String(slug ?? "").trim().toLowerCase();
  if (!normalizedSlug) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_tenant_by_slug", { p_slug: normalizedSlug });

  // Keep database/API failures distinct from a genuinely unknown tenant. Returning
  // null for both cases made a broken Supabase request look like a misleading 404.
  if (error) {
    console.error("[tenant] get_public_tenant_by_slug failed", {
      slug: normalizedSlug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`Falha ao consultar a imobiliária (${error.code || "Supabase"}): ${error.message}`);
  }

  const tenant = Array.isArray(data) ? data[0] : data;
  if (!tenant || tenant.status !== "active") {
    console.warn("[tenant] active tenant not found", { slug: normalizedSlug, returned: Boolean(tenant) });
    return null;
  }

  return tenant as {
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
