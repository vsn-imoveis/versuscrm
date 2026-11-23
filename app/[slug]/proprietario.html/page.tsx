import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function TenantOwnerPortalPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/${encodeURIComponent(slug)}/admin/proprietario.html`);
}
