import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = String(body.address ?? "").trim();
    const number = String(body.number ?? "").trim();
    const city = String(body.city ?? "São Paulo").trim();
    const state = String(body.state ?? "SP").trim().toUpperCase();
    const cep = String(body.cep ?? "").replace(/\D/g, "");
    const neighborhood = String(body.neighborhood ?? "").trim();
    if (!address || !number) return NextResponse.json({ condominium_name: null, features: [], candidates: [], message: "Informe endereço e número." }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sessão não autenticada." }, { status: 401 });

    const referer = request.headers.get("referer") ?? "";
    const slugMatch = referer.match(/\/([^/]+)\/admin\//);
    const slug = String(body.slug ?? slugMatch?.[1] ?? "");
    let companyId = String(body.companyId ?? "");
    if (!companyId && slug) {
      const { data, error } = await supabase.rpc("get_public_tenant_by_slug", { p_slug: slug });
      const tenant = Array.isArray(data) ? data[0] : data;
      if (error || !tenant || tenant.status !== "active") return NextResponse.json({ error: "Imobiliária não encontrada." }, { status: 404 });
      companyId = tenant.id;
    }
    if (!companyId) return NextResponse.json({ error: "Contexto da imobiliária ausente." }, { status: 400 });

    const [{ data: membership }, { data: ownerAccount }] = await Promise.all([
      supabase.from("crm_memberships").select("company_id").eq("company_id", companyId).eq("user_id", user.id).maybeSingle(),
      supabase.from("crm_owner_accounts").select("company_id").eq("company_id", companyId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
    ]);
    if (!membership && !ownerAccount) return NextResponse.json({ error: "Sem acesso a esta imobiliária." }, { status: 403 });

    const { data: rows, error } = await supabase
      .from("crm_condominiums")
      .select("id,name,address,neighborhood,city,state,construction_year,builder,details")
      .eq("company_id", companyId)
      .eq("city", city)
      .eq("state", state)
      .limit(500);
    if (error) throw error;

    const clean = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
    const candidates = (rows ?? []).filter((row) => {
      const details = row.details ?? {};
      const numberMatch = digits(details.number) === digits(number);
      const cepMatch = cep.length === 8 && digits(details.cep) === cep;
      const addressMatch = clean(row.address) === clean(address);
      const neighborhoodMatch = !neighborhood || clean(row.neighborhood) === clean(neighborhood);
      return numberMatch && (cepMatch || addressMatch) && neighborhoodMatch;
    });
    if (candidates.length !== 1) {
      return NextResponse.json({ condominium_name: null, features: [], candidates: candidates.map((row) => ({ name: row.name })), confidence: "insuficiente", evidence: candidates.length ? "Há mais de um condomínio possível para este endereço." : "Nenhum condomínio cadastrado com este endereço exato." });
    }

    const condo = candidates[0], details = condo.details ?? {};
    return NextResponse.json({
      condominium_name: condo.name,
      condominium_id: condo.id,
      features: Array.isArray(details.features) ? details.features : [],
      condominium_builder: condo.builder,
      condominium_construction_year: condo.construction_year,
      condominium_delivery_year: details.delivery_year ?? null,
      condominium_units: details.units ?? null,
      towers: details.towers ?? null,
      floors: details.floors ?? null,
      confidence: "alta",
      evidence: "Condomínio encontrado no catálogo desta imobiliária por endereço e número.",
      from_database: true,
      saved_to_database: false,
      candidates: [{ name: condo.name, source: "Catálogo da imobiliária", evidence_hits: 1 }],
    });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao identificar o condomínio.", message: error instanceof Error ? error.message : String(error), candidates: [] }, { status: 500 });
  }
}
