import { notFound } from "next/navigation";
import { getPublicTenant } from "@/lib/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OriginalPropertyFrame from "../../imoveis/[id]/original-frame";

type Props = { params: Promise<{ slug: string; id: string }> };
type SeoProperty = {
  id: string; code?: string | null; title?: string | null; description?: string | null;
  property_type?: string | null; price?: number | string | null; rent_price?: number | string | null;
  area?: number | string | null; bedrooms?: number | null; micro_neighborhood?: string | null;
  neighborhood?: string | null; city?: string | null; state?: string | null; photos?: string[] | null;
  company_name?: string | null; company_slug?: string | null; condominium_name?: string | null; address?: string | null; for_sale?: boolean | null; for_rent?: boolean | null; transaction_type?: string | null; updated_at?: string | null;
};

function seoSlugPart(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()
    .replace(/&/g, " e ").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").replace(/-+/g, "-").slice(0, 70).replace(/-+$/g, "");
}

function propertySeoSlug(p: SeoProperty) {
  const condo = seoSlugPart(p.condominium_name);
  const street = seoSlugPart(p.address);
  const bedrooms = Number(p.bedrooms || 0);
  const area = Number(p.area || 0);
  const type = (p.for_rent && !p.for_sale) ? "locacao"
    : (p.for_sale && !p.for_rent) ? "venda"
    : (p.transaction_type === "rent" ? "locacao"
    : p.transaction_type === "sale" ? "venda" : "imovel");
  return [condo, street, bedrooms ? bedrooms + "-dorm" : null, area ? Math.round(area) + "m2" : null, type]
    .filter(Boolean).join("-");
}

async function loadProperty(tenantSlug: string, requested: string): Promise<SeoProperty | null> {
  const supabase = await createSupabaseServerClient();
  // Backward compatibility: old UUID links keep working, while SEO slugs resolve from the tenant's published inventory.
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requested)) {
    const { data, error } = await supabase.rpc("get_public_crm_property", {
      p_slug: tenantSlug, p_property_id: requested,
    });
    if (error) console.error("[property-seo]", { tenantSlug, requested, code: error.code, message: error.message });
    return data && typeof data === "object" ? data as SeoProperty : null;
  }
  const { data, error } = await supabase.rpc("get_public_crm_properties", { p_slug: tenantSlug });
  if (error) {
    console.error("[property-seo-slug]", { tenantSlug, requested, code: error.code, message: error.message });
    return null;
  }
  const rows = Array.isArray(data) ? data as SeoProperty[] : [];
  return rows.find((property) => propertySeoSlug(property) === requested) || null;
}
const money = (value: number | string | null | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : null;
};

export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params;
  const propertyPath = id.endsWith(".html") ? id.slice(0, -5) : id;
  const p = await loadProperty(slug, propertyPath);
  if (!p) return { title: "Imóvel não encontrado", robots: { index: false, follow: false } };

  const company = p.company_name || slug;
  const title = `${p.title || p.property_type || "Imóvel"} | ${company}`.slice(0, 65);
  const place = [p.micro_neighborhood, p.neighborhood, p.city, p.state].filter(Boolean).join(", ");
  const description = [
    p.title || p.property_type || "Imóvel",
    place ? `em ${place}` : "",
    p.area ? `${Number(p.area).toLocaleString("pt-BR")} m²` : "",
    p.bedrooms ? `${p.bedrooms} quarto(s)` : "",
    p.price ? `Venda: ${money(p.price)}` : "",
    p.rent_price ? `Aluguel: ${money(p.rent_price)}/mês` : "",
  ].filter(Boolean).join(" · ").slice(0, 160);
  const canonical = `https://versuscrm.vercel.app/${encodeURIComponent(p.company_slug || slug)}/imovel/${propertySeoSlug(p)}.html`;
  const image = Array.isArray(p.photos) ? p.photos[0] : undefined;

  return {
    title, description,
    alternates: { canonical },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: { type: "website", url: canonical, siteName: company, title, description, ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function PublicPropertySeoPage({ params }: Props) {
  const { slug, id } = await params;
  const propertyPath = id.endsWith(".html") ? id.slice(0, -5) : id;
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();
  const p = await loadProperty(slug, propertyPath);
  if (!p) notFound();

  const query = new URLSearchParams({
    slug: tenant.slug,
    id: p.id,
    company: tenant.id,
    name: tenant.name || "",
    phone: tenant.whatsapp || tenant.contact_phone || "",
    color: tenant.primary_color || "#d3aa62",
  });
  return <OriginalPropertyFrame src={`/legacy-site/imovel.html?${query.toString()}`} />;
}
