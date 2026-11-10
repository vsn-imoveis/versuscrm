import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Configuração do servidor incompleta.' }, { status: 500 })
  }

  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sessão administrativa ausente.' }, { status: 401 })

  const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await publicClient.auth.getUser(token)
  if (authError || !authData.user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
  if (profileError || profile?.role !== 'admin') return NextResponse.json({ error: 'Somente o administrador pode gerenciar acessos.' }, { status: 403 })

  let body: { companyId?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  const companyId = String(body.companyId || '').trim()
  const password = String(body.password || '')
  if (!companyId || password.length < 12) return NextResponse.json({ error: 'Informe a empresa e uma senha com pelo menos 12 caracteres.' }, { status: 400 })

  const { data: company, error: companyError } = await admin.from('crm_companies')
    .select('id,name,contact_name,contact_email').eq('id', companyId).maybeSingle()
  if (companyError || !company || !company.contact_email) return NextResponse.json({ error: 'Empresa não encontrada ou sem e-mail de contato.' }, { status: 404 })
  const email = String(company.contact_email).trim().toLowerCase()

  const { data: memberships, error: membershipError } = await admin.from('crm_memberships')
    .select('user_id,company_id').eq('company_id', companyId).limit(2)
  if (membershipError) return NextResponse.json({ error: 'Não foi possível consultar o vínculo da empresa.' }, { status: 500 })
  if ((memberships || []).length > 1) return NextResponse.json({ error: 'A empresa possui múltiplos usuários vinculados. Corrija os vínculos antes de redefinir o acesso.' }, { status: 409 })

  let userId = memberships?.[0]?.user_id as string | undefined
  let createdUserId: string | undefined
  let loginEmail = email

  if (userId) {
    // A company's contact email is not necessarily the Auth login email.
    // Preserve the actual email attached to the existing Auth identity.
    const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(userId)
    if (existingAuthError || !existingAuth.user?.email) {
      return NextResponse.json({ error: 'O vínculo existe, mas não foi possível localizar o e-mail da conta no Supabase Auth.' }, { status: 404 })
    }
    loginEmail = String(existingAuth.user.email).trim().toLowerCase()
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password, email_confirm: true,
      user_metadata: { ...(existingAuth.user.user_metadata || {}), company_id: companyId, company_name: company.name },
    })
    if (error) return NextResponse.json({ error: 'Não foi possível atualizar a senha: ' + error.message }, { status: 400 })
  } else {
    let existingUser: { id: string; email?: string } | undefined
    for (let page = 1; page <= 10 && !existingUser; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) return NextResponse.json({ error: 'Não foi possível verificar contas existentes.' }, { status: 500 })
      existingUser = data.users.find(u => String(u.email || '').trim().toLowerCase() === email)
      if (data.users.length < 1000) break
    }
    if (existingUser) {
      const { data: otherMemberships, error } = await admin.from('crm_memberships').select('company_id').eq('user_id', existingUser.id)
      if (error) return NextResponse.json({ error: 'Não foi possível validar os vínculos da conta existente.' }, { status: 500 })
      if ((otherMemberships || []).some(m => m.company_id !== companyId)) {
        return NextResponse.json({ error: 'Este e-mail já está vinculado a outra empresa. Nenhuma alteração foi feita.' }, { status: 409 })
      }
      userId = existingUser.id
      loginEmail = String(existingUser.email || email).trim().toLowerCase()
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password, email_confirm: true,
        user_metadata: { company_id: companyId, company_name: company.name },
      })
      if (updateError) return NextResponse.json({ error: 'Não foi possível atualizar a conta existente: ' + updateError.message }, { status: 400 })
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { company_id: companyId, company_name: company.name },
      })
      if (error || !data.user) return NextResponse.json({ error: 'Não foi possível criar o acesso: ' + (error?.message || 'usuário não retornado') }, { status: 400 })
      userId = data.user.id
      loginEmail = email
      createdUserId = userId
    }

    const { error: linkError } = await admin.from('crm_memberships').insert({ company_id: companyId, user_id: userId, role: 'owner' })
    if (linkError) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId)
      return NextResponse.json({ error: 'A conta foi localizada, mas não foi possível vinculá-la à empresa: ' + linkError.message }, { status: 500 })
    }
  }

  // Verify the credentials against Supabase Auth before reporting success.
  const verificationClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: verifiedAuth, error: verificationError } = await verificationClient.auth.signInWithPassword({
    email,
    password,
  })
  if (verificationError || !verifiedAuth.user || verifiedAuth.user.id !== userId) {
    return NextResponse.json({
      error: 'A senha foi gravada, mas a validação do login falhou. Confira o e-mail de acesso e tente novamente.',
    }, { status: 502 })
  }
  await verificationClient.auth.signOut()

  // Keep the public profile synchronized with the Auth identity and client company.
  const { error: profileSyncError } = await admin.from('profiles').upsert({
    id: userId,
    full_name: company.contact_name || company.name,
    role: 'owner',
  }, { onConflict: 'id' })
  if (profileSyncError) {
    return NextResponse.json({ error: 'A senha foi validada, mas não foi possível sincronizar o perfil: ' + profileSyncError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: loginEmail, contactEmail: email, companyName: company.name, credentialsVerified: true, profileSynchronized: true, membershipSynchronized: true, action: memberships?.length ? 'password_reset' : 'access_created' })
}
