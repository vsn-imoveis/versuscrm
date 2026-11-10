"use client";

type Props = { src: string };

export default function OriginalPropertyFrame({ src }: Props) {
  return (
    <iframe
      title="Página original do imóvel"
      src={src}
      style={{ display: "block", width: "100%", height: "100vh", minHeight: "720px", border: 0, background: "#fff" }}
      allow="clipboard-write"
    />
  );
}
