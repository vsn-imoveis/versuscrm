import { notFound } from "next/navigation";
import { getPublicTenant } from "@/lib/tenant";

type Props = { params: Promise<{ slug: string }> };

export default async function TenantPropertiesPage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  const { data: properties, error } = await (await import("@/lib/supabase/server")).createSupabaseServerClient()
    .then(client => client.from("properties")
      .select("id,code,title,property_type,transaction_type,price,rent_price,area,bedrooms,bathrooms,parking,neighborhood,city,photos,photo_thumbnails,for_sale,for_rent")
      .eq("company_id", tenant.id).eq("published", true).order("created_at", { ascending: false }).limit(24));

  if (error) throw new Error("Não foi possível carregar os imóveis publicados.");

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f6", color: "#202a33" }}>
      <header style={{ background: "#171d24", color: "#fff", padding: "20px 5%" }}><a href={`/${slug}`} style={{ color: tenant.primary_color ?? "#d3aa62", font: "30px Georgia,serif", textDecoration: "none" }}>{tenant.name}</a></header>
      <section style={{ maxWidth: 1200, margin: "auto", padding: "44px 22px" }}>
        <p style={{ color: "#b78d48", letterSpacing: 2, fontSize: 11 }}>PORTFÓLIO</p><h1 style={{ font: "38px Georgia,serif" }}>Imóveis disponíveis</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 28 }}>
          {properties?.map(p => {
            const photos = Array.isArray(p.photos) ? p.photos : [];
            const photo = photos[0];
            return <a key={p.id} href={`/${slug}/imovel/${p.id}`} style={{ display: "block", background: "#fff", border: "1px solid #e6e8ea", borderRadius: 10, overflow: "hidden", color: "inherit", textDecoration: "none" }}>
              {photo ? <img src={photo} alt={p.title} style={{ width: "100%", height: 210, objectFit: "cover" }} /> : <div style={{ height: 210, background: "#e9ecef", display: "grid", placeItems: "center", color: "#8b9299" }}>Foto não disponível</div>}
              <div style={{ padding: 18 }}><small style={{ color: "#8a929a" }}>{p.code ?? p.property_type}</small><h2 style={{ font: "21px Georgia,serif", margin: "8px 0" }}>{p.title}</h2><p style={{ color: "#68737d", fontSize: 13 }}>{[p.neighborhood,p.city].filter(Boolean).join(" · ")}</p><strong>{p.for_rent && !p.for_sale || p.transaction_type === "rent" ? `R$ ${Number(p.rent_price ?? p.price ?? 0).toLocaleString("pt-BR")}/mês` : `R$ ${Number(p.price ?? 0).toLocaleString("pt-BR")}`}</strong><p style={{ color: "#68737d", fontSize: 12 }}>{p.area ?? "—"} m² · {p.bedrooms} quartos · {p.bathrooms} banheiros · {p.parking} vagas</p></div>
            </a>;
          })}
        </div>
        {!properties?.length && <p style={{ color: "#68737d", marginTop: 28 }}>Nenhum imóvel publicado no momento.</p>}
      </section>
    </main>
  );
}
