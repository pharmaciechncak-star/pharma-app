import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "../ui/PageHeader";
import { btn, card, input } from "../../helpers/styles";
import { docNorm as norm, docPathOf, searchDocSlides, loadDoc } from "../../helpers/docSearch";

// Documentation — « Formation en comptabilité des matières ».
// Le texte de chaque diapositive est chargé à la demande (import dynamique,
// pour ne pas alourdir le premier chargement de l'application) et sert à la
// recherche plein texte. L'affichage montre l'image de la diapositive
// (rendu fidèle des tableaux et modèles) et le PDF original reste
// téléchargeable / ouvrable à la bonne page.

// Normalisation, mots vides et classement : partagés avec l'Assistant IA.
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

// Surligne les termes recherchés dans un texte d'origine (accents conservés) :
// on travaille sur la version normalisée caractère par caractère, dont la
// longueur est identique à l'original tant qu'on n'applique que la
// suppression des accents (pas de fusion de nombres ici).
function highlight(text, ts){
  if(!ts.length) return text;
  const simple = String(text).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[’‘`´]/g,"'");
  if(simple.length!==text.length) return text;
  const re = new RegExp(ts.map(escRe).join("|"),"g");
  const out=[]; let last=0, m, k=0;
  while((m=re.exec(simple))){
    if(m.index>last) out.push(text.slice(last,m.index));
    out.push(<mark key={k++} style={{background:"#fde68a",padding:0,borderRadius:2}}>{text.slice(m.index,m.index+m[0].length)}</mark>);
    last=m.index+m[0].length;
    if(m[0].length===0) re.lastIndex++;
  }
  out.push(text.slice(last));
  return out;
}

const SUGGESTIONS = ["Bon d'entrée","Sortie provisoire","PV de réception","Commission de réforme","Nomenclature","Livre journal","Grand livre","Compte de gestion","300 000","Certificat administratif","Balance d'entrée","Recensement"];

export function DocumentationComptaPage(){
  const [doc,setDoc] = useState(null);
  const [err,setErr] = useState("");
  const [q,setQ] = useState("");
  const [view,setView] = useState(null);      // n° de diapositive affichée
  const [showText,setShowText] = useState(false);
  const [openCh,setOpenCh] = useState({});

  useEffect(()=>{
    loadDoc().then(m=>setDoc(m)).catch(e=>setErr(e.message));
  },[]);

  // Ouverture directe d'une diapositive (référence cliquée dans l'Assistant IA).
  useEffect(()=>{
    const take = n => { if(n>=1 && n<=136){ setView(n); setShowText(false); } };
    if(window.__pharmaDocSlide){ take(window.__pharmaDocSlide); window.__pharmaDocSlide=null; }
    const h = e => { take(e.detail); window.__pharmaDocSlide=null; };
    window.addEventListener("pharma-open-doc",h);
    return ()=>window.removeEventListener("pharma-open-doc",h);
  },[]);

  const base = (import.meta.env?.BASE_URL||"/") + (doc?.DOC_META.folder||"docs/compta-matieres") + "/";
  const pdfUrl = doc ? base + doc.DOC_META.pdf : "";
  const imgUrl = n => base + "slide-" + String(n).padStart(3,"0") + ".webp";

  const normSlides = useMemo(()=> doc ? doc.DOC_SLIDES.map(norm) : [], [doc]);

  const pathOf = useCallback(n=> doc ? docPathOf(doc.DOC_TOC,n) : [], [doc]);

  const results = useMemo(()=>{
    if(!doc) return { terms:[], sections:[], slides:[] };
    const r = searchDocSlides(doc, q, { mode:"all", limit:500, normSlides });
    const sections = r.terms.length ? doc.DOC_TOC.filter(e=>{ const t=norm(e.title); return r.terms.every(w=>t.includes(w)); }) : [];
    return { terms:r.terms, sections, slides:r.slides };
  },[doc,q,normSlides]);
  const ts = results.terms;

  const snippet = n=>{
    const raw = doc.DOC_SLIDES[n-1].replace(/\s+/g," ");
    const simple = norm(raw);
    let pos = -1;
    for(const w of ts){ const p=simple.indexOf(w); if(p>=0 && (pos<0||p<pos)) pos=p; }
    // la normalisation des nombres peut décaler les positions : on reste approximatif
    const start = Math.max(0,(pos<0?0:pos)-70);
    const s = (start>0?"… ":"") + raw.slice(start,start+220) + (raw.length>start+220?" …":"");
    return highlight(s, ts);
  };

  // Clavier dans la visionneuse : ← → pour naviguer, Échap pour fermer.
  useEffect(()=>{
    if(view==null) return;
    const h = e=>{
      if(e.key==="ArrowRight") setView(v=>Math.min(136,v+1));
      else if(e.key==="ArrowLeft") setView(v=>Math.max(1,v-1));
      else if(e.key==="Escape") setView(null);
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[view]);

  const pill = { ...btn(), background:"#eef2ff", color:"#3730a3", border:"1px solid #c7d2fe", fontSize:11, padding:"5px 10px" };

  if(err) return <div style={{padding:24,color:"#b91c1c"}}>Impossible de charger la documentation : {err}</div>;

  // ── Visionneuse d'une diapositive ──
  if(view!=null && doc){
    const total = doc.DOC_META.pages;
    return (
      <div style={{padding:0}}>
        <PageHeader pageId="documentation-compta" title="📘 Documentation" subtitle={"Diapositive "+view+" / "+total}>
          <button onClick={()=>setView(null)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>← {q?"Résultats":"Sommaire"}</button>
        </PageHeader>
        <div style={{padding:16,maxWidth:1100,margin:"0 auto"}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>{pathOf(view).join("  ›  ")||doc.DOC_META.title}</div>
          <div style={{...card,padding:6,marginBottom:10}}>
            <a href={imgUrl(view)} target="_blank" rel="noreferrer" title="Ouvrir l'image en grand (zoom)"><img src={imgUrl(view)} alt={"Diapositive "+view} style={{width:"100%",height:"auto",display:"block",borderRadius:6}}/></a>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
            <button disabled={view<=1} onClick={()=>setView(v=>v-1)} style={{...btn(),background:"#f1f5f9",color:"#334155",opacity:view<=1?0.4:1}}>◀ Précédente</button>
            <button disabled={view>=total} onClick={()=>setView(v=>v+1)} style={{...btn(),background:"#f1f5f9",color:"#334155",opacity:view>=total?0.4:1}}>Suivante ▶</button>
            <button onClick={()=>setShowText(s=>!s)} style={{...btn(),background:"#eef2ff",color:"#3730a3"}}>{showText?"Masquer le texte":"📝 Voir le texte"}</button>
            <a href={pdfUrl+"#page="+view} target="_blank" rel="noreferrer" style={{...btn(),background:"#fef3c7",color:"#92400e",textDecoration:"none"}}>📄 Ouvrir le PDF à cette page</a>
            <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>Astuce : flèches ← → du clavier</span>
          </div>
          {showText&&(
            <div style={{...card,whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.6,color:"#1e293b"}}>{highlight(doc.DOC_SLIDES[view-1], ts)}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="documentation-compta" title="📘 Documentation" subtitle="Formation en comptabilité des matières — recherche dans les 136 diapositives">
        {doc&&<a href={pdfUrl} download style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12,textDecoration:"none"}}>⬇️ Télécharger le PDF</a>}
      </PageHeader>
      <div style={{padding:16,maxWidth:1000,margin:"0 auto"}}>
        <div style={{...card,marginBottom:12}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
            <input autoFocus style={{...input,paddingLeft:32,fontSize:14}} value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Rechercher : sortie provisoire, PV de réception, nomenclature, 300 000…"/>
            {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",border:"none",background:"transparent",cursor:"pointer",fontSize:14,color:"#94a3b8"}}>✕</button>}
          </div>
          {!q&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
            {SUGGESTIONS.map(s=><button key={s} onClick={()=>setQ(s)} style={pill}>{s}</button>)}
          </div>}
        </div>

        {!doc&&<div style={{color:"#94a3b8",fontSize:13,padding:12}}>⏳ Chargement de la documentation…</div>}

        {doc&&q&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",margin:"4px 2px 10px"}}>
              {ts.length===0 ? "Saisissez un mot plus précis." : <><b>{results.slides.length}</b> diapositive(s) trouvée(s){results.sections.length?<> · <b>{results.sections.length}</b> rubrique(s)</>:null}</>}
            </div>
            {results.sections.length>0&&(
              <div style={{...card,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6}}>RUBRIQUES</div>
                {results.sections.map((e,i)=>(
                  <div key={i} onClick={()=>setView(e.from)} style={{padding:"7px 4px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",fontSize:13,display:"flex",justifyContent:"space-between",gap:8}}>
                    <span style={{fontWeight:600,color:"#1e3a8a"}}>{highlight(e.title,ts)}</span>
                    <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>diapo. {e.from}{e.to>e.from?"–"+e.to:""}</span>
                  </div>
                ))}
              </div>
            )}
            {results.slides.slice(0,60).map(r=>(
              <div key={r.n} onClick={()=>setView(r.n)} style={{...card,marginBottom:8,cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:4}}>
                  <span style={{fontSize:11,color:"#6366f1",fontWeight:700}}>{pathOf(r.n).slice(-2).join("  ›  ")||"—"}</span>
                  <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>Diapo. {r.n}</span>
                </div>
                <div style={{fontSize:12.5,color:"#334155",lineHeight:1.5}}>{snippet(r.n)}</div>
              </div>
            ))}
            {results.slides.length>60&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:8}}>Affinez la recherche pour voir les autres résultats.</div>}
            {ts.length>0&&results.slides.length===0&&results.sections.length===0&&(
              <div style={{...card,color:"#64748b",fontSize:13}}>Aucun passage ne contient tous ces mots. Essayez avec moins de mots ou un synonyme.</div>
            )}
          </div>
        )}

        {doc&&!q&&(
          <div style={card}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>SOMMAIRE</div>
            {(()=>{
              const rows=[]; let ch=-1;
              doc.DOC_TOC.forEach((e,i)=>{
                if(e.level===0) ch=i;
                const parent=ch;
                if(e.level>0 && !openCh[parent]) return;
                const isCh = e.level===0;
                const hasKids = isCh && doc.DOC_TOC[i+1]?.level>0;
                rows.push(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 4px",paddingLeft:4+e.level*18,borderBottom:"1px solid #f1f5f9"}}>
                    {hasKids
                      ? <button onClick={()=>setOpenCh(o=>({...o,[i]:!o[i]}))} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:10,color:"#64748b",width:16,transform:openCh[i]?"rotate(90deg)":"none",transition:"transform .15s"}}>▶</button>
                      : <span style={{width:16}}/>}
                    <span onClick={()=>setView(e.from)} style={{flex:1,cursor:"pointer",fontSize:isCh?13.5:12.5,fontWeight:isCh?800:(e.level===1?600:400),color:isCh?"#1e3a8a":"#334155"}}>{e.title}</span>
                    <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>{e.from}{e.to>e.from?"–"+e.to:""}</span>
                  </div>
                );
              });
              return rows;
            })()}
            <div style={{fontSize:11,color:"#94a3b8",marginTop:10}}>Source : {doc.DOC_META.title} — {doc.DOC_META.author}. Cliquez sur une rubrique pour l'ouvrir, ▶ pour voir ses sous-parties.</div>
          </div>
        )}
      </div>
    </div>
  );
}
