import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";

type SiteLead = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  interesse: string;
  mensagem: string;
  origem_url: string | null;
  status: "novo" | "contatado" | "qualificado" | "convertido" | "perdido";
  observacoes_internas: string | null;
  created_at: string;
};

const statusLabels: Record<SiteLead["status"], string> = {
  novo: "Novo",
  contatado: "Contatado",
  qualificado: "Qualificado",
  convertido: "Convertido",
  perdido: "Perdido",
};

export default async function SiteLeadsPage() {
  const { supabase, user } = await requirePlatformAdmin();
  const { data: leads, error } = await supabase
    .from("leads_site")
    .select("id,nome,telefone,email,interesse,mensagem,origem_url,status,observacoes_internas,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[gestao/leads] Failed to load leads_site", error.message);
    throw new Error("Não foi possível carregar os leads do site.");
  }

  const rows = (leads ?? []) as SiteLead[];
  const count = (status: SiteLead["status"]) => rows.filter((lead) => lead.status === status).length;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", color: "#202a33" }}>
      <header style={{ background: "#171d24", color: "#fff", padding: "18px 5%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <Link href="/gestao/empresas" style={{ color: "#d3aa62", font: "30px Georgia,serif", textDecoration: "none" }}>Versus · Gestão</Link>
        <span style={{ fontSize: 13 }}>{user.email}</span>
      </header>
      <section style={{ maxWidth: 1400, margin: "auto", padding: "38px 24px" }}>
        <nav style={{ display: "flex", gap: 18, marginBottom: 28, fontSize: 13 }}>
          <Link href="/gestao/empresas" style={navLink}>Imobiliárias clientes</Link>
          <Link href="/gestao/leads" style={{ ...navLink, color: "#9a6b20", fontWeight: 800 }}>Leads do site</Link>
        </nav>
        <p style={{ color: "#b78d48", fontSize: 11, letterSpacing: 2 }}>COMERCIAL · SITE INSTITUCIONAL</p>
        <h1 style={{ font: "36px Georgia,serif", margin: "8px 0" }}>Leads do site</h1>
        <p style={{ color: "#68737d" }}>Interessados em contratar o Versus CRM. Estes registros ficam separados dos leads das imobiliárias clientes.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, margin: "28px 0" }}>
          <Summary label="Total de interessados" value={rows.length} />
          <Summary label="Novos" value={count("novo")} />
          <Summary label="Contatados" value={count("contatado")} />
          <Summary label="Qualificados" value={count("qualificado")} />
          <Summary label="Convertidos" value={count("convertido")} />
        </div>

        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e3e6e8", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
            <thead><tr>{["Interessado","Contato","Plano / interesse","Mensagem","Data","Status"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id}>
                  <td style={td}><strong>{lead.nome}</strong><div style={muted}>{lead.email}</div></td>
                  <td style={td}><a href={"https://wa.me/" + lead.telefone.replace(/\\D/g, "")} target="_blank" rel="noreferrer" style={{ color: "#187344", textDecoration: "none" }}>{lead.telefone}</a></td>
                  <td style={td}>{lead.interesse}</td>
                  <td style={{ ...td, maxWidth: 340, whiteSpace: "pre-wrap" }}>{lead.mensagem}</td>
                  <td style={td}>{new Date(lead.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</td>
                  <td style={td}><span style={{ ...statusStyle, background: lead.status === "convertido" ? "#e8f5ed" : lead.status === "perdido" ? "#fcebea" : "#fff4df", color: lead.status === "convertido" ? "#187344" : lead.status === "perdido" ? "#a33b32" : "#9a6412" }}>{statusLabels[lead.status]}</span></td>
                </tr>
              ))}
              {!rows.length && <tr><td style={td} colSpan={6}>Ainda não há interessados cadastrados pelo site.</td></tr>}
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

const navLink: React.CSSProperties = { color: "#68737d", textDecoration: "none" };
const th: React.CSSProperties = { textAlign: "left", padding: 15, fontSize: 12, color: "#68737d", background: "#fafafa", borderBottom: "1px solid #e3e6e8" };
const td: React.CSSProperties = { padding: 15, borderBottom: "1px solid #edf0f2", verticalAlign: "top", fontSize: 13 };
const muted: React.CSSProperties = { color: "#7b8490", fontSize: 11, marginTop: 5 };
const statusStyle: React.CSSProperties = { padding: "5px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 };
