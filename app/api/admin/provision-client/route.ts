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

  let body: { companyId?: string; email?: string; companyName?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }) }
  const companyId = String(body.companyId || '')
  const email = String(body.email || '').trim().toLowerCase()
  const companyName = String(body.companyName || '').trim()
  if (!companyId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !companyName) {
    return NextResponse.json({ error: 'Empresa, nome e e-mail válidos são obrigatórios.' }, { status: 400 })
  }

  const { data: company, error: companyError } = await admin
    .from('crm_companies').select('id,name,contact_name,contact_email').eq('id', companyId).maybeSingle()
  if (companyError || !company || String(company.contact_email || '').trim().toLowerCase() !== email) {
    return NextResponse.json({ error: 'Empresa não encontrada ou e-mail diferente do cadastro.' }, { status: 400 })
  }

  const { data: existingMembership, error: membershipLookupError } = await admin
    .from('crm_memberships').select('user_id').eq('company_id', companyId).maybeSingle()
  if (membershipLookupError) return NextResponse.json({ error: 'Não foi possível verificar os vínculos existentes.' }, { status: 500 })
  if (existingMembership) return NextResponse.json({ error: 'Esta empresa já possui um usuário vinculado. Nenhuma conta foi alterada.' }, { status: 409 })

  // Never derive client credentials from public company names. Generate a
  // high-entropy temporary password and return it only to the authenticated
  // platform administrator who initiated this provisioning request.
  const initialPassword = randomBytes(24).toString('base64url')

  let userId: string | undefined
  let createdUser = false
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return NextResponse.json({ error: 'Não foi possível verificar contas existentes.' }, { status: 500 })
    const found = data.users.find(u => String(u.email || '').trim().toLowerCase() === email)
    if (found) userId = found.id
    if (data.users.length < 1000) break
  }

  if (userId) {
    const { data: memberships, error } = await admin.from('crm_memberships').select('company_id').eq('user_id', userId)
    if (error) return NextResponse.json({ error: 'Não foi possível validar os vínculos da conta existente.' }, { status: 500 })
    if ((memberships || []).some(m => m.company_id !== companyId)) {
      return NextResponse.json({ error: 'Este e-mail já está vinculado a outra empresa. Nenhuma alteração foi feita.' }, { status: 409 })
    }
    // Ensure the client can log in with the credentials delivered at conversion,
    // including Auth users created earlier but never fully provisioned.
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
      password: initialPassword,
      email_confirm: true,
      user_metadata: { company_id: companyId, company_name: company.name },
    })
    if (resetError) return NextResponse.json({ error: 'Não foi possível definir a senha inicial do cliente: ' + resetError.message }, { status: 400 })
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { company_id: companyId, company_name: company.name },
    })
    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message || 'Não foi possível criar a conta de acesso.' }, { status: 400 })
    }
    userId = created.user.id
    createdUser = true
  }

  // Every Auth account used by a client must have its public profile as well.
  // Upsert repairs accounts that were created manually in Auth before provisioning.
  const { error: profileUpsertError } = await admin.from('profiles').upsert({
    id: userId,
    full_name: company.contact_name || company.name,
    role: 'owner',
  }, { onConflict: 'id' })
  if (profileUpsertError) {
    if (createdUser && userId) await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'A conta existe, mas não foi possível criar o perfil do usuário: ' + profileUpsertError.message }, { status: 500 })
  }

  const { error: linkError } = await admin.from('crm_memberships').insert({
    company_id: companyId, user_id: userId, role: 'owner',
  })
  if (linkError) {
    if (createdUser && userId) await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'A conta não foi vinculada à empresa. Detalhe: ' + linkError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email, role: 'owner', profileCreated: true, accessCreated: true, initialPassword })
}
