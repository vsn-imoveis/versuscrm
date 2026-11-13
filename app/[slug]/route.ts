import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublicTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (char) => entities[char] ?? char);
}

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return new Response("Imobiliária não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("As variáveis públicas do Supabase não estão configuradas.");
  }

  const config = {
    slug: tenant.slug,
    companyId: tenant.id,
    supabaseUrl,
    supabaseKey,
    tenantName: tenant.name,
    primaryColor: tenant.primary_color ?? "",
    logoUrl: tenant.logo_url ?? "",
    contactName: tenant.contact_name ?? "",
    contactEmail: tenant.contact_email ?? "",
    contactPhone: tenant.contact_phone ?? "",
    whatsapp: tenant.whatsapp ?? "",
    creci: tenant.creci ?? "",
    instagramUrl: tenant.instagram_url ?? "",
    facebookUrl: tenant.facebook_url ?? "",
    youtubeUrl: tenant.youtube_url ?? "",
    publicAddress: tenant.public_address ?? "",
    aboutText: tenant.about_text ?? "",
    sitePhotoUrl: tenant.site_photo_url ?? "",
    siteCoverUrl: tenant.site_cover_url ?? "",
    siteShareImageUrl: tenant.site_share_image_url ?? "",
  };

  const htmlPath = join(process.cwd(), "public", "legacy-site", "index.html");
  let html = await readFile(htmlPath, "utf8");

  const safeConfig = JSON.stringify(config).replace(/</g, "\\u003c");
  const bootstrap = `<script>window.__VERSUS_TENANT_CONFIG__=${safeConfig};</script>`;
  html = html.replace("</head>", `${bootstrap}</head>`);

  const description = escapeHtml(
    tenant.about_text || `Encontre imóveis selecionados por ${tenant.name}.`,
  );
  const titleStart = html.indexOf("<title>");
  const titleEnd = html.indexOf("</title>", titleStart);
  if (titleStart >= 0 && titleEnd >= 0) {
    html = html.slice(0, titleStart) + `<title>${escapeHtml(tenant.name)}</title>` + html.slice(titleEnd + 8);
  }
  html = html
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${description}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="/${encodeURIComponent(tenant.slug)}">`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
