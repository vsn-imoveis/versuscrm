import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

// Public tenant entry point for the owner portal. The slug comes from the URL;
// authentication is intentionally handled by the owner portal after it loads.
export default async function TenantOwnerPortalEntry({ params }: Props) {
  const { slug } = await params;
  redirect(`/${encodeURIComponent(slug)}/admin/proprietario.html`);
}
