import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string; legacy: string[] }> };

const allowedScreens = new Set([
  "index.html",
  "painel-login.html",
  "painel-cadastro.html",
  "painel-v2.html",
  "painel-v4.html",
  "painel-v5.html",
  "painel-v6.html",
  "painel-v7.html",
  "painel-v8.html",
  "painel-v11.html",
  "painel-2colunas.html",
  "painel-2colunas-v3.html",
  "cadastrar-condominio.html",
  "editar-condominio.html",
  "condominios.html",
  "construtoras.html",
  "lancamentos.html",
  "listar-lancamentos.html",
  "perfil-site.html",
  "proprietario.html",
  "solicitacoes-proprietario.html",
  "vendedor.html",
]);

export async function GET(request: NextRequest, context: Context) {
  const { slug, legacy } = await context.params;
  const requestedFile = legacy.join("/");

  if (requestedFile === "index.html") {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin/painel-login.html`, request.url));
  }

  if (!allowedScreens.has(requestedFile)) {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin`, request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Supabase do Versus não configurado.", { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const isLoginScreen = requestedFile === "painel-login.html";
  if ((!user || !session) && !isLoginScreen) {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin/painel-login.html`, request.url));
  }

  const { data: tenantData, error: tenantError } = await supabase
    .rpc("get_public_tenant_by_slug", { p_slug: slug });
  const tenant = Array.isArray(tenantData) ? tenantData[0] : tenantData;
  if (tenantError || !tenant || tenant.status !== "active") {
    return new NextResponse("Imobiliária não encontrada ou inativa.", { status: 404 });
  }

  const { data: membership, error: membershipError } = user
    ? await supabase
        .from("crm_memberships")
        .select("company_id, user_id, role")
        .eq("company_id", tenant.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  const { data: ownerAccount } = user
    ? await supabase
        .from("crm_owner_accounts")
        .select("company_id, user_id, contact_id, status")
        .eq("company_id", tenant.id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  const isOwnerPortal = ["proprietario.html", "painel-cadastro.html"].includes(requestedFile) && !!ownerAccount;
  if (requestedFile === "proprietario.html" && !ownerAccount) {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin/painel-login.html?erro=proprietario`, request.url));
  }
  // A login/dashboard HTML is still tenant-protected when a session exists.
  // Never let an authenticated user from another company reach it.
  if (user && (membershipError || !membership) && !isOwnerPortal) {
    return new NextResponse("Acesso negado: esta conta não pertence a esta imobiliária.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
  const effectiveRole = membership?.role ?? (isOwnerPortal ? "owner" : user && isLoginScreen ? "unauthorized" : "member");

  const filePath = path.join(process.cwd(), "public", "legacy-admin", requestedFile);
  let html: string;
  try {
    html = await readFile(filePath, "utf8");
  } catch {
    return NextResponse.redirect(new URL(`/${encodeURIComponent(slug)}/admin`, request.url));
  }

  const config = JSON.stringify({
    slug,
    companyId: tenant.id,
    membershipRole: effectiveRole,
    ownerContactId: ownerAccount?.contact_id ?? null,
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
    supabaseUrl,
    supabaseAnonKey
  }).replace(/</g, "\\u003c");

  html = html.replace("<head>", `<head><script>window.__VERSUS_CONFIG=${config};window.__vsnCompanyId=window.__VERSUS_CONFIG.companyId;window.__vsnMembershipRole=window.__VERSUS_CONFIG.membershipRole;window.__vsnOwnerContactId=window.__VERSUS_CONFIG.ownerContactId;</script><script>(function(){var c=window.__VERSUS_CONFIG;if(!c)return;var replaceText=function(root,n){var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(function(node){var parent=node.parentElement;if(!parent||/^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent.tagName))return;var previous=node.nodeValue;var next=previous.replace(/VSN\\s+Imóveis/gi,n);if(next!==previous)node.nodeValue=next})};var apply=function(t){var n=String(t||"Imobiliária").trim();if(!n)return;var p=n.split(/\\s+/),a=p.shift()||n,b=p.join(" ")||"IMÓVEIS";document.title=document.title.replace(/VSN Imóveis/gi,n);document.querySelectorAll(".admin-brand,.sidebar-brand,.brand,.lbrand").forEach(function(el){var primary=el.querySelector("span,strong");var secondary=el.querySelector("small");if(primary)primary.textContent=a;if(secondary)secondary.textContent=b;el.setAttribute("aria-label",n)});var main=document.getElementById("adminBrandText"),sub=document.getElementById("adminBrandSub");if(main)main.textContent=a;if(sub)sub.textContent=b;replaceText(document.body,n);if(!window.__versusBrandObserver&&window.MutationObserver){window.__versusBrandObserver=new MutationObserver(function(){replaceText(document.body,n)});window.__versusBrandObserver.observe(document.body,{childList:true,subtree:true,characterData:true})}};var load=function(){fetch(c.supabaseUrl+"/rest/v1/rpc/get_public_tenant_by_slug",{method:"POST",headers:{apikey:c.supabaseAnonKey,"Content-Type":"application/json"},body:JSON.stringify({p_slug:c.slug})}).then(function(r){return r.ok?r.json():null}).then(function(d){var t=Array.isArray(d)?d[0]:d;if(t&&t.status==="active")apply(t.name)}).catch(function(e){console.warn("Não foi possível carregar a marca da imobiliária.",e)})};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load,{once:true});else load()})();</script>`);
  const tenantAdminBase = `/${encodeURIComponent(slug)}/admin/`;
  html = html.replace(/href=(["'])\/\1/g, `href="/${encodeURIComponent(slug)}"`);
  // Legacy VSN pages use relative HTML links. Make every internal admin link
  // explicitly tenant-scoped so it never resolves outside the current slug.
  html = html.replace(/\bhref=(["'])((?:\.\/)?[A-Za-z0-9_-]+\.html(?:[?#][^"']*)?)\1/gi,
    (_match, quote, target) => 'href="' + tenantAdminBase + target.replace(/^\.\//, '') + '"');
  // The legacy dashboard also navigates through inline JavaScript. Scope
  // those destinations to the current tenant just like ordinary anchor links.
  html = html.replace(/((?:window\.)?location\.href\s*=\s*["'])\/admin\/([A-Za-z0-9_-]+\.html(?:[?#][^"']*)?)(["'])/gi,
    (_match, prefix, target, suffix) => prefix + tenantAdminBase + target + suffix);
  html = html.replace(/((?:window\.)?location\.href\s*=\s*["'])([A-Za-z0-9_-]+\.html(?:[?#][^"']*)?)(["'])/gi,
    (_match, prefix, target, suffix) => prefix + tenantAdminBase + target + suffix);
  html = html.replace(/(window\.open\(\s*["'])\/admin\/([A-Za-z0-9_-]+\.html(?:[?#][^"']*)?)(["'])/gi,
    (_match, prefix, target, suffix) => prefix + tenantAdminBase + target + suffix);




  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
