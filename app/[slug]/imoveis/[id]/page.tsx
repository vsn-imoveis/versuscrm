import { notFound } from "next/navigation";
import { getPublicTenant } from "@/lib/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PropertyLeadForm from "./lead-form";
import PropertyGallery from "./gallery";

type Props = { params: Promise<{ slug: string; id: string }> };

function money(value: unknown, suffix = "") {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return "Consulte";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) + suffix;
}

export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return { title: "Imóvel não encontrado" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("properties").select("title,neighborhood,city").eq("company_id", tenant.id).eq("id", id).eq("published", true).maybeSingle();
  return { title: data ? `${data.title} | ${tenant.name}` : tenant.name, description: data ? [data.title,data.neighborhood,data.city].filter(Boolean).join(" · ") : tenant.name };
}

export default async function PropertyDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: property, error } = await supabase
    .from("properties").select("*")
    .eq("company_id", tenant.id).eq("id", id).eq("published", true).maybeSingle();
  if (error || !property) notFound();

  const photos = Array.isArray(property.photos) ? property.photos.filter(Boolean) : [];
  const thumbnails = Array.isArray(property.photo_thumbnails) ? property.photo_thumbnails : [];
  const gallery = photos.length ? photos : thumbnails;
  const sale = property.for_sale || property.transaction_type === "sale" || property.transaction_type === "both";
  const rent = property.for_rent || property.transaction_type === "rent" || property.transaction_type === "both";
  const primaryColor = tenant.primary_color || "#b89a61";
  const location = [property.address,property.number,property.complement,property.neighborhood,property.city,property.state].filter(Boolean).join(", ");
  const features = Array.isArray(property.features) ? property.features : Array.isArray(property.property_features) ? property.property_features : [];
  const whatsapp = String(tenant.whatsapp || tenant.contact_phone || "").replace(/\D/g, "");
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.startsWith("55") ? whatsapp : "55" + whatsapp}?text=${encodeURIComponent("Olá, tenho interesse no imóvel " + (property.code || property.title) + ".")}` : null;

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f5", color: "#1e2932" }}>
      <header style={{ background: "#17212a", color: "#fff", padding: "18px clamp(18px,5vw,72px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
        <a href={`/${slug}`} style={{ color: "#fff", textDecoration: "none", font: "26px Georgia,serif" }}>{tenant.name}</a>
        <a href={`/${slug}/imoveis`} style={{ color: "#fff", textDecoration: "none", fontSize: 14 }}>Ver todos os imóveis</a>
      </header>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 70px" }}>
        <a href={`/${slug}`} style={{ color: "#697681", textDecoration: "none", fontSize: 13 }}>Início</a>
        <span style={{ color: "#a2aab0", margin: "0 9px" }}>/</span>
        <a href={`/${slug}/imoveis`} style={{ color: "#697681", textDecoration: "none", fontSize: 13 }}>Imóveis</a>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "end", gap: 18, margin: "24px 0" }}>
          <div><p style={{ color: primaryColor, fontSize: 11, letterSpacing: 2, margin: "0 0 8px" }}>{property.code || "IMÓVEL SELECIONADO"}</p><h1 style={{ font: "clamp(28px,4vw,42px) Georgia,serif", margin: 0 }}>{property.title || property.property_type || "Imóvel"}</h1><p style={{ color: "#6d7881", margin: "9px 0 0" }}>{location}</p></div>
          <div style={{ textAlign: "right" }}>
            {sale && <strong style={{ display: "block", fontSize: 24 }}>{money(property.price)}</strong>}
            {rent && <strong style={{ display: "block", fontSize: 24 }}>{money(property.rent_price || property.price, "/mês")}</strong>}
            <span style={{ color: "#7c858c", fontSize: 12 }}>{sale && rent ? "Venda ou locação" : rent ? "Locação" : "Venda"}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(280px,.8fr)", gap: 26, alignItems: "start" }}>
          <section>
            <PropertyGallery photos={gallery as string[]} title={property.title || property.property_type || "Imóvel"} accent={primaryColor} />
            <div style={{ background: "#fff", border: "1px solid #e8e9e7", borderRadius: 8, padding: 24, marginTop: 20 }}>
              <h2 style={{ font: "25px Georgia,serif", marginTop: 0 }}>Sobre o imóvel</h2>
              <p style={{ color: "#5d6871", lineHeight: 1.8, whiteSpace: "pre-line" }}>{property.description || "Entre em contato para receber mais informações sobre este imóvel."}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 14, marginTop: 20 }}>
                {[["Área",property.area ? `${property.area} m²` : "—"],["Quartos",property.bedrooms ?? "—"],["Suítes",property.suites ?? "—"],["Banheiros",property.bathrooms ?? "—"],["Vagas",property.parking ?? "—"],["Condomínio",property.condominium_name || "—"]].map(([label,value]) => <div key={label}><small style={{ color: "#8b949a" }}>{label}</small><strong style={{ display: "block", marginTop: 5 }}>{value}</strong></div>)}
              </div>
              {!!features.length && <><h3 style={{ font: "20px Georgia,serif", margin: "26px 0 12px" }}>Características</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{features.map((feature: string) => <span key={feature} style={{ background: "#f2f3f1", padding: "8px 11px", borderRadius: 20, fontSize: 12 }}>{feature}</span>)}</div></>}
            </div>
          </section>
          <aside style={{ position: "sticky", top: 18, background: "#fff", border: "1px solid #e8e9e7", borderRadius: 8, padding: 22 }}>
            <p style={{ color: primaryColor, fontSize: 11, letterSpacing: 2, marginTop: 0 }}>FALE COM A IMOBILIÁRIA</p>
            <h2 style={{ font: "24px Georgia,serif", margin: "8px 0" }}>{tenant.name}</h2>
            <p style={{ color: "#6d7881", fontSize: 13, lineHeight: 1.6 }}>Solicite mais informações, agende uma visita ou tire suas dúvidas.</p>
            {whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", padding: 13, borderRadius: 6, background: "#1f6a4a", color: "#fff", textDecoration: "none", fontWeight: 700, margin: "18px 0" }}>Conversar pelo WhatsApp</a>}
            <PropertyLeadForm slug={slug} propertyTitle={property.title || property.property_type || "Imóvel"} companyName={tenant.name} propertyCode={property.code} />
          </aside>
        </div>
      </div>
      <style>{`@media(max-width:800px){main>div>div[style*="1.7fr"]{display:block!important}aside{position:static!important;margin-top:20px}} `}</style>
    </main>
  );
}
