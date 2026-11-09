import { redirect } from "next/navigation";
import { requireTenantMember } from "@/lib/tenant";

type Props = { params: Promise<{ slug: string }> };

export default async function TenantAdminPage({ params }: Props) {
  const { slug } = await params;
  await requireTenantMember(slug);
  redirect(`/${encodeURIComponent(slug)}/admin/painel-login.html`);
}
