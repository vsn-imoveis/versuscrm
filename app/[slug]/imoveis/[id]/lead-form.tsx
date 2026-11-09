"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

type Props = { slug: string; propertyTitle: string; companyName: string; propertyCode?: string | null };

export default function PropertyLeadForm({ slug, propertyTitle, companyName, propertyCode }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setMessage("");
    setSuccess(false);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Configuração de contato indisponível.");
      const response = await fetch(`${url}/rest/v1/rpc/register_public_crm_lead`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_slug: slug,
          p_name: String(data.get("name") ?? ""),
          p_email: String(data.get("email") ?? ""),
          p_phone: String(data.get("phone") ?? ""),
          p_interest: "Interesse pelo imóvel",
          p_property: [propertyCode, propertyTitle].filter(Boolean).join(" · "),
          p_message: String(data.get("message") ?? ""),
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Não foi possível enviar sua mensagem.");
      }
      form.reset();
      setSuccess(true);
      setMessage("Recebemos seu contato. A imobiliária retornará em breve.");
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar sua mensagem.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>Nome
        <input name="name" required maxLength={160} autoComplete="name" style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>E-mail
        <input name="email" type="email" required maxLength={254} autoComplete="email" style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>WhatsApp
        <input name="phone" required maxLength={50} autoComplete="tel" style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>Mensagem
        <textarea name="message" required rows={4} maxLength={5000} defaultValue={`Olá, gostaria de mais informações sobre este imóvel anunciado por ${companyName}.`} style={{ ...inputStyle, resize: "vertical" }} />
      </label>
      <button type="submit" disabled={loading} style={{ border: 0, borderRadius: 6, padding: "14px 18px", background: "#1b2833", color: "#fff", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
        {loading ? "Enviando..." : "Solicitar informações"}
      </button>
      {message && <p role="status" style={{ margin: 0, color: success ? "#23784c" : "#a32e2e", fontSize: 13 }}>{message}</p>}
    </form>
  );
}

const inputStyle: CSSProperties = {
  width: "100%", border: "1px solid #d9dfe3", borderRadius: 5, padding: "12px 13px",
  background: "#fff", color: "#1c2730", font: "inherit", boxSizing: "border-box",
};
