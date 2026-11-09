import { requirePlatformAdmin } from "@/lib/platform-admin";

export default async function CompaniesManagementPage() {
  const { supabase, user } = await requirePlatformAdmin();
  const { data: companies, error } = await supabase
    .from("crm_companies")
    .select("id,name,slug,contact_name,contact_email,contact_phone,status,max_properties,max_photos_per_property,created_at,crm_subscriptions(plan_name,monthly_price,status,property_limit,photo_limit)")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Não foi possível carregar as imobiliárias.");

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", color: "#202a33" }}>
      <header style={{ background: "#171d24", color: "#fff", padding: "18px 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ color: "#d3aa62", font: "30px Georgia,serif" }}>Versus · Gestão</strong>
        <span style={{ fontSize: 13 }}>{user.email}</span>
      </header>
      <section style={{ maxWidth: 1280, margin: "auto", padding: "38px 24px" }}>
        <p style={{ color: "#b78d48", fontSize: 11, letterSpacing: 2 }}>ADMINISTRAÇÃO DA PLATAFORMA</p>
        <h1 style={{ font: "36px Georgia,serif", margin: "8px 0" }}>Imobiliárias clientes</h1>
        <p style={{ color: "#68737d" }}>Empresas, planos e limites cadastrados no banco exclusivo do Versus.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, margin: "28px 0" }}>
          <Summary label="Empresas cadastradas" value={companies?.length ?? 0} />
          <Summary label="Ativas" value={companies?.filter(c => c.status === "active").length ?? 0} />
          <Summary label="Pendentes" value={companies?.filter(c => c.status === "pending").length ?? 0} />
        </div>
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e3e6e8", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead><tr>{["Imobiliária","Slug / endereço","Responsável","Plano","Limites","Status"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {companies?.map(company => {
                const sub = Array.isArray(company.crm_subscriptions) ? company.crm_subscriptions[0] : company.crm_subscriptions;
                return <tr key={company.id}>
                  <td style={td}><strong>{company.name}</strong><div style={muted}>{company.contact_email}</div></td>
                  <td style={td}><code>{company.slug}</code><div style={muted}>/{company.slug}</div></td>
                  <td style={td}>{company.contact_name ?? "—"}<div style={muted}>{company.contact_phone ?? ""}</div></td>
                  <td style={td}>{sub?.plan_name ?? "Sem plano"}<div style={muted}>R$ {Number(sub?.monthly_price ?? 0).toFixed(2).replace(".", ",")}/mês</div></td>
                  <td style={td}>{company.max_properties} imóveis<div style={muted}>{company.max_photos_per_property} fotos por imóvel</div></td>
                  <td style={td}><span style={{ ...statusStyle, background: company.status === "active" ? "#e8f5ed" : "#fff4df", color: company.status === "active" ? "#187344" : "#9a6412" }}>{company.status}</span></td>
                </tr>;
              })}
              {!companies?.length && <tr><td style={td} colSpan={6}>Nenhuma imobiliária cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <article style={{ background: "#fff", border: "1px solid #e3e6e8", borderRadius: 10, padding: 20 }}><div style={{ color: "#68737d", fontSize: 13 }}>{label}</div><strong style={{ display: "block", fontSize: 30, marginTop: 8 }}>{value}</strong></article>;
}
const th: React.CSSProperties = { textAlign: "left", padding: 15, fontSize: 12, color: "#68737d", background: "#fafafa", borderBottom: "1px solid #e3e6e8" };
const td: React.CSSProperties = { padding: 15, borderBottom: "1px solid #edf0f2", verticalAlign: "top", fontSize: 13 };
const muted: React.CSSProperties = { color: "#7b8490", fontSize: 11, marginTop: 5 };
const statusStyle: React.CSSProperties = { padding: "5px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 };
