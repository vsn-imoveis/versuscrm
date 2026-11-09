import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getPublicTenant(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crm_companies")
    .select("id, slug, name, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data || data.status !== "active") return null;
  return data;
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
