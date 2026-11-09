import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Condo = {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  construction_year: number | null;
  builder: string | null;
  details: Record<string, unknown> | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function text(details: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = details[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sessão não autenticada." }, { status: 401 });

    const referer = request.headers.get("referer");
    if (!referer) return NextResponse.json({ error: "Origem da consulta não identificada." }, { status: 400 });
    const refererUrl = new URL(referer);
    const parts = refererUrl.pathname.split("/").filter(Boolean);
    const slug = parts[0] === "admin" ? "" : parts[0];
    if (!slug || parts[1] !== "admin") return NextResponse.json({ error: "Imobiliária não identificada." }, { status: 400 });

    const { data: tenantRows, error: tenantError } = await supabase.rpc("get_public_tenant_by_slug", { p_slug: slug });
    const tenant = Array.isArray(tenantRows) ? tenantRows[0] : tenantRows;
    if (tenantError || !tenant || tenant.status !== "active") {
      return NextResponse.json({ error: "Imobiliária não encontrada ou inativa." }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("crm_memberships").select("role")
      .eq("company_id", tenant.id).eq("user_id", user.id).maybeSingle();
    const { data: ownerAccount } = await supabase
      .from("crm_owner_accounts").select("contact_id")
      .eq("company_id", tenant.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!membership && !ownerAccount) return NextResponse.json({ error: "Sem permissão para consultar condomínios desta imobiliária." }, { status: 403 });

    const body = await request.json();
    const address = String(body.address ?? "").trim();
    const number = String(body.number ?? "").trim();
    const neighborhood = String(body.neighborhood ?? "").trim();
    const city = String(body.city ?? "").trim();
    const state = String(body.state ?? "").trim();
    const cep = String(body.cep ?? "").replace(/\D/g, "");
    if (!address || !number) return NextResponse.json({ error: "Informe endereço e número." }, { status: 400 });

    const { data, error } = await supabase
      .from("crm_condominiums")
      .select("id,name,address,neighborhood,city,state,construction_year,builder,details")
      .eq("company_id", tenant.id)
      .limit(1000);
    if (error) return NextResponse.json({ error: "Não foi possível consultar a base de condomínios." }, { status: 500 });

    const wantedAddress = normalize(address);
    const wantedNumber = normalize(number);
    const wantedNeighborhood = normalize(neighborhood);
    const wantedCity = normalize(city);
    const wantedState = normalize(state);
    const wantedCep = normalize(cep);
    let best: { condo: Condo; score: number } | null = null;

    for (const row of (data ?? []) as Condo[]) {
      const details = row.details ?? {};
      const condoAddress = normalize(row.address);
      const condoNumber = normalize(text(details, "number", "street_number"));
      const condoCep = normalize(text(details, "cep", "postal_code")).replace(/\D/g, "");
      let score = 0;
      if (condoAddress && (condoAddress === wantedAddress || condoAddress.includes(wantedAddress) || wantedAddress.includes(condoAddress))) score += 5;
      if (condoNumber && condoNumber === wantedNumber) score += 5;
      if (normalize(row.neighborhood) && normalize(row.neighborhood) === wantedNeighborhood) score += 2;
      if (normalize(row.city) && normalize(row.city) === wantedCity) score += 2;
      if (normalize(row.state) && normalize(row.state) === wantedState) score += 1;
      if (wantedCep && condoCep && wantedCep === condoCep) score += 5;
      if (!best || score > best.score) best = { condo: row, score };
    }

    if (!best || best.score < 7) {
      return NextResponse.json({ condominium_name: null, features: [], confidence: null, evidence: null });
    }

    const condo = best.condo;
    const details = condo.details ?? {};
    const features = Array.isArray(details.features) ? details.features.filter((value): value is string => typeof value === "string") : [];
    const evidence = [condo.address, text(details, "number"), condo.neighborhood, condo.city, condo.state].filter(Boolean).join(", ");
    return NextResponse.json({
      condominium_id: condo.id,
      condominium_name: condo.name,
      condominium_builder: condo.builder || text(details, "builder", "construtora"),
      condominium_delivery_year: text(details, "delivery_year", "construction_year") ?? condo.construction_year,
      condominium_units: text(details, "units", "unit_count"),
      condominium_land_area: text(details, "land_area", "total_land_area"),
      condominium_towers: text(details, "towers", "tower_count"),
      condominium_floors: text(details, "floors", "floor_count"),
      features,
      confidence: best.score >= 12 ? "alta" : "média",
      evidence,
    });
  } catch (error) {
    console.error("[Versus] identify condo", error);
    return NextResponse.json({ error: "Falha ao consultar o condomínio." }, { status: 500 });
  }
}
