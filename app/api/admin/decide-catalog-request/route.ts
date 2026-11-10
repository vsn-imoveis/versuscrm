import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const fields: Record<string, string[]> = {
  developer: ['name','legal_name','document','phone','website','partnership_manager_name','partnership_manager_phone','description','logo_url','active'],
  condominium: ['name','address','neighborhood','city','state','construction_year','builder','details'],
}

export async function POST(request: NextRequest) {
  if (!serviceKey) return NextResponse.json({ error: 'Configuração do servidor incompleta.' }, { status: 500 })
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Sessão administrativa ausente.' }, { status: 401 })
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await auth.auth.getUser(token)
  if (authError || !authData.user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile } = await db.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem decidir solicitações.' }, { status: 403 })

  let body: { requestId?: string; decision?: string; note?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  const id = String(body.requestId || '')
  const decision = String(body.decision || '')
  if (!id || !['approved','rejected'].includes(decision)) return NextResponse.json({ error: 'Solicitação e decisão válidas são obrigatórias.' }, { status: 400 })

  const { data: item, error: readError } = await db.from('crm_catalog_change_requests').select('*').eq('id', id).eq('status','pending').maybeSingle()
  if (readError || !item) return NextResponse.json({ error: 'Solicitação não encontrada ou já analisada.' }, { status: 409 })

  if (decision === 'approved') {
    const table = item.entity_type === 'developer' ? 'crm_developers' : item.entity_type === 'condominium' ? 'crm_condominiums' : null
    const allowed = fields[item.entity_type]
    if (!table || !allowed) return NextResponse.json({ error: 'Tipo de cadastro não reconhecido.' }, { status: 400 })
    const values = Object.fromEntries(Object.entries(item.proposed_data || {}).filter(([key]) => allowed.includes(key)))
    if (item.action === 'create') {
      if (!values.name) return NextResponse.json({ error: 'O cadastro não possui nome.' }, { status: 400 })
      const { error } = await db.from(table).insert({ ...values, company_id: item.company_id, ...(item.entity_type === 'developer' ? { created_by: item.requested_by } : {}) })
      if (error) return NextResponse.json({ error: 'Não foi possível criar o cadastro: ' + error.message }, { status: 400 })
    } else {
      if (!item.record_id) return NextResponse.json({ error: 'Registro de destino não informado.' }, { status: 400 })
      const { data: existing, error: lookupError } = await db.from(table).select('id,company_id').eq('id',item.record_id).maybeSingle()
      if (lookupError || !existing || existing.company_id !== item.company_id) return NextResponse.json({ error: 'Registro não encontrado para esta imobiliária.' }, { status: 404 })
      if (item.action === 'update') {
        const { error } = await db.from(table).update(values).eq('id',item.record_id).eq('company_id',item.company_id)
        if (error) return NextResponse.json({ error: 'Não foi possível aplicar as alterações: ' + error.message }, { status: 400 })
      } else if (item.action === 'delete') {
        const { error } = await db.from(table).delete().eq('id',item.record_id).eq('company_id',item.company_id)
        if (error) return NextResponse.json({ error: 'Não foi possível excluir o cadastro: ' + error.message }, { status: 400 })
      } else return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 })
    }
  }

  const { error: decisionError } = await db.from('crm_catalog_change_requests').update({
    status: decision, decision_by: authData.user.id, decision_at: new Date().toISOString(),
    decision_note: String(body.note || '').trim() || null, updated_at: new Date().toISOString(),
  }).eq('id',id).eq('status','pending')
  if (decisionError) return NextResponse.json({ error: 'A decisão foi executada, mas não foi possível registrar o resultado: ' + decisionError.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: decision })
}
