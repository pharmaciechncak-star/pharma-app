import { useState, useEffect, useRef } from "react";
import { can } from "../permissions";
import { btn } from "../helpers/styles";
import { SECTIONS } from "../constants";
import { buildAIContext, scanDocumentWithAI } from "../hooks/useAI";

export function AIPanel({open,onClose,ai,onNav,store,page,activeSupplier,currentUser}){
  const [input,setInput]=useState("");
  const [scanning,setScanning]=useState(false);
  const [scanMsg,setScanMsg]=useState("");
  const [listening,setListening]=useState(false);
  const [micError,setMicError]=useState("");
  const fileRef=useRef(null);
  const bottomRef=useRef(null);
  const recognRef=useRef(null);

  // Hooks doivent tous être avant le return conditionnel
  useEffect(()=>{
    if(!open) return;
    bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[ai.msgs, open]);

  // Injecter l'animation pulse si pas déjà présente
  useEffect(()=>{
    if(!document.getElementById("pharma-pulse-style")){
      const s = document.createElement("style");
      s.id = "pharma-pulse-style";
      s.textContent = "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}";
      document.head.appendChild(s);
    }
  },[]);

  // Nettoyage micro à la fermeture
  useEffect(()=>{
    if(!open && recognRef.current){
      try { recognRef.current.stop(); } catch(e){}
      setListening(false);
    }
  },[open]);

  const toggleMic = () => {
    setMicError("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ setMicError("Micro non supporté par ce navigateur."); return; }

    if(listening){
      try { recognRef.current?.stop(); } catch(e){}
      setListening(false);
      return;
    }

    const recog = new SR();
    recog.lang = "fr-FR";
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;
    recognRef.current = recog;

    recog.onstart  = () => setListening(true);
    recog.onend    = () => setListening(false);
    recog.onerror  = (e) => {
      setListening(false);
      if(e.error==="not-allowed") setMicError("⛔ Accès au micro refusé. Autorisez le micro dans votre navigateur.");
      else if(e.error!=="aborted") setMicError("❌ Erreur micro : " + e.error);
    };
    recog.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r=>r[0].transcript).join("");
      setInput(transcript);
      // Résultat final → arrêter l'écoute mais NE PAS envoyer automatiquement
      // L'utilisateur peut modifier le texte puis appuyer sur Entrée ou →
      if(e.results[e.results.length-1].isFinal){
        setListening(false);
      }
    };
    try { recog.start(); }
    catch(e){ setMicError("❌ Impossible de démarrer le micro."); }
  };

  if(!open) return null;
  if(!can(currentUser,"assistant_ia","r")){
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
        <div style={{background:"white",borderRadius:16,padding:24,maxWidth:340,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:40,marginBottom:10}}>⛔</div>
          <div style={{fontWeight:700,fontSize:15,color:"#1e293b",marginBottom:6}}>Accès non autorisé</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>L'Assistant IA n'est pas activé pour votre compte. Contactez l'administrateur pour obtenir l'accès.</div>
          <button onClick={onClose} style={{...btn(),background:"#0891b2",color:"white",width:"100%",padding:10}}>Fermer</button>
        </div>
      </div>
    );
  }

  // Construire le contexte complet avec données réelles
  const ctx = {
    page,
    activeSupplier: activeSupplier?.name,
    pagesAccessibles: SECTIONS.filter(s=>can(currentUser,s.id,"r")).map(s=>s.id).concat(["dashboard"]),
    fullData: buildAIContext(store, currentUser, activeSupplier, page),
    stats: store.entries.length + " entrées, " + store.returns.length + " retours, " + store.products.length + " produits",
  };

  const handleSend=()=>{ if(!input.trim()) return; ai.send(input,ctx,onNav); setInput(""); };

  const handleFile=async(file)=>{
    if(!file) return;
    setScanning(true);
    // Filtrer les produits par fournisseur actif — ne pas comparer avec d'autres fournisseurs
    const supplierProducts = activeSupplier
      ? store.products.filter(p => p.supplierId === activeSupplier.id)
      : store.products;
    const result = await scanDocumentWithAI(file, supplierProducts);
    setScanning(false);
    const summary = result.success
      ? `Document scanné: ${file.name}\nDonnées extraites: ${JSON.stringify(result, null, 2)}\nExplique-moi ces données et propose comment les intégrer.`
      : `J'ai tenté de scanner "${file.name}" mais: ${result.error || "format non supporté"}. Donne des conseils.`;
    ai.send(summary, ctx, onNav);
  };

  const quickBtns = ["Situation du stock","Produits en alerte","Dernier inventaire","Situations en attente","Total vendu ce mois","Ouvrir inventaire"];

  return(
    <div style={{position:"fixed",right:0,top:0,bottom:0,width:340,background:"white",boxShadow:"-4px 0 20px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",zIndex:400}}>
      <div style={{padding:"14px 16px",background:"linear-gradient(135deg,#7c3aed,#6d28d9)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:700,color:"white",fontSize:14}}>🤖 Assistant IA</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.65)"}}>PharmaStock Intelligence</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={ai.reset} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",padding:"4px 8px",fontSize:11}}>Réinit.</button>
          <button onClick={onClose} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",padding:"4px 8px"}}>✕</button>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:10}}>
        {ai.msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{
              maxWidth:"88%",padding:"9px 13px",fontSize:13,lineHeight:1.5,
              borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",
              background:m.role==="user"?"#7c3aed":"#f1f5f9",
              color:m.role==="user"?"white":"#1e293b",
            }}>{m.content}</div>
          </div>
        ))}
        {(ai.loading||scanning)&&(
          <div style={{display:"flex"}}>
            <div style={{background:"#f1f5f9",padding:"9px 13px",borderRadius:"12px 12px 12px 4px",fontSize:13,color:"#64748b"}}>
              {scanning?"📄 Analyse du document...":"⏳ Réponse en cours..."}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div style={{padding:12,borderTop:"1px solid #f1f5f9"}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
          {quickBtns.map(q=>(
            <button key={q} onClick={()=>setInput(q)} style={{fontSize:10,background:"#f0f9ff",color:"#0891b2",border:"1px solid #bae6fd",borderRadius:99,padding:"3px 8px",cursor:"pointer"}}>{q}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:7,alignItems:"flex-end"}}>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();} }}
            placeholder={listening?"🎙️ Parlez... le texte apparaîtra ici, vous pourrez le modifier avant d'envoyer":"Message ou question... (Entrée pour envoyer)"}
            style={{flex:1,padding:"9px 12px",border:listening?"1.5px solid #7c3aed":"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,resize:"none",height:58,boxSizing:"border-box",outline:"none",background:listening?"#fdf4ff":"white",transition:"all 0.2s"}}
          />
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <button onClick={handleSend} disabled={ai.loading} style={{...btn(),background:"#7c3aed",color:"white",padding:"8px 12px"}}>→</button>
            {/* Micro */}
            <button onClick={toggleMic}
              title={listening?"Arrêter l'écoute":"Dicter un message"}
              style={{...btn(),
                background:listening?"#ef4444":"#f0f9ff",
                color:listening?"white":"#7c3aed",
                border:listening?"none":"1px solid #ddd8fe",
                padding:"7px 9px",fontSize:15,
                animation:listening?"pulse 1s infinite":undefined,
              }}>
              {listening?"⏹":"🎙️"}
            </button>
            <button onClick={()=>fileRef.current?.click()} style={{...btn(),background:"#f0f9ff",color:"#0891b2",border:"1px solid #bae6fd",padding:"7px 9px",fontSize:13}}>📎</button>
          </div>
        </div>
        {micError&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>{micError}</div>}
        {listening&&<div style={{fontSize:11,color:"#7c3aed",marginTop:4,display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"pulse 1s infinite"}}/>
          Écoute en cours... Parlez en français
        </div>}
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{ handleFile(e.target.files[0]); e.target.value=""; }}/>
        <div style={{fontSize:10,color:"#94a3b8",marginTop:6,textAlign:"center"}}>Glissez ou cliquez 📎 pour scanner un document PDF/Excel/Image</div>
      </div>
    </div>
  );
}
