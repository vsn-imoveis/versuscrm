import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 920, margin: "10vh auto", padding: 32 }}>
      <p style={{ color: "#64748b", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Plataforma imobiliária</p>
      <h1 style={{ fontSize: 42, margin: "12px 0" }}>Versus CRM</h1>
      <p style={{ color: "#64748b", lineHeight: 1.7 }}>
        Nova base do sistema, independente do VSN Imóveis e preparada para atender várias imobiliárias com isolamento de dados.
      </p>
      <p style={{ marginTop: 28 }}>
        <Link href="/mario">Acessar ambiente de Mario</Link>
      </p>
    </main>
  );
}
