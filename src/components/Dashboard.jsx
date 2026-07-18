import { useState } from "react";
import { ImageCarousel } from "./layout/ImageCarousel";
import { DEFAULT_CAROUSEL_SLIDES, monthLabel, fmtDate } from "../constants";
import { PageHeader } from "./ui/PageHeader";
import { card } from "../helpers/styles";
import { hasSupplierAccess } from "../permissions";

export function Dashboard({store,activeSupplier,activeDepot,currentUser}){
  const {entries,returns,inventories,invoices,products,stock,depots,suppliers}=store;
  const supProds=activeSupplier ? products.filter(p=>p.supplierId===activeSupplier.id) : products.filter(p=>hasSupplierAccess(currentUser,p.supplierId));
  const totalStock=supProds.reduce((a,p)=>a+(stock[p.id]||0),0);
  const month=new Date().getMonth(), year=new Date().getFullYear();
  const mEntries=entries.filter(e=>new Date(e.date).getMonth()===month&&new Date(e.date).getFullYear()===year&&(activeSupplier?e.supplierId===activeSupplier.id:hasSupplierAccess(currentUser,e.supplierId)));
  const mReturns=returns.filter(r=>new Date(r.date).getMonth()===month&&new Date(r.date).getFullYear()===year&&(activeSupplier?r.supplierId===activeSupplier.id:hasSupplierAccess(currentUser,r.supplierId)));
  const lowStock=supProds.filter(p=>(stock[p.id]||0)<30);
  const isAdmin = currentUser?.role==="admin";

  // ── État pour l'éditeur de slides ──
  // Les slides viennent de Firestore (store.carouselSlides, partagé par tous) —
  // plus de state local synchronisé à la main, le listener temps réel s'en charge.
  const [showSlideEditor, setShowSlideEditor] = useState(false);
  const slides = store.carouselSlides || DEFAULT_CAROUSEL_SLIDES;
  const [editSlide, setEditSlide] = useState(null); // {index, emoji, title, sub, bg, accent}
  const ACCENT_COLORS = ["#38bdf8","#4ade80","#fb923c","#a78bfa","#f9a8d4","#fbbf24","#34d399","#f87171"];
  const BG_GRADIENTS = [
    "linear-gradient(135deg,#0c4a6e 0%,#0f172a 100%)",
    "linear-gradient(135deg,#312e81 0%,#1e1b4b 100%)",
    "linear-gradient(135deg,#064e3b 0%,#022c22 100%)",
    "linear-gradient(135deg,#78350f 0%,#431407 100%)",
    "linear-gradient(135deg,#4c0519 0%,#1e0010 100%)",
    "linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%)",
    "linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)",
    "linear-gradient(135deg,#2d1b69 0%,#11998e 100%)",
  ];

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [slidesError, setSlidesError] = useState("");

  const handlePhotoUpload = (file) => {
    if (!file) return;
    // Vérifier la taille (max 500KB par image — le carrousel entier est stocké
    // dans UN SEUL document Firestore, limité à 1 Mo au total tous slides
    // confondus, donc chaque image doit rester raisonnable)
    if (file.size > 500 * 1024) {
      alert("⚠️ Image trop grande. Maximum 500 KB par image (le carrousel est partagé via un document Firestore limité à 1 Mo au total). Compressez l'image et réessayez.");
      return;
    }
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result; // data:image/...;base64,...
      setEditSlide(v => ({...v, imageUrl: base64, storagePath: ""}));
      setUploadingPhoto(false);
    };
    reader.onerror = () => {
      alert("❌ Erreur lors de la lecture de l'image.");
      setUploadingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = () => {
    setEditSlide(v => ({...v, imageUrl: "", storagePath: ""}));
  };

  const saveAndDispatch = async (newSlides) => {
    // Garde-fou : la taille totale du document Firestore (JSON complet) doit
    // rester sous ~950 Ko pour laisser une marge sous la limite de 1 Mo.
    const approxSize = new Blob([JSON.stringify(newSlides)]).size;
    if (approxSize > 950 * 1024) {
      setSlidesError("⚠️ Le carrousel est trop volumineux (" + Math.round(approxSize/1024) + " Ko / 1000 Ko max). Retirez ou compressez une image avant d'enregistrer.");
      return false;
    }
    setSlidesError("");
    try {
      await store.saveCarouselSlides(newSlides);
      return true;
    } catch(e) {
      setSlidesError("❌ " + e.message);
      return false;
    }
  };

  const handleSaveSlide = async () => {
    if(!editSlide) return;
    const updated = slides.map((s,i)=> i===editSlide.index ? {
      bg:          editSlide.bg,
      emoji:       editSlide.imageUrl ? "" : editSlide.emoji,
      title:       editSlide.title,
      sub:         editSlide.sub,
      accent:      editSlide.accent,
      imageUrl:    editSlide.imageUrl    || "",
    } : s);
    if (await saveAndDispatch(updated)) setEditSlide(null);
  };

  const handleAddSlide = async () => {
    const newSlide = {bg:BG_GRADIENTS[0],emoji:"✨",title:"Nouveau slide",sub:"Description du slide",accent:"#38bdf8"};
    const updated = [...slides, newSlide];
    if (await saveAndDispatch(updated)) setEditSlide({index:updated.length-1, ...newSlide});
  };

  const handleDeleteSlide = async (idx) => {
    if(slides.length<=1) return;
    const updated = slides.filter((_,i)=>i!==idx);
    if (await saveAndDispatch(updated)) setEditSlide(null);
  };

  const handleResetSlides = async () => {
    if (await saveAndDispatch(DEFAULT_CAROUSEL_SLIDES)) setEditSlide(null);
  };

  const kpis=[
    {label:"Stock Total",value:totalStock.toLocaleString(),icon:"📦",color:"#38bdf8"},
    {label:"Entrées ce mois",value:mEntries.length,icon:"📥",color:"#4ade80"},
    {label:"Retours ce mois",value:mReturns.length,icon:"↩️",color:"#fb923c"},
    {label:"Inventaires",value:inventories.filter(i=>activeSupplier?i.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,i.supplierId)).length,icon:"🗂️",color:"#a78bfa"},
  ];

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="dashboard" title="📊 Tableau de bord"
        subtitle={monthLabel() + " · " + (activeSupplier ? activeSupplier.name : "Tous fournisseurs")}/>
      <div style={{padding:16}}>
        <ImageCarousel slides={slides}/>

        {/* ── Boutons Admin ── */}
        {isAdmin&&(
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            {/* Recharge crédit Claude */}
            <button onClick={()=>window.open("https://console.anthropic.com/settings/billing","_blank")}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"1px solid #e879f9",background:"linear-gradient(135deg,#4c0519,#1e0010)",color:"white",cursor:"pointer",fontSize:12,fontWeight:700,flex:1}}>
              <span style={{fontSize:16}}>🤖</span>
              <div style={{textAlign:"left"}}>
                <div>Recharger crédit Claude</div>
                <div style={{fontSize:10,opacity:0.7,fontWeight:400}}>console.anthropic.com</div>
              </div>
              <span style={{marginLeft:"auto",fontSize:14}}>↗</span>
            </button>
            {/* Modifier slides */}
            <button onClick={()=>setShowSlideEditor(v=>!v)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"1px solid #38bdf8",background:showSlideEditor?"#0c4a6e":"#f0f9ff",color:showSlideEditor?"white":"#0891b2",cursor:"pointer",fontSize:12,fontWeight:700,flex:1}}>
              <span style={{fontSize:16}}>🖼️</span>
              <div style={{textAlign:"left"}}>
                <div>{showSlideEditor?"Fermer l'éditeur":"Modifier le carousel"}</div>
                <div style={{fontSize:10,opacity:0.7,fontWeight:400}}>{slides.length} slide(s)</div>
              </div>
            </button>
          </div>
        )}

        {/* ── Éditeur de slides (admin) ── */}
        {isAdmin&&showSlideEditor&&(
          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#1e293b"}}>🖼️ Gestion des slides du carousel</div>
            {/* Liste des slides */}
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {slides.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:s.bg,borderRadius:8,cursor:"pointer",border:editSlide?.index===i?"2px solid white":"2px solid transparent"}}
                  onClick={()=>setEditSlide({index:i,...s})}>
                  <span style={{fontSize:20}}>{s.emoji}</span>
                  <div style={{flex:1,color:"white"}}>
                    <div style={{fontWeight:700,fontSize:12}}>{s.title}</div>
                    <div style={{fontSize:10,opacity:0.7}}>{s.sub?.substring(0,50)}...</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();handleDeleteSlide(i);}}
                    style={{background:"rgba(255,0,0,0.3)",border:"none",color:"white",borderRadius:6,padding:"2px 7px",cursor:"pointer",fontSize:11}}>🗑️</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:editSlide?12:0}}>
              <button onClick={handleAddSlide} style={{padding:"6px 12px",borderRadius:8,border:"1px dashed #94a3b8",background:"white",color:"#64748b",cursor:"pointer",fontSize:12,flex:1}}>+ Ajouter un slide</button>
              <button onClick={handleResetSlides} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #fcd34d",background:"#fef9c3",color:"#92400e",cursor:"pointer",fontSize:12}}>↺ Réinitialiser</button>
            </div>
            {/* Formulaire d'édition */}
            {editSlide&&(
              <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:10,padding:12,marginTop:8}}>
                <div style={{fontWeight:700,fontSize:12,marginBottom:8,color:"#1e293b"}}>✏️ Modifier le slide {editSlide.index+1}</div>
                {slidesError&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 10px",fontSize:11,marginBottom:8}}>{slidesError}</div>}
                {/* Photo de fond */}
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>📷 Photo de fond <span style={{color:"#94a3b8"}}>(remplace le dégradé)</span></div>
                  {editSlide.imageUrl ? (
                    <div style={{position:"relative",borderRadius:8,overflow:"hidden",marginBottom:4}}>
                      <img src={editSlide.imageUrl} alt="slide" style={{width:"100%",height:90,objectFit:"contain",backgroundColor:"#0f172a",display:"block"}}/>
                      <button onClick={handleDeletePhoto}
                        style={{position:"absolute",top:6,right:6,background:"rgba(239,68,68,0.9)",border:"none",color:"white",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                        🗑️ Supprimer
                      </button>
                    </div>
                  ) : (
                    <label style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"2px dashed #cbd5e1",borderRadius:8,cursor:"pointer",background:"#f8fafc"}}>
                      <input type="file" accept="image/*" style={{display:"none"}}
                        onChange={e=>e.target.files[0]&&handlePhotoUpload(e.target.files[0])}/>
                      {uploadingPhoto
                        ? <span style={{fontSize:12,color:"#0891b2"}}>⏳ Upload en cours...</span>
                        : <><span style={{fontSize:18}}>📷</span><span style={{fontSize:12,color:"#64748b"}}>Cliquer pour choisir une image</span></>}
                    </label>
                  )}
                </div>
                {/* Emoji — masqué si photo */}
                {!editSlide.imageUrl&&(
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Emoji (si pas de photo)</div>
                    <input value={editSlide.emoji||""} onChange={e=>setEditSlide(v=>({...v,emoji:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:20,boxSizing:"border-box"}}/>
                  </div>
                )}
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Titre</div>
                  <input value={editSlide.title||""} onChange={e=>setEditSlide(v=>({...v,title:e.target.value}))}
                    style={{width:"100%",padding:"6px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Sous-titre</div>
                  <textarea value={editSlide.sub||""} onChange={e=>setEditSlide(v=>({...v,sub:e.target.value}))}
                    rows={2} style={{width:"100%",padding:"6px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Couleur d'accentuation</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {ACCENT_COLORS.map(c=>(
                      <div key={c} onClick={()=>setEditSlide(v=>({...v,accent:c}))}
                        style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",
                          border:editSlide.accent===c?"3px solid #1e293b":"2px solid transparent"}}/>
                    ))}
                  </div>
                </div>
                {/* Dégradé — masqué si photo */}
                {!editSlide.imageUrl&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Dégradé de fond</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {BG_GRADIENTS.map(g=>(
                        <div key={g} onClick={()=>setEditSlide(v=>({...v,bg:g}))}
                          style={{width:32,height:24,borderRadius:4,background:g,cursor:"pointer",
                            border:editSlide.bg===g?"3px solid #0891b2":"2px solid transparent"}}/>
                      ))}
                    </div>
                  </div>
                )}
                {/* Aperçu */}
                <div style={{background:editSlide.imageUrl?"none":editSlide.bg,borderRadius:8,padding:"10px 14px",marginBottom:10,textAlign:"center",
                  ...(editSlide.imageUrl?{backgroundImage:`url(${editSlide.imageUrl})`,backgroundSize:"cover",backgroundPosition:"center"}:{})}}>
                  {!editSlide.imageUrl&&<div style={{fontSize:28}}>{editSlide.emoji}</div>}
                  <div style={{color:"white",fontWeight:700,fontSize:12,textShadow:"0 1px 3px rgba(0,0,0,0.5)"}}>{editSlide.title}</div>
                  <div style={{height:2,background:editSlide.accent,width:40,margin:"6px auto 0",borderRadius:99}}/>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={handleSaveSlide} disabled={uploadingPhoto}
                    style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:uploadingPhoto?"#cbd5e1":"#0891b2",color:"white",cursor:uploadingPhoto?"not-allowed":"pointer",fontWeight:700,fontSize:12}}>
                    {uploadingPhoto?"⏳ Upload...":"✅ Sauvegarder"}
                  </button>
                  <button onClick={()=>setEditSlide(null)}
                    style={{padding:"8px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"white",color:"#64748b",cursor:"pointer",fontSize:12}}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        )}
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {kpis.map(k=>(
          <div key={k.label} style={{...card,padding:14}}>
            <div style={{fontSize:22}}>{k.icon}</div>
            <div style={{fontSize:24,fontWeight:800,color:k.color,margin:"4px 0"}}>{k.value}</div>
            <div style={{fontSize:11,color:"#64748b"}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Alerte stocks bas */}
      {lowStock.length>0&&(
        <div style={{background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:10,padding:14,marginBottom:16}}>
          <div style={{fontWeight:700,color:"#92400e",marginBottom:8}}>⚠️ Stocks Bas ({lowStock.length})</div>
          {lowStock.map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px solid rgba(0,0,0,0.05)"}}>
              <span style={{color:"#78350f"}}>{p.name}</span>
              <span style={{fontWeight:700,color:"#ef4444"}}>{stock[p.id]||0} u.</span>
            </div>
          ))}
        </div>
      )}

      {/* Niveaux stock */}
      <div style={{...card,marginBottom:12}}>
        <div style={{fontWeight:700,color:"#1e293b",marginBottom:12,fontSize:14}}>📈 Niveaux de stock</div>
        {supProds.slice(0,6).map(p=>{
          const qty=stock[p.id]||0;
          const pct=Math.min(100,(qty/250)*100);
          return(
            <div key={p.id} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                <span style={{color:"#374151",fontWeight:500}}>{p.name}</span>
                <span style={{fontWeight:700,color:qty<30?"#ef4444":"#059669"}}>{qty}</span>
              </div>
              <div style={{height:5,background:"#f1f5f9",borderRadius:99}}>
                <div style={{height:"100%",width:pct+"%",background:qty<30?"#ef4444":"#38bdf8",borderRadius:99,transition:"width 0.5s"}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Activités récentes */}
      <div style={{...card}}>
        <div style={{fontWeight:700,color:"#1e293b",marginBottom:12,fontSize:14}}>🕐 Activités récentes</div>
        {[...entries,...returns].filter(x=>activeSupplier?x.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,x.supplierId)).slice(0,5).map(x=>(
          <div key={x.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}>
            <div><span style={{marginRight:6}}>{x.type==="entry"?"📥":"↩️"}</span><span style={{color:"#374151"}}>Bon #{x.id.slice(-5)}</span></div>
            <span style={{color:"#94a3b8"}}>{fmtDate(x.date)}</span>
          </div>
        ))}
        {entries.length===0&&returns.length===0&&<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:16}}>Aucune activité</div>}
      </div>
      </div>{/* end padding:16 */}
    </div>
  );
}
