import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const allowedOrigins = new Set([
  "https://versuscrm.com.br",
  "https://www.versuscrm.com.br",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://versuscrm.com.br";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return json({ success: false, error: "Origem não autorizada." }, 403, origin);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("[public-lead] Supabase server configuration is missing");
    return json({ success: false, error: "Serviço temporariamente indisponível. Tente novamente mais tarde." }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Dados inválidos." }, 400, origin);
  }

  const name = String(body.name || "").trim();
  const phoneInput = String(body.phone || "").trim();
  const phoneDigits = phoneInput.replace(/\D/g, "");
  const phone = phoneDigits.startsWith("55") && (phoneDigits.length === 12 || phoneDigits.length === 13)
    ? phoneDigits.slice(2)
    : phoneDigits;
  const email = String(body.email || "").trim().toLowerCase();
  const interest = String(body.interest || "Interesse comercial").trim();
  const message = String(body.message || "").trim();
  const sourceUrl = String(body.sourceUrl || "").trim();
  let campanha: string | null = null;
  try {
    const landingUrl = new URL(sourceUrl);
    campanha = landingUrl.searchParams.get("utm_campaign") || landingUrl.searchParams.get("campaign");
    if (!campanha && landingUrl.searchParams.has("gclid")) campanha = "Google Ads (sem utm_campaign)";
    if (!campanha && (landingUrl.searchParams.has("fbclid") || landingUrl.searchParams.has("igshid"))) campanha = "Meta Ads (sem utm_campaign)";
  } catch {
    campanha = null;
  }

  const validPhone = /^\d{10,11}$/.test(phone);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !validPhone || !validEmail || !message) {
    return json({ success: false, error: "Confira o nome, o WhatsApp com DDD, o e-mail e a mensagem." }, 400, origin);
  }
  if (name.length > 160 || phone.length > 50 || email.length > 254 || interest.length > 200 || message.length > 5000 || sourceUrl.length > 2000) {
    return json({ success: false, error: "Um ou mais campos excedem o tamanho permitido." }, 400, origin);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Leads comerciais do site institucional ficam isolados dos leads dos clientes.
  const { data: lead, error: insertError } = await supabase
    .from("leads_site")
    .insert({
      nome: name,
      telefone: phone,
      email,
      interesse: interest,
      mensagem: message,
      origem_url: sourceUrl || "https://versuscrm.com.br",
      campanha,
      status: "novo",
    })
    .select("id")
    .single();

  if (insertError || !lead) {
    console.error("[public-lead] leads_site insert failed", insertError?.message);
    return json({ success: false, error: "Não foi possível registrar o contato. Tente novamente." }, 500, origin);
  }

  // Notificações são complementares: falhas nelas não anulam o cadastro já salvo.
  const { data: admins, error: adminsError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (adminsError) {
    console.error("[public-lead] Could not load platform admins", adminsError.message);
  } else if (admins?.length) {
    const { error: notificationError } = await supabase
      .from("crm_user_notifications")
      .insert(admins.map((admin: { id: string }) => ({
        user_id: admin.id,
        company_id: null,
        title: "Novo interessado no Versus CRM",
        message: name + " demonstrou interesse em " + interest + ". E-mail: " + email + " · Telefone: " + phone,
        entity_type: "leads_site",
        action: "view_site_lead:" + lead.id,
        status: "new",
      })));

    if (notificationError) {
      console.error("[public-lead] Admin notification insert failed", notificationError.message);
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const emailText = [
      "Novo interessado nos planos do Versus CRM",
      "",
      "Nome: " + name,
      "Telefone: " + phone,
      "E-mail: " + email,
      "Plano/interesse: " + interest,
      "Mensagem: " + message,
      "Origem: " + (sourceUrl || "https://versuscrm.com.br"),
      "Campanha: " + (campanha || "Não identificada / acesso direto"),
      "Lead ID: " + lead.id,
    ].join("\n");

    try {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || "Versus CRM <nao-responda@versuscrm.com.br>",
          to: ["contato@versuscrm.com.br", "contatoversuscrm@gmail.com"],
          reply_to: email,
          subject: "Novo interessado — " + interest,
          text: emailText,
        }),
      });

      if (!emailResponse.ok) {
        console.error("[public-lead] Resend failed", { status: emailResponse.status, detail: await emailResponse.text() });
      }
    } catch (error) {
      console.error("[public-lead] Resend request failed", error);
    }
  } else {
    console.warn("[public-lead] RESEND_API_KEY is not configured; lead saved without email notification");
  }

  return json({
    success: true,
    leadId: lead.id,
    message: "Solicitação registrada com sucesso.",
  }, 200, origin);
}
