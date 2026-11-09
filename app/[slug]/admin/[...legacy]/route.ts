import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string; legacy: string[] }> };

const allowedScreens = new Set([
  "painel-cadastro.html",
  "index.html",
  "painel-login.html",
  "cadastrar-condominio.html",
  "condominios.html",
  "editar-condominio.html",
  "construtoras.html",
  "lancamentos.html",
  "listar-lancamentos.html",
  "perfil-site.html",
  "proprietario.html",
  "solicitacoes-proprietario.html",
  "vendedor.html",
  "painel-2colunas-v3.html",
  "painel-2colunas.html",
  "painel-v2.html",
  "painel-v4.html",
  "painel-v5.html",
  "painel-v6.html",
  "painel-v7.html",
  "painel-v8.html",
  "painel-v11.html"
]);

export async function GET(request: NextRequest, context: Context) {
  const { slug, legacy } = await context.params;
  const requestedFile = legacy.join("/");

  if (requestedFile === "index.html") {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin/painel-login.html`, request.url));
  }

  if (!allowedScreens.has(requestedFile)) {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin`, request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Supabase do Versus não configurado.", { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin/login`, request.url));
  }

  const { data: tenantData, error: tenantError } = await supabase
    .rpc("get_public_tenant_by_slug", { p_slug: slug });
  const tenant = Array.isArray(tenantData) ? tenantData[0] : tenantData;
  if (tenantError || !tenant || tenant.status !== "active") {
    return new NextResponse("Imobiliária não encontrada ou inativa.", { status: 404 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("crm_memberships")
    .select("company_id, user_id, role")
    .eq("company_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: ownerAccount } = await supabase
    .from("crm_owner_accounts")
    .select("company_id, user_id, contact_id, status")
    .eq("company_id", tenant.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const isOwnerPortal = ["proprietario.html", "painel-cadastro.html"].includes(requestedFile) && !!ownerAccount;
  if ((membershipError || !membership) && !isOwnerPortal) {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin/login?erro=acesso`, request.url));
  }
  const effectiveRole = membership?.role ?? (isOwnerPortal ? "owner" : "member");

  const filePath = path.join(process.cwd(), "public", "legacy-admin", requestedFile);
  let html: string;
  try {
    html = await readFile(filePath, "utf8");
  } catch {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin`, request.url));
  }

  const config = JSON.stringify({
    slug,
    companyId: tenant.id,
    membershipRole: effectiveRole,
    ownerContactId: ownerAccount?.contact_id ?? null,
    supabaseUrl,
    supabaseAnonKey
  }).replace(/</g, "\\u003c");

  html = html.replace("<head>", `<head><script>window.__VERSUS_CONFIG=${config};window.__vsnCompanyId=window.__VERSUS_CONFIG.companyId;window.__vsnMembershipRole=window.__VERSUS_CONFIG.membershipRole;window.__vsnOwnerContactId=window.__VERSUS_CONFIG.ownerContactId;</script>`);
  html = html.replace(/href=(["\'])\/\1/g, `href="/${encodeURIComponent(slug)}"`);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
