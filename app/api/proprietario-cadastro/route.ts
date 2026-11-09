import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Sessão não autenticada." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Configuração administrativa do Supabase incompleta." }, { status: 503 });
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user: requester }, error: authError } = await authClient.auth.getUser();
  if (authError || !requester) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  let body: { nome?: string; email?: string; celular?: string; companyId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = String(body.nome ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const celular = String(body.celular ?? "").trim();
  const companyId = String(body.companyId ?? "").trim();
  if (!nome || !email || !celular || !companyId) {
    return NextResponse.json({ error: "Nome, e-mail, celular e imobiliária são obrigatórios." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: membership, error: membershipError } = await admin
    .from("crm_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", requester.id)
    .maybeSingle();

  if (membershipError || !membership || !["owner", "admin", "manager"].includes(membership.role)) {
    return NextResponse.json({ error: "Você não tem permissão para cadastrar proprietários nesta imobiliária." }, { status: 403 });
  }

  let ownerUserId: string | null = null;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: nome, phone: celular },
  });
  if (inviteError) {
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = !usersError ? users.users.find((u) => u.email?.toLowerCase() === email) : null;
    if (!existing) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }
    ownerUserId = existing.id;
  } else {
    ownerUserId = invited.user?.id ?? null;
  }
  if (!ownerUserId) {
    return NextResponse.json({ error: "Não foi possível identificar a conta do proprietário." }, { status: 500 });
  }

  const { data: existingAccount, error: existingAccountError } = await admin
    .from("crm_owner_accounts")
    .select("contact_id")
    .eq("company_id", companyId)
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (existingAccountError) {
    return NextResponse.json({ error: existingAccountError.message }, { status: 400 });
  }
  if (existingAccount?.contact_id) {
    const { error: reactivateError } = await admin.from("crm_owner_accounts").update({ status: "active" }).eq("company_id", companyId).eq("user_id", ownerUserId);
    if (reactivateError) return NextResponse.json({ error: reactivateError.message }, { status: 400 });
    const { error: updateContactError } = await admin
      .from("crm_contacts")
      .update({ name: nome, email, phone: celular, status: "active", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", existingAccount.contact_id);
    if (updateContactError) return NextResponse.json({ error: updateContactError.message }, { status: 400 });
    return NextResponse.json({ userId: ownerUserId, contactId: existingAccount.contact_id, sent: false });
  }

  const { data: contact, error: contactError } = await admin
    .from("crm_contacts")
    .insert({
      company_id: companyId,
      name: nome,
      email,
      phone: celular,
      contact_type: "owner",
      source: "admin",
      status: "active",
      created_by: requester.id,
    })
    .select("id")
    .single();
  if (contactError) {
    return NextResponse.json({ error: "Conta de acesso criada, mas não foi possível criar o contato: " + contactError.message, userId: ownerUserId }, { status: 400 });
  }

  const { error: accountError } = await admin
    .from("crm_owner_accounts")
    .insert({ company_id: companyId, contact_id: contact.id, user_id: ownerUserId, status: "active" });
  if (accountError) {
    await admin.from("crm_contacts").delete().eq("id", contact.id).eq("company_id", companyId);
    return NextResponse.json({ error: "Não foi possível vincular a conta do proprietário: " + accountError.message, userId: ownerUserId }, { status: 400 });
  }

  return NextResponse.json({ userId: ownerUserId, contactId: contact.id, sent: !inviteError });
}
