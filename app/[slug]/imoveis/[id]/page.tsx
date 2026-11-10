import { redirect } from "next/navigation";

export default async function PropertyCanonicalRedirect({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  redirect(`/${encodeURIComponent(slug)}/imovel/${encodeURIComponent(id)}`);
}
