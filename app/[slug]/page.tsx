import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTenant } from "@/lib/tenant";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return { title: "Imobiliária não encontrada" };
  return {
    title: tenant.name,
    description: tenant.about_text || `Encontre imóveis selecionados por ${tenant.name}.`,
    openGraph: {
      title: tenant.name,
      description: tenant.about_text || `Conheça os imóveis de ${tenant.name}.`,
      images: tenant.site_share_image_url ? [tenant.site_share_image_url] : tenant.logo_url ? [tenant.logo_url] : [],
    },
  };
}

export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("As variáveis públicas do Supabase não estão configuradas.");
  }

  const query = new URLSearchParams({
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
  });

  return (
    <main style={{ width: "100%", minHeight: "100dvh", margin: 0, padding: 0, overflow: "hidden" }}>
      <link
        rel="preload"
        as="image"
        href={tenant.site_cover_url || "/hero-v12.jpg"}
        fetchPriority="high"
      />
      <iframe
        title={tenant.name}
        src={`/legacy-site/index.html?${query.toString()}`}
        style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </main>
  );
}
