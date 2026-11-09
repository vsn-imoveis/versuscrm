type TenantPageProps = { params: Promise<{ slug: string }> };

export default async function TenantPage({ params }: TenantPageProps) {
  const { slug } = await params;
  return (
    <main style={{ maxWidth: 920, margin: "10vh auto", padding: 32 }}>
      <h1>Site imobiliário</h1>
      <p>Ambiente: {slug}</p>
      <p>Estrutura inicial. O conteúdo público será carregado da empresa correspondente no banco exclusivo do Versus.</p>
    </main>
  );
}
