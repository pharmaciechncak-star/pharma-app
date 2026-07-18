import { useState, useEffect, useRef } from "react";
import { DEFAULT_CAROUSEL_SLIDES } from "../../constants";

// Les slides sont désormais stockées dans Firestore (voir useStore.js —
// carouselSlides, document unique settings/carousel) et passées ici en prop,
// pour être visibles par TOUS les utilisateurs — plus de localStorage, qui
// n'était visible que sur l'appareil de la personne ayant fait la modification.
export function ImageCarousel({ slides }) {
  const list = slides && slides.length ? slides : DEFAULT_CAROUSEL_SLIDES;
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const timerRef = useRef(null);

  // Auto-défilement toutes les 4 secondes
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % list.length);
    }, 4000);
    return () => clearInterval(timerRef.current);
  }, [paused, list.length]);

  const go = (idx) => {
    setCurrent(idx);
    setPaused(true);
    clearInterval(timerRef.current);
    setTimeout(() => setPaused(false), 6000);
  };
  const prev = () => go((current - 1 + list.length) % list.length);
  const next = () => go((current + 1) % list.length);

  const slide = list[current] || list[0];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position:"relative",
        backgroundColor: slide.imageUrl ? "#0f172a" : "transparent",
        backgroundImage: slide.imageUrl ? `url(${slide.imageUrl})` : slide.bg,
        backgroundSize: slide.imageUrl ? "contain" : "100% 100%",
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
        {list.map((_, i) => (
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
        {current+1}/{list.length}
      </div>
    </div>
  );
}
