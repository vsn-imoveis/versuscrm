import { redirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function TenantAdminPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/${encodeURIComponent(slug)}/admin/painel-login.html`);
}
