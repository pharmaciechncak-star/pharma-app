import { useState, useEffect, useRef } from "react";

export const DEFAULT_CAROUSEL_SLIDES = [
  {
    bg:"linear-gradient(135deg,#0c4a6e 0%,#0f172a 100%)",
    emoji:"🏥", title:"Centre Hospitalier National Cheikh Ahmadoul Khadim",
    sub:"PharmaStock — Système de gestion des inventaires pharmaceutiques", accent:"#38bdf8",
  },
  {
    bg:"linear-gradient(135deg,#312e81 0%,#1e1b4b 100%)",
    emoji:"🗂️", title:"Inventaires Mensuels Automatisés",
    sub:"Scannez vos documents, calculez vos ventes, générez vos factures en quelques clics", accent:"#a5b4fc",
  },
  {
    bg:"linear-gradient(135deg,#064e3b 0%,#022c22 100%)",
    emoji:"💊", title:"Gestion du Stock en Temps Réel",
    sub:"Médicaments et consommables suivis en permanence, alertes de stock bas automatiques", accent:"#34d399",
  },
  {
    bg:"linear-gradient(135deg,#78350f 0%,#431407 100%)",
    emoji:"🤝", title:"Collaboration Fournisseurs Simplifiée",
    sub:"Envoyez vos factures et bons directement par email depuis l'application", accent:"#fbbf24",
  },
  {
    bg:"linear-gradient(135deg,#4c0519 0%,#1e0010 100%)",
    emoji:"🤖", title:"Assistant IA Intégré",
    sub:"Scannez vos documents Excel, PDF et images pour importer données automatiquement", accent:"#f9a8d4",
  },
];

export function loadSlides() {
  try { const s = localStorage.getItem("carousel_slides"); return s ? JSON.parse(s) : DEFAULT_CAROUSEL_SLIDES; }
  catch(e) { return DEFAULT_CAROUSEL_SLIDES; }
}

export function saveSlides(slides) {
  try { localStorage.setItem("carousel_slides", JSON.stringify(slides)); } catch(e){}
}

export function ImageCarousel() {
  const [slides, setSlides] = useState(loadSlides);
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const timerRef = useRef(null);

  // Écouter les changements de slides (admin)
  useEffect(() => {
    const onStorage = () => setSlides(loadSlides());
    window.addEventListener("pharma_slides_updated", onStorage);
    return () => window.removeEventListener("pharma_slides_updated", onStorage);
  }, []);

  // Auto-défilement toutes les 4 secondes
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timerRef.current);
  }, [paused, slides.length]);

  const go = (idx) => {
    setCurrent(idx);
    setPaused(true);
    clearInterval(timerRef.current);
    setTimeout(() => setPaused(false), 6000);
  };
  const prev = () => go((current - 1 + slides.length) % slides.length);
  const next = () => go((current + 1) % slides.length);

  const slide = slides[current] || slides[0];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position:"relative",
        backgroundColor: slide.imageUrl ? "transparent" : "transparent",
        backgroundImage: slide.imageUrl ? `url(${slide.imageUrl})` : slide.bg,
        backgroundSize: slide.imageUrl ? "cover" : "100% 100%",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        overflow:"hidden",
        marginBottom:16,
        marginLeft:-16,
        marginRight:-16,
        height:200,
        display:"flex",
        alignItems:"center",
        transition:"background 0.6s ease",
        userSelect:"none",
      }}>

      {/* Overlay sombre si photo */}
      {slide.imageUrl&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)",borderRadius:14}}/>}

      {/* Contenu slide */}
      <div style={{flex:1, padding:"24px 60px 24px 24px", textAlign:"center", position:"relative", zIndex:1}}>
        {!slide.imageUrl&&<div style={{fontSize:48, lineHeight:1, marginBottom:10,
          filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.4))"}}>
          {slide.emoji}
        </div>}
        <div style={{
          fontSize:15, fontWeight:800, color:"white", lineHeight:1.3,
          marginBottom:8, textShadow:"0 2px 8px rgba(0,0,0,0.5)",
        }}>
          {slide.title}
        </div>
        <div style={{fontSize:11, color:"rgba(255,255,255,0.75)", lineHeight:1.5, maxWidth:380, margin:"0 auto"}}>
          {slide.sub}
        </div>
        {/* Barre colorée */}
        <div style={{height:3, background:slide.accent, borderRadius:99,
          width:60, margin:"12px auto 0", opacity:0.8}}/>
      </div>

      {/* Flèches */}
      <button onClick={prev} style={{
        position:"absolute", left:6, top:"50%", transform:"translateY(-50%)",
        background:"rgba(255,255,255,0.15)", border:"none", color:"white",
        borderRadius:"50%", width:32, height:32, cursor:"pointer",
        fontSize:16, display:"flex", alignItems:"center", justifyContent:"center",
        backdropFilter:"blur(4px)",
      }}>‹</button>
      <button onClick={next} style={{
        position:"absolute", right:6, top:"50%", transform:"translateY(-50%)",
        background:"rgba(255,255,255,0.15)", border:"none", color:"white",
        borderRadius:"50%", width:32, height:32, cursor:"pointer",
        fontSize:16, display:"flex", alignItems:"center", justifyContent:"center",
        backdropFilter:"blur(4px)",
      }}>›</button>

      {/* Points indicateurs */}
      <div style={{
        position:"absolute", bottom:10, left:"50%", transform:"translateX(-50%)",
        display:"flex", gap:6,
      }}>
        {slides.map((_, i) => (
          <div key={i} onClick={() => go(i)} style={{
            width: i === current ? 20 : 7,
            height:7, borderRadius:99,
            background: i === current ? slide.accent : "rgba(255,255,255,0.35)",
            cursor:"pointer",
            transition:"all 0.3s ease",
          }}/>
        ))}
      </div>

      {/* Numéro slide */}
      <div style={{
        position:"absolute", top:8, right:12,
        fontSize:10, color:"rgba(255,255,255,0.5)", fontWeight:600,
      }}>
        {current+1}/{slides.length}
      </div>
    </div>
  );
}
