"use client";

import { useEffect, useState } from "react";

type Props = { photos: string[]; title: string; accent: string };

export default function PropertyGallery({ photos, title, accent }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const images = photos.filter(Boolean);

  function previous() { setActive((value) => (value - 1 + images.length) % images.length); }
  function next() { setActive((value) => (value + 1) % images.length); }

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false);
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [lightbox, images.length]);

  if (!images.length) return <div style={{ minHeight: 360, borderRadius: 8, background: "#e5e8e9", display: "grid", placeItems: "center", color: "#7b858c" }}>Fotos não disponíveis</div>;

  return (
    <>
      <section aria-label="Galeria de fotos do imóvel">
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 9, background: "#e8e8e6" }}>
          <button type="button" onClick={() => setLightbox(true)} aria-label="Ampliar foto" style={{ display: "block", width: "100%", border: 0, padding: 0, background: "transparent", cursor: "zoom-in" }}>
            <img src={images[active]} alt={title + " - foto " + (active + 1)} fetchPriority="high" style={{ width: "100%", height: "clamp(260px,48vw,570px)", objectFit: "cover", display: "block" }} />
          </button>
          {images.length > 1 && <>
            <button type="button" onClick={previous} aria-label="Foto anterior" style={arrowStyle("left")}>‹</button>
            <button type="button" onClick={next} aria-label="Próxima foto" style={arrowStyle("right")}>›</button>
            <span style={{ position: "absolute", right: 14, bottom: 14, borderRadius: 20, background: "rgba(0,0,0,.68)", color: "#fff", padding: "7px 12px", fontSize: 12 }}>{active + 1} / {images.length}</span>
          </>}
        </div>
        {images.length > 1 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(76px,1fr))", gap: 8, marginTop: 10 }}>
          {images.map((src, index) => <button key={src + index} type="button" onClick={() => setActive(index)} aria-label={"Ver foto " + (index + 1)} aria-pressed={active === index} style={{ border: active === index ? "3px solid " + accent : "3px solid transparent", borderRadius: 7, padding: 0, overflow: "hidden", background: "#eee", cursor: "pointer", opacity: active === index ? 1 : .72 }}>
            <img src={src} alt="" loading="lazy" style={{ width: "100%", height: 68, objectFit: "cover", display: "block" }} />
          </button>)}
        </div>}
      </section>
      {lightbox && <div role="dialog" aria-modal="true" aria-label="Fotos do imóvel" onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <button type="button" onClick={() => setLightbox(false)} aria-label="Fechar" style={{ position: "absolute", top: 18, right: 22, border: 0, background: "transparent", color: "#fff", fontSize: 34, cursor: "pointer" }}>×</button>
        {images.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); previous(); }} aria-label="Foto anterior" style={arrowStyle("left")}>‹</button>}
        <img src={images[active]} alt={title + " - foto " + (active + 1)} onClick={(event) => event.stopPropagation()} style={{ maxWidth: "min(1200px,90vw)", maxHeight: "84vh", objectFit: "contain" }} />
        {images.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="Próxima foto" style={arrowStyle("right")}>›</button>}
        <span style={{ position: "absolute", bottom: 20, color: "#fff", fontSize: 13 }}>{active + 1} / {images.length}</span>
      </div>}
    </>
  );
}

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  return { position: "absolute", [side]: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 50, border: "1px solid rgba(255,255,255,.55)", background: "rgba(0,0,0,.52)", color: "#fff", fontSize: 30, lineHeight: "30px", cursor: "pointer", zIndex: 2 };
}
