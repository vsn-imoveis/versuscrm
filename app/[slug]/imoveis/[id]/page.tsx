import { notFound } from "next/navigation";
import { getPublicTenant } from "@/lib/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OriginalPropertyFrame from "./original-frame";

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return { title: "Imóvel não encontrado", robots: { index: false, follow: false } };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("properties").select("title,property_type,neighborhood,city,photos")
    .eq("company_id", tenant.id).eq("id", id).eq("published", true).maybeSingle();
  if (!data) return { title: "Imóvel não encontrado", robots: { index: false, follow: false } };
  const title = `${data.title || data.property_type || "Imóvel"} | ${tenant.name}`;
  const description = [data.title || data.property_type, data.neighborhood, data.city].filter(Boolean).join(" · ");
  const image = Array.isArray(data.photos) ? data.photos[0] : undefined;
  return {
    title, description,
    openGraph: { title, description, ...(image ? { images: [image] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function PropertyDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase.from("properties").select("id")
    .eq("company_id", tenant.id).eq("id", id).eq("published", true).maybeSingle();
  if (!property) notFound();

  const query = new URLSearchParams({
    slug: tenant.slug,
    id: property.id,
    company: tenant.id,
    name: tenant.name || "",
    phone: tenant.whatsapp || tenant.contact_phone || "",
    color: tenant.primary_color || "#d3aa62",
  });
  return <OriginalPropertyFrame src={`/legacy-site/imovel.html?${query.toString()}`} />;
}
