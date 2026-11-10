import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_crm_property", {
    p_slug: slug,
    p_property_id: id,
  });

  if (error) {
    console.error("[public-property-api]", { slug, id, code: error.code, message: error.message });
    return NextResponse.json({ error: "Falha ao consultar imóvel." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  return NextResponse.json({ property: data }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
