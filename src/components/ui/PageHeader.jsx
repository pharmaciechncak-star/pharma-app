import { useState, useEffect, useRef } from "react";
import { PAGE_COLORS } from "../../constants";

export function PageHeader({ pageId, title, subtitle, children }) {
  const theme = PAGE_COLORS[pageId] || { bg:"linear-gradient(135deg,#1e293b,#334155)", accent:"#94a3b8", icon:"📄" };
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  useEffect(()=>{
    const el = document.getElementById("main-scroll-area");
    if(!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      // Cacher si on scrolle vers le bas (>80px), montrer si on remonte
      setVisible(y < lastY.current || y < 80);
      lastY.current = y;
    };
    el.addEventListener("scroll", onScroll, {passive:true});
    return ()=>el.removeEventListener("scroll", onScroll);
  },[]);
  return (
    <div style={{
      background: theme.bg,
      padding:"18px 16px 14px",
      marginBottom:0,
      position:"sticky", top:0, zIndex:10,
      transition:"transform 0.22s ease, opacity 0.22s ease",
      transform: visible ? "translateY(0)" : "translateY(-110%)",
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? "auto" : "none",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{
            fontSize:20, fontWeight:800, color:"white",
            display:"flex", alignItems:"center", gap:8, lineHeight:1.2,
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{fontSize:11,color:theme.accent,marginTop:3,opacity:0.9}}>{subtitle}</div>
          )}
        </div>
        {children && (
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {children}
          </div>
        )}
      </div>
      {/* Barre colorée en bas */}
      <div style={{height:3,background:theme.accent,borderRadius:99,marginTop:12,opacity:0.6}}/>
    </div>
  );
}
