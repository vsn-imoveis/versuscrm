import { redirect } from "next/navigation";

export default async function LegacyPropertyRoute({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  redirect(`/${encodeURIComponent(slug)}/imoveis/${encodeURIComponent(id)}`);
}
