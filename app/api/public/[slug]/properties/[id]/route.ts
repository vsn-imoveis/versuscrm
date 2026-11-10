import { NextResponse } from "next/server";
import { getPublicTenant } from "@/lib/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return NextResponse.json({ error: "Imobiliária não encontrada." }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("properties").select("*")
    .eq("company_id", tenant.id).eq("id", id).eq("published", true).maybeSingle();

  if (error) {
    console.error("[public-property-api]", { slug, id, code: error.code, message: error.message });
    return NextResponse.json({ error: "Falha ao consultar imóvel." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  return NextResponse.json({ property: data }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
