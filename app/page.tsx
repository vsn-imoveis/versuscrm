import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 920, margin: "10vh auto", padding: 32 }}>
      <p style={{ color: "#64748b", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Plataforma imobiliária</p>
      <h1 style={{ fontSize: 42, margin: "12px 0" }}>Versus CRM</h1>
      <p style={{ color: "#64748b", lineHeight: 1.7 }}>
        Plataforma de gestão imobiliária multiempresa, com sites e operações independentes por imobiliária.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 28 }}>
        <Link href="/mario">Site de Mario</Link>
        <Link href="/mario/admin/login">Painel de Mario</Link>
        <Link href="/gestao/empresas">Gestão de imobiliárias</Link>
      </div>
    </main>
  );
}
