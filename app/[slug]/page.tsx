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
        <a href={`/${tenant.slug}/admin/login`} style={{ color: "#fff", textDecoration: "none", border: "1px solid #59616a", padding: "10px 16px", borderRadius: 6 }}>Área do cliente</a>
      </header>
      <section style={{ maxWidth: 1180, margin: "auto", padding: "12vh 24px" }}>
        <p style={{ color: tenant.primary_color ?? "#b78d48", letterSpacing: 3, fontSize: 12 }}>IMÓVEIS SELECIONADOS</p>
        <h1 style={{ maxWidth: 700, font: "clamp(38px,6vw,64px) Georgia,serif", lineHeight: 1.08, margin: "18px 0" }}>Encontre o imóvel ideal para sua próxima história.</h1>
        <p style={{ color: "#68737d", fontSize: 17 }}>Estamos preparando o catálogo de imóveis de {tenant.name}.</p>
      </section>
    </main>
  );
}
