import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://versuscrm.vercel.app').replace(/\/$/, '')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export async function GET() {
  try {
    const { data, error } = await supabase.rpc('get_public_crm_company_slugs')
    if (error) throw error

    const slugs = [...new Set((data || []).map((row: { slug?: string }) => row.slug).filter((slug: unknown): slug is string => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))]
    const today = new Date().toISOString().slice(0, 10)
    const entries = slugs.map((slug) => `  <sitemap><loc>${xmlEscape(`${SITE_URL}/${slug}/sitemap.xml`)}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    console.error('[tenant-sitemap-index]', error)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
}
