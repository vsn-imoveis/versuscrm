import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string; legacy: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { slug, legacy } = await context.params;
  const requestedFile = legacy.join("/");
  if (requestedFile !== "painel-cadastro.html") {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin`, request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Supabase do Versus não configurado.", { status: 503 });
  }

  const filePath = path.join(process.cwd(), "public", "legacy-admin", "painel-cadastro.html");
  let html = await readFile(filePath, "utf8");
  const config = JSON.stringify({ slug, supabaseUrl, supabaseAnonKey }).replace(/</g, "\\u003c");
  html = html.replace("<head>", `<head><script>window.__VERSUS_CONFIG=${config};</script>`);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
