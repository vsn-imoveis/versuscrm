"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function TenantLoginPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erro") === "acesso") {
      setError("Este usuário não possui vínculo com esta imobiliária.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !auth.user) throw authError ?? new Error("Não foi possível validar o usuário.");

      const { data: tenantData, error: tenantError } = await supabase
        .rpc("get_public_tenant_by_slug", { p_slug: slug });
      const tenant = Array.isArray(tenantData) ? tenantData[0] : tenantData;
      if (tenantError || !tenant || tenant.status !== "active") throw new Error("Imobiliária não encontrada ou inativa.");

      const [{ data: membership, error: memberError }, { data: ownerAccount, error: ownerError }] = await Promise.all([
        supabase.from("crm_memberships").select("company_id")
          .eq("company_id", tenant.id).eq("user_id", auth.user.id).maybeSingle(),
        supabase.from("crm_owner_accounts").select("company_id,contact_id,status")
          .eq("company_id", tenant.id).eq("user_id", auth.user.id).eq("status", "active").maybeSingle()
      ]);
      if ((memberError || !membership) && (ownerError || !ownerAccount)) {
        await supabase.auth.signOut();
        throw new Error("Este usuário não possui acesso a esta imobiliária.");
      }

      const destination = ownerAccount && !membership
        ? `/${encodeURIComponent(slug)}/admin/proprietario.html`
        : `/${encodeURIComponent(slug)}/admin`;
      window.location.assign(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f5f7" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, background: "#fff", padding: 36, borderRadius: 14, boxShadow: "0 16px 50px #17203312" }}>
        <div style={{ width: 42, height: 4, background: "#b89a62", borderRadius: 9, marginBottom: 24 }} />
        <div style={{ color: "#777", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Versus CRM</div>
        <h1 style={{ fontSize: 26, margin: "10px 0 6px" }}>Acesso administrativo</h1>
        <p style={{ color: "#6b7280", marginBottom: 26 }}>Entre com seu usuário da imobiliária.</p>
        <label style={{ display: "block", fontSize: 13, marginBottom: 7 }}>E-mail</label>
        <input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} style={fieldStyle} />
        <label style={{ display: "block", fontSize: 13, margin: "16px 0 7px" }}>Senha</label>
        <input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={fieldStyle} />
        {error && <p role="alert" style={{ color: "#b42318", fontSize: 13, marginTop: 14 }}>{error}</p>}
        <button disabled={busy} style={{ width: "100%", border: 0, borderRadius: 8, padding: 14, marginTop: 22, color: "#fff", background: "#202a38", cursor: busy ? "wait" : "pointer" }}>{busy ? "Acessando..." : "Entrar"}</button>
      </form>
    </main>
  );
}

const fieldStyle: React.CSSProperties = { width: "100%", padding: 13, border: "1px solid #d7dbe0", borderRadius: 8, outlineColor: "#b89a62" };
