import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03'
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  if (!serviceKey) return NextResponse.json({ error: 'Configuração administrativa do servidor incompleta.' }, { status: 500 })
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sessão administrativa ausente.' }, { status: 401 })

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  if (authError || !authData.user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
  if (profileError || profile?.role !== 'admin') return NextResponse.json({ error: 'Somente o administrador do VersusCRM pode editar clientes.' }, { status: 403 })

  let body: { companyId?: string; name?: string; slug?: string; contactName?: string; email?: string; phone?: string | null; accountStatus?: string; subscriptionStatus?: string; monthlyPrice?: number; propertyLimit?: number; photoLimit?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }

  const companyId = String(body.companyId || '').trim()
  const name = String(body.name || '').trim()
  const slug = String(body.slug || '').trim().toLowerCase()
  const contactName = String(body.contactName || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = String(body.phone || '').trim() || null
  const monthlyPrice = Number(body.monthlyPrice)
  const propertyLimit = Number(body.propertyLimit)
  const photoLimit = Number(body.photoLimit)
  const accountStatus = body.accountStatus === 'inactive' ? 'inactive' : 'active'
  const subscriptionStatus = body.subscriptionStatus === 'inactive' ? 'inactive' : 'active'
  if (!companyId || !name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || ![monthlyPrice, propertyLimit, photoLimit].every(Number.isFinite) || monthlyPrice < 0 || propertyLimit < 1 || photoLimit < 1) {
    return NextResponse.json({ error: 'Confira os dados, e-mail, mensalidade e limites informados.' }, { status: 400 })
  }

  const { data: company, error: lookupError } = await admin.from('crm_companies').select('id,slug').eq('id', companyId).maybeSingle()
  if (lookupError || !company) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  const { data: duplicateSlug, error: duplicateSlugError } = await admin.from('crm_companies').select('id').eq('slug', slug).neq('id', companyId).maybeSingle()
  if (duplicateSlugError) return NextResponse.json({ error: 'Não foi possível validar o endereço do site: ' + duplicateSlugError.message }, { status: 500 })
  if (duplicateSlug) return NextResponse.json({ error: 'Este endereço de site já está em uso. Escolha outro.' }, { status: 409 })
  const { data: aliasConflict, error: aliasLookupError } = await admin.from('crm_company_slug_aliases').select('alias_slug').eq('alias_slug', slug).maybeSingle()
  if (aliasLookupError) return NextResponse.json({ error: 'Não foi possível validar o endereço antigo: ' + aliasLookupError.message }, { status: 500 })
  if (aliasConflict) return NextResponse.json({ error: 'Este endereço já foi utilizado por outro site. Escolha outro.' }, { status: 409 })
  const { data: duplicate, error: duplicateError } = await admin.from('crm_companies').select('id').ilike('name', name).neq('id', companyId).maybeSingle()
  if (duplicateError) return NextResponse.json({ error: 'Não foi possível validar o nome: ' + duplicateError.message }, { status: 500 })
  if (duplicate) return NextResponse.json({ error: 'Já existe outro cliente com esse nome.' }, { status: 409 })

  if (slug !== company.slug) {
    const { error: aliasInsertError } = await admin.from('crm_company_slug_aliases').insert({ alias_slug: company.slug, company_id: companyId })
    if (aliasInsertError) return NextResponse.json({ error: 'Não foi possível preservar o endereço antigo: ' + aliasInsertError.message }, { status: 400 })
  }

  const { error: companyError } = await admin.from('crm_companies').update({
    name, slug, contact_name: contactName, contact_email: email, contact_phone: phone,
    status: accountStatus, max_properties: propertyLimit, max_photos_per_property: photoLimit,
  }).eq('id', companyId)
  if (companyError) {
    if (slug !== company.slug) await admin.from('crm_company_slug_aliases').delete().eq('alias_slug', company.slug)
    return NextResponse.json({ error: 'Não foi possível atualizar os dados do cliente: ' + companyError.message }, { status: 400 })
  }

  const { data: subscription, error: subscriptionLookupError } = await admin.from('crm_subscriptions').select('id').eq('company_id', companyId).maybeSingle()
  if (subscriptionLookupError) return NextResponse.json({ error: 'Dados do cliente atualizados, mas não foi possível consultar a assinatura: ' + subscriptionLookupError.message }, { status: 500 })
  const subscriptionValues = { monthly_price: monthlyPrice, property_limit: propertyLimit, photo_limit: photoLimit, status: subscriptionStatus }
  const subscriptionResult = subscription
    ? await admin.from('crm_subscriptions').update(subscriptionValues).eq('company_id', companyId)
    : await admin.from('crm_subscriptions').insert({ company_id: companyId, plan_code: 'essencial', plan_name: 'Essencial', ...subscriptionValues })
  if (subscriptionResult.error) return NextResponse.json({ error: 'Dados do cliente atualizados, mas houve erro na assinatura: ' + subscriptionResult.error.message }, { status: 400 })

  return NextResponse.json({ ok: true, companyId, slug, previousSlug: company.slug, redirected: slug !== company.slug })
}
