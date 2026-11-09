import { notFound } from "next/navigation";
import { getPublicTenant } from "@/lib/tenant";

type Props = { params: Promise<{ slug: string }> };

export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();
  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f6", color: "#202a33" }}>
      <header style={{ minHeight: 76, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 6%", background: "#171d24", color: "#fff" }}>
        <strong style={{ color: tenant.primary_color ?? "#d3aa62", font: "34px Georgia,serif" }}>{tenant.name}</strong>
        <nav style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <a href={`/${tenant.slug}/imoveis`} style={{ color: "#fff", textDecoration: "none" }}>Imóveis</a>
          <a href={`/${tenant.slug}/admin/login`} style={{ color: "#fff", textDecoration: "none", border: "1px solid #59616a", padding: "10px 16px", borderRadius: 6 }}>Área administrativa</a>
        </nav>
      </header>
      <section style={{ maxWidth: 1180, margin: "auto", padding: "12vh 24px" }}>
        <p style={{ color: tenant.primary_color ?? "#b78d48", letterSpacing: 3, fontSize: 12 }}>IMÓVEIS SELECIONADOS</p>
        <h1 style={{ maxWidth: 700, font: "clamp(38px,6vw,64px) Georgia,serif", lineHeight: 1.08, margin: "18px 0" }}>Encontre o imóvel ideal para sua próxima história.</h1>
        <p style={{ color: "#68737d", fontSize: 17 }}>Conheça as oportunidades selecionadas por {tenant.name}.</p>
        <a href={`/${tenant.slug}/imoveis`} style={{ display: "inline-block", marginTop: 18, padding: "13px 22px", borderRadius: 6, background: "#202a33", color: "#fff", textDecoration: "none" }}>Ver imóveis</a>
      </section>
    </main>
  );
}
