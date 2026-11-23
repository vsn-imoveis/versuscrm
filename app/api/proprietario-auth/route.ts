import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  let body: { action?: string; slug?: string; nome?: string; email?: string; celular?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400 }); }
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const action = String(body.action ?? "");
  if (!slug || !/^[a-z0-9-]{2,80}$/.test(slug)) return NextResponse.json({ error: "Imobiliária inválida." }, { status: 400 });

  const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tenantData, error: tenantError } = await publicClient.rpc("get_public_tenant_by_slug", { p_slug: slug });
  const tenant = Array.isArray(tenantData) ? tenantData[0] : tenantData;
  if (tenantError || !tenant || tenant.status !== "active") return NextResponse.json({ error: "Imobiliária não encontrada ou inativa." }, { status: 404 });

  const authorization = request.headers.get("authorization");
  if (action === "verify") {
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Entre com seu e-mail e senha." }, { status: 401 });
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
    if (!secretKey) return NextResponse.json({ error: "Configuração segura do servidor incompleta." }, { status: 503 });
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: account, error } = await admin.from("crm_owner_accounts").select("id").eq("company_id", tenant.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (error || !account) return NextResponse.json({ error: "Esta conta não está vinculada como proprietária a esta imobiliária." }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (action !== "signup") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  if (!secretKey) return NextResponse.json({ error: "Configuração segura do servidor incompleta." }, { status: 503 });
  const nome = String(body.nome ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const celular = String(body.celular ?? "").trim();
  const digits = celular.replace(/\D/g, "");
  if (nome.length < 3 || nome.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || digits.length < 10 || digits.length > 15) {
    return NextResponse.json({ error: "Informe nome, e-mail e celular válidos." }, { status: 400 });
  }

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: contacts, error: contactError } = await admin.from("crm_contacts").select("id,name,email,phone").eq("company_id", tenant.id).eq("contact_type", "owner").ilike("email", email).limit(2);
  if (contactError) return NextResponse.json({ error: "Não foi possível validar o cadastro. Tente novamente." }, { status: 500 });
  if (!contacts || contacts.length !== 1) return NextResponse.json({ message: "Solicitação recebida." });
  const contact = contacts[0];
  if (contact.phone && contact.phone.replace(/\D/g, "") !== digits) return NextResponse.json({ message: "Solicitação recebida." });

  const { data: existingAccount } = await admin.from("crm_owner_accounts").select("id").eq("company_id", tenant.id).eq("contact_id", contact.id).maybeSingle();
  if (existingAccount) return NextResponse.json({ error: "Este contato já possui uma conta vinculada. Use Entrar ou Esqueci minha senha." }, { status: 409 });

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: new URL("/" + encodeURIComponent(slug) + "/proprietario/", request.url).toString(), data: { full_name: nome, phone: celular, account_type: "property_owner" } });
  if (inviteError || !invited.user) {
    return NextResponse.json({ error: "Não foi possível enviar o convite. Se você já possui uma conta, entre ou recupere sua senha." }, { status: 409 });
  }
  const { error: linkError } = await admin.from("crm_owner_accounts").insert({ company_id: tenant.id, contact_id: contact.id, user_id: invited.user.id, status: "active" });
  if (linkError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return NextResponse.json({ error: "Não foi possível concluir o vínculo do proprietário." }, { status: 500 });
  }
  return NextResponse.json({ message: "Convite enviado." });
}
