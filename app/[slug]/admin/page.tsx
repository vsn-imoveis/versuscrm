import { requireTenantMember } from "@/lib/tenant";

type Props = { params: Promise<{ slug: string }> };

export default async function TenantAdminPage({ params }: Props) {
  const { slug } = await params;
  const { supabase, tenant, user, membership } = await requireTenantMember(slug);

  const [properties, leads, contacts, launches] = await Promise.all([
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("company_id", tenant.id),
    supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("company_id", tenant.id),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }).eq("company_id", tenant.id),
    supabase.from("crm_launches").select("id", { count: "exact", head: true }).eq("company_id", tenant.id)
  ]);

  const stats = [
    ["Imóveis", properties.count ?? 0],
    ["Leads", leads.count ?? 0],
    ["Clientes e contatos", contacts.count ?? 0],
    ["Lançamentos", launches.count ?? 0]
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", color: "#202a33" }}>
      <header style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 5%", background: "#171d24", color: "#fff" }}>
        <strong style={{ color: tenant.primary_color ?? "#d3aa62", font: "30px Georgia,serif" }}>Versus</strong>
        <span style={{ fontSize: 13 }}>{user.email}</span>
      </header>
      <section style={{ maxWidth: 1240, margin: "auto", padding: "38px 24px" }}>
        <p style={{ color: "#b78d48", fontSize: 11, letterSpacing: 2 }}>PAINEL ADMINISTRATIVO</p>
        <h1 style={{ font: "36px Georgia,serif", margin: "8px 0" }}>{tenant.name}</h1>
        <p style={{ color: "#68737d", marginTop: 0 }}>Acesso: {membership.role}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginTop: 30 }}>
          {stats.map(([label, value]) => <article key={label} style={{ background: "#fff", padding: 24, borderRadius: 10, border: "1px solid #e3e6e8" }}><div style={{ color: "#68737d", fontSize: 13 }}>{label}</div><strong style={{ display: "block", fontSize: 32, marginTop: 10 }}>{value}</strong></article>)}
        </div>
        <p style={{ color: "#68737d", fontSize: 13, marginTop: 28 }}>Os indicadores são consultados exclusivamente para a empresa vinculada a este endereço.</p>
      </section>
    </main>
  );
}
