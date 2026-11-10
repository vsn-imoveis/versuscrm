import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://versuscrm.vercel.app').replace(/\/$/, '')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function seoSlugPart(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').replace(/-+/g, '-').slice(0, 70).replace(/-+$/g, '')
}
function propertySeoSlug(p: any) {
  const condo = seoSlugPart(p.condominium_name)
  const street = seoSlugPart(p.address)
  const bedrooms = Number(p.bedrooms || 0)
  const area = Number(p.area || 0)
  const type = (p.for_rent && !p.for_sale) ? 'locacao'
    : (p.for_sale && !p.for_rent) ? 'venda'
    : (p.transaction_type === 'rent' ? 'locacao' : p.transaction_type === 'sale' ? 'venda' : 'imovel')
  return [condo, street, bedrooms ? bedrooms + '-dorm' : null, area ? Math.round(area) + 'm2' : null, type].filter(Boolean).join('-')
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const { data: company, error: companyError } = await supabase.rpc('get_public_crm_company', { p_slug: slug }).maybeSingle()
  if (companyError || !company) return new NextResponse('Not found', { status: 404 })

  const { data: properties, error } = await supabase.rpc('get_public_crm_properties', { p_slug: slug })
  if (error) {
    console.error('[tenant-property-sitemap]', error)
    return new NextResponse('Could not generate sitemap', { status: 500 })
  }

  const companySlug = encodeURIComponent((company as { slug?: string | null }).slug || slug)
  const urls = [
    `<url><loc>${xmlEscape(`${SITE_URL}/${companySlug}`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...(properties || []).map((p: { id: string; updated_at?: string | null; condominium_name?: string | null; address?: string | null; bedrooms?: number | null; area?: number | null; for_sale?: boolean | null; for_rent?: boolean | null; transaction_type?: string | null }) => {
      const loc = `${SITE_URL}/${companySlug}/imovel/${encodeURIComponent(propertySeoSlug(p))}`
      const lastmod = p.updated_at ? `<lastmod>${xmlEscape(new Date(p.updated_at).toISOString())}</lastmod>` : ''
      return `<url><loc>${xmlEscape(loc)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`
    }),
  ].join('')

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  return new NextResponse(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })
}
