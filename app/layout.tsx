import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Versus CRM",
  description: "Plataforma de gestão imobiliária"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
