import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuração do servidor incompleta: confira SUPABASE_SERVICE_ROLE_KEY no ambiente de produção.' }, { status: 500 })
  }

  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sessão administrativa ausente.' }, { status: 401 })

  const publicClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await publicClient.auth.getUser(token)
  if (userError || !userData.user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  // Validate the role using the caller's own JWT. The profiles_read_self_or_admin
  // RLS policy explicitly permits a user to read their own profile. This avoids
  // a false "not admin" result if the server-side service-role key is stale or
  // misconfigured, while still requiring the authenticated user's real DB role.
  const sessionClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: profile, error: profileError } = await sessionClient
    .from('profiles').select('role').eq('id', userData.user.id).maybeSingle()
  if (profileError) {
    console.error('[provision-client] could not read admin profile', {
      userId: userData.user.id,
      error: profileError.message,
    })
    return NextResponse.json({ error: 'Não foi possível validar as permissões administrativas. Tente novamente.' }, { status: 500 })
  }
  if (!profile || profile.role !== 'admin') {
    console.warn('[provision-client] provisioning denied: user is not a platform admin', {
      userId: userData.user.id,
      profileFound: Boolean(profile),
      role: profile?.role ?? null,
    })
    return NextResponse.json({ error: 'Somente o administrador do VersusCRM pode provisionar clientes.' }, { status: 403 })
  }

  // Use service role only for privileged Auth and cross-company provisioning actions.
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: {
    name?: string; slug?: string; contactName?: string; email?: string; phone?: string;
    accountStatus?: string; subscriptionStatus?: string;
    monthlyPrice?: number; propertyLimit?: number; photoLimit?: number;
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }) }

  const name = String(body.name || '').trim()
  const slugBase = String(body.slug || '').trim().toLowerCase()
  const contactName = String(body.contactName || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = String(body.phone || '').trim() || null
  const accountStatus = body.accountStatus === 'inactive' ? 'inactive' : 'active'
  const subscriptionStatus = body.subscriptionStatus === 'inactive' ? 'inactive' : 'active'
  const monthlyPrice = Number(body.monthlyPrice)
  const propertyLimit = Number(body.propertyLimit)
  const photoLimit = Number(body.photoLimit)

  if (!name || !slugBase || !contactName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugBase) ||
      !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ||
      ![monthlyPrice, propertyLimit, photoLimit].every(Number.isFinite) ||
      monthlyPrice < 0 || propertyLimit < 1 || photoLimit < 1) {
    return NextResponse.json({ error: 'Confira nome, endereço, contato, e-mail, mensalidade e limites.' }, { status: 400 })
  }

  // The platform administrator creates the company FIRST. Only after the
  // database returns its persisted ID do we create the subscription and login.
  const { data: existingCompany, error: slugLookupError } = await admin
    .from('crm_companies').select('id').eq('slug', slugBase).maybeSingle()
  if (slugLookupError) return NextResponse.json({ error: 'Não foi possível validar o endereço do site: ' + slugLookupError.message }, { status: 500 })
  if (existingCompany) return NextResponse.json({ error: 'Este endereço de site já está em uso. Altere o nome para gerar outro endereço.' }, { status: 409 })

  const { data: company, error: companyError } = await admin
    .from('crm_companies')
    .insert({
      name, slug: slugBase, contact_name: contactName, contact_email: email,
      contact_phone: phone, status: accountStatus,
      max_properties: propertyLimit, max_photos_per_property: photoLimit,
    })
    .select('id,name,slug,contact_name,contact_email')
    .single()

  if (companyError || !company) {
    console.error('[provision-client] company creation failed', { error: companyError?.message, code: companyError?.code })
    return NextResponse.json({ error: 'Não foi possível criar a empresa: ' + (companyError?.message || 'registro não retornado') }, { status: 400 })
  }

  const companyId = company.id
  const rollbackCompany = async () => {
    await admin.from('crm_subscriptions').delete().eq('company_id', companyId)
    await admin.from('crm_companies').delete().eq('id', companyId)
  }

  const { error: subscriptionError } = await admin.from('crm_subscriptions').insert({
    company_id: companyId, plan_code: 'essencial', plan_name: 'Essencial',
    monthly_price: monthlyPrice, property_limit: propertyLimit,
    photo_limit: photoLimit, status: subscriptionStatus,
  })
  if (subscriptionError) {
    await rollbackCompany()
    return NextResponse.json({ error: 'A empresa foi criada, mas não foi possível criar a assinatura. O cadastro foi revertido: ' + subscriptionError.message }, { status: 400 })
  }

  const { data: existingAuthUsers, error: authLookupError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authLookupError) {
    await rollbackCompany()
    return NextResponse.json({ error: 'Empresa e assinatura criadas, mas não foi possível verificar o e-mail de acesso: ' + authLookupError.message }, { status: 500 })
  }
  const existingUser = existingAuthUsers.users.find(u => String(u.email || '').trim().toLowerCase() === email)
  let userId = existingUser?.id
  let createdUser = false
  const initialPassword = randomBytes(24).toString('base64url')

  if (existingUser) {
    const { data: memberships, error: membershipError } = await admin.from('crm_memberships').select('company_id').eq('user_id', existingUser.id)
    if (membershipError || (memberships || []).length > 0) {
      await rollbackCompany()
      return NextResponse.json({ error: membershipError?.message || 'Este e-mail já está vinculado a outra empresa. O novo cadastro foi revertido.' }, { status: 409 })
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
      password: initialPassword, email_confirm: true,
      user_metadata: { company_id: companyId, company_name: company.name },
    })
    if (updateError) {
      await rollbackCompany()
      return NextResponse.json({ error: 'Não foi possível preparar o acesso do cliente: ' + updateError.message }, { status: 400 })
    }
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password: initialPassword, email_confirm: true,
      user_metadata: { company_id: companyId, company_name: company.name },
    })
    if (createError || !created.user) {
      await rollbackCompany()
      return NextResponse.json({ error: 'Empresa e assinatura criadas, mas não foi possível criar o acesso. Cadastro revertido: ' + (createError?.message || 'erro inesperado') }, { status: 400 })
    }
    userId = created.user.id
    createdUser = true
  }

  const { error: profileUpsertError } = await admin.from('profiles').upsert({
    id: userId, full_name: company.contact_name || company.name, role: 'owner',
  }, { onConflict: 'id' })
  if (profileUpsertError) {
    if (createdUser && userId) await admin.auth.admin.deleteUser(userId)
    await rollbackCompany()
    return NextResponse.json({ error: 'Não foi possível criar o perfil do cliente. Cadastro revertido: ' + profileUpsertError.message }, { status: 500 })
  }

  const { error: membershipError } = await admin.from('crm_memberships').insert({
    company_id: companyId, user_id: userId, role: 'owner',
  })
  if (membershipError) {
    if (createdUser && userId) await admin.auth.admin.deleteUser(userId)
    await rollbackCompany()
    return NextResponse.json({ error: 'Não foi possível vincular o acesso à empresa. Cadastro revertido: ' + membershipError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, companyId, slug: company.slug, companyName: company.name, email, role: 'owner', profileCreated: true, accessCreated: true, initialPassword })
}
