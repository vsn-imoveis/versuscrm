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
    "Vary": "Origin",
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
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const interest = String(body.interest || "Interesse comercial").trim();
  const message = String(body.message || "").trim();
  const sourceUrl = String(body.sourceUrl || "").trim();

  if (!name || !phone || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, error: "Preencha nome, telefone, e-mail e mensagem com dados válidos." }, 400, origin);
  }
  if (name.length > 160 || phone.length > 50 || email.length > 254 || interest.length > 200 || message.length > 5000 || sourceUrl.length > 2000) {
    return json({ success: false, error: "Um ou mais campos excedem o tamanho permitido." }, 400, origin);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lead, error: insertError } = await supabase
    .from("crm_leads")
    .insert({
      company_id: null,
      contact_name: name,
      email,
      phone,
      interest,
      message,
      status: "new",
      source: "site_institucional",
      source_url: sourceUrl || "https://versuscrm.com.br",
    })
    .select("id")
    .single();

  if (insertError || !lead) {
    console.error("[public-lead] CRM insert failed", insertError?.message);
    return json({ success: false, error: "Não foi possível registrar o contato no CRM." }, 500, origin);
  }

  const { data: admins, error: adminsError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (adminsError) {
    console.error("[public-lead] Could not load platform admins", adminsError.message);
    return json({
      success: false,
      leadSaved: true,
      leadId: lead.id,
      error: "O lead foi salvo no CRM, mas não foi possível gerar a notificação interna.",
    }, 500, origin);
  }

  if (admins?.length) {
    const { error: notificationError } = await supabase
      .from("crm_user_notifications")
      .insert(admins.map((admin: { id: string }) => ({
        user_id: admin.id,
        company_id: null,
        title: "Novo interessado nos planos Versus CRM",
        message: name + " demonstrou interesse em " + interest + ". E-mail: " + email + " · Telefone: " + phone,
        entity_type: "crm_lead",
        action: "view_lead:" + lead.id,
        status: "new",
      })));

    if (notificationError) {
      console.error("[public-lead] Admin notification insert failed", notificationError.message);
      return json({
        success: false,
        leadSaved: true,
        leadId: lead.id,
        error: "O lead foi salvo no CRM, mas não foi possível gerar a notificação interna.",
      }, 500, origin);
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("[public-lead] RESEND_API_KEY is not configured in CRM deployment");
    return json({
      success: false,
      leadSaved: true,
      leadId: lead.id,
      error: "O lead foi salvo no CRM, mas a notificação por e-mail está indisponível no momento.",
    }, 503, origin);
  }

  const emailText = [
    "Novo interessado nos planos do Versus CRM",
    "",
    "Nome: " + name,
    "Telefone: " + phone,
    "E-mail: " + email,
    "Plano/interesse: " + interest,
    "Mensagem: " + message,
    "Origem: " + (sourceUrl || "https://versuscrm.com.br"),
    "Lead ID: " + lead.id,
  ].join("\\n");

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Versus CRM <nao-responda@versuscrm.com.br>",
        to: ["contato@versuscrm.com.br"],
        reply_to: email,
        subject: "Novo interessado — " + interest,
        text: emailText,
      }),
    });

    if (!emailResponse.ok) {
      const detail = await emailResponse.text();
      console.error("[public-lead] Resend failed", { status: emailResponse.status, detail });
      return json({
        success: false,
        leadSaved: true,
        leadId: lead.id,
        error: "O lead foi salvo no CRM, mas o envio do e-mail falhou. Nossa equipe poderá consultar o painel.",
      }, 502, origin);
    }
  } catch (error) {
    console.error("[public-lead] Resend request failed", error);
    return json({
      success: false,
      leadSaved: true,
      leadId: lead.id,
      error: "O lead foi salvo no CRM, mas não foi possível enviar o e-mail.",
    }, 502, origin);
  }

  return json({
    success: true,
    leadId: lead.id,
    message: "Lead registrado no CRM e e-mail enviado.",
  }, 200, origin);
}
