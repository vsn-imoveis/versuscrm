import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TenantLoginPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const suffix = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") suffix.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => suffix.append(key, item));
  }
  const queryString = suffix.toString();
  redirect(`/${encodeURIComponent(slug)}/admin/painel-login.html${queryString ? `?${queryString}` : ""}`);
}
