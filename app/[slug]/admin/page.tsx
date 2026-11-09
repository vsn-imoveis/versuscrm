import { requireTenantMember } from "@/lib/tenant";

type Props = { params: Promise<{ slug: string }> };

export default async function TenantAdminPage({ params }: Props) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenantMember(slug);

  return (
    <main style={{ maxWidth: 1100, margin: "8vh auto", padding: 28 }}>
      <p style={{ color: "#9a8357", letterSpacing: 2, fontSize: 12 }}>VERSUS CRM · PAINEL</p>
      <h1 style={{ fontSize: 32 }}>{tenant.name ?? "Painel da imobiliária"}</h1>
      <p style={{ color: "#64748b" }}>Usuário: {user.email} · Perfil: {membership.role ?? "membro"}</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginTop: 34 }}>
        {["Imóveis", "Leads", "Clientes", "Proprietários"].map(item => <div key={item} style={{ background: "#fff", border: "1px solid #e6e8eb", borderRadius: 12, padding: 22 }}><strong>{item}</strong><p style={{ color: "#87909c", fontSize: 13 }}>Módulo em integração</p></div>)}
      </section>
    </main>
  );
}
