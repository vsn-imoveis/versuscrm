import type { MetadataRoute } from 'next'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://versuscrm.vercel.app').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/area-cliente/',
          '/admin/',
          '/login',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
