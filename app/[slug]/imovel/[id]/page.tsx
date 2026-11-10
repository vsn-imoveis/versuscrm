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
  company_name?: string | null; company_slug?: string | null;
};

async function loadProperty(slug: string, id: string): Promise<SeoProperty | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_crm_property", {
    p_slug: slug,
    p_property_id: id,
  });
  if (error) {
    console.error("[property-seo]", { slug, id, code: error.code, message: error.message });
    return null;
  }
  return data && typeof data === "object" ? data as SeoProperty : null;
}

const money = (value: number | string | null | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : null;
};

export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params;
  const p = await loadProperty(slug, id);
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
  const canonical = `https://versuscrm.vercel.app/${encodeURIComponent(p.company_slug || slug)}/imovel/${encodeURIComponent(p.id)}`;
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
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();
  const p = await loadProperty(slug, id);
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
