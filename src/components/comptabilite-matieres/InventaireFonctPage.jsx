import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { getFonctPharmacyStock2 } from "../../helpers/stock2";
import { hasSupplierAccess, productVisibleInCircuit } from "../../permissions";
import { PrintModal, InventoryChecklistPrint, Stock2InventoryHistoryPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";

// Inventaire du circuit fonctionnement — comptage physique confronté au stock
// calculé. Limité à la PHARMACIE fonctionnement pour l'instant : la
// consommation côté service n'est pas encore tracée dans cette application
// (voir StockFonctPage — la vue service n'affiche qu'un cumul de ce qui a été
// remis, pas un stock qui se déplète), donc un inventaire service n'aurait
// rien de significatif à comparer. Cette rubrique pourra être étendue aux
// services le jour où leur consommation sera tracée.
export function InventaireFonctPage({store,activeSupplier,currentUser}){
  const scope = "fonct-pharmacy";
  const [mode,setMode] = useState("complet"); // "complet" | "partiel"
  const [selectedIds,setSelectedIds] = useState([]); // produits choisis en mode partiel
  const [search,setSearch] = useState("");
  const [showResults,setShowResults] = useState(false);
  const [counts,setCounts] = useState({}); // productId -> quantité comptée (chaîne)
  const [msg,setMsg] = useState("");
  const [saving,setSaving] = useState(false);
  const [showPrint,setShowPrint] = useState(false);
  const [selectedSession,setSelectedSession] = useState(null); // session d'inventaire (regroupe plusieurs produits) affichée en détail
  const [showPrintSession,setShowPrintSession] = useState(false);
  const [filterType,setFilterType] = useState("");

  const scopedProducts = store.products
    .filter(p=>productVisibleInCircuit(p,"fonctionnement",store.suppliers) && (activeSupplier ? p.supplierId===activeSupplier.id : hasSupplierAccess(currentUser,p.supplierId)))
    .filter(p=>!filterType||p.typeFonct===filterType);

  const products = mode==="complet"
    ? (search.trim() ? scopedProducts.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())) : scopedProducts)
    : scopedProducts.filter(p=>selectedIds.includes(p.id));

  const searchResults = mode==="partiel" && search.trim()
    ? scopedProducts.filter(p=>!selectedIds.includes(p.id) && p.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const getComputed = (productId) => getFonctPharmacyStock2(store,productId);

  const submit = async () => {
    const lines = Object.entries(counts)
      .filter(([,val])=>val!==""&&val!=null)
      .map(([pid,val])=>{
        const p = store.products.find(x=>x.id===pid);
        return { productId:pid, productName:p?.name||"", computedQty:getComputed(pid), countedQty:Number(val) };
      })
      .filter(l=>l.computedQty!==l.countedQty); // seuls les écarts réels sont soumis
    if (lines.length===0) { setMsg("⚠️ Aucun écart à soumettre — les quantités comptées correspondent déjà au stock calculé."); return; }
    setSaving(true);
    try {
      await store.createStock2InventoryFonct(scope, lines);
      setMsg("✅ Inventaire appliqué directement.");
      setCounts({});
      setSelectedIds([]);
      setTimeout(()=>setMsg(""),6000);
    } catch(e) { setMsg("❌ "+e.message); }
    setSaving(false);
  };

  // Historique regroupé par SESSION d'inventaire (un passage = plusieurs
  // produits comptés en une fois), pas par produit — comme pour l'inventaire
  // Stock (1) : une ligne par session dans la liste, détail au clic.
  const scopeLines = (store.stock2InventoriesFonct||[]).filter(d=>d.scope===scope);
  const sessionsMap = {};
  scopeLines.forEach(d=>{
    const sid = d.sessionId || d.id; // repli pour d'éventuelles anciennes lignes sans sessionId
    if (!sessionsMap[sid]) sessionsMap[sid] = { sessionId:sid, createdAt:d.createdAt, createdByName:d.createdByName, lines:[] };
    sessionsMap[sid].lines.push(d);
  });
  const sessions = Object.values(sessionsMap).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

  const scopeLabel = "Pharmacie"+(activeSupplier?" — "+activeSupplier.name:"");

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="inventaire-fonct" title="🗒️ Inventaire Fonctionnement" subtitle="Comptage physique du stock pharmacie — circuit fonctionnement"/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{fontSize:11,color:activeSupplier?"#166534":"#92400e",marginBottom:10,background:activeSupplier?"#f0fdf4":"#fffbeb",borderRadius:8,padding:"6px 10px"}}>
          {activeSupplier ? `📦 Fournisseur sélectionné : ${activeSupplier.name}` : "⚠️ Aucun fournisseur sélectionné — tous les fournisseurs autorisés sont mélangés. Choisissez un fournisseur actif pour un inventaire précis."}
        </div>

        {(store.productTypesFonct||[]).length>0&&(
          <div style={{marginBottom:10}}>
            <label style={label}>Filtrer par type <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span></label>
            <select style={input} value={filterType} onChange={e=>setFilterType(e.target.value)}>
              <option value="">— Tous les types —</option>
              {store.productTypesFonct.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        )}

        <div style={{marginBottom:10}}>
          <label style={label}>Type d'inventaire</label>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setMode("complet");setSearch("");setCounts({});}}
              style={{...btn(),flex:1,background:mode==="complet"?"#4338ca":"white",color:mode==="complet"?"white":"#4338ca",border:"1px solid #c7d2fe",fontSize:12}}>
              📋 Complet <span style={{fontWeight:400,fontSize:10}}>(tous les produits)</span>
            </button>
            <button onClick={()=>{setMode("partiel");setSearch("");setCounts({});setSelectedIds([]);}}
              style={{...btn(),flex:1,background:mode==="partiel"?"#4338ca":"white",color:mode==="partiel"?"white":"#4338ca",border:"1px solid #c7d2fe",fontSize:12}}>
              ☑️ Partiel <span style={{fontWeight:400,fontSize:10}}>(je choisis les produits)</span>
            </button>
          </div>
        </div>

        {mode==="partiel"?(
          <div style={{position:"relative",marginBottom:10}}>
            <label style={label}>Ajouter un produit à inventorier</label>
            <input style={input} placeholder="🔍 Rechercher un produit à ajouter..." value={search}
              onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
              onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
            {showResults&&searchResults.length>0&&(
              <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                {searchResults.slice(0,15).map(p=>(
                  <div key={p.id} onMouseDown={()=>{setSelectedIds(ids=>[...ids,p.id]);setSearch("");}}
                    style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12,fontWeight:600}}>
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        ):(
          <input style={{...input,marginBottom:10}} placeholder="🔍 Rechercher un produit..." value={search} onChange={e=>setSearch(e.target.value)}/>
        )}

        <button onClick={()=>setShowPrint(true)} style={{...btn(),background:"#eef2ff",color:"#4338ca",border:"1px solid #c7d2fe",fontSize:12,width:"100%",marginBottom:10}}>🖨️ Imprimer la liste à inventorier</button>

        <div style={{...card,marginBottom:12}}>
          {products.length===0&&<div style={{textAlign:"center",padding:20,color:"#94a3b8",fontSize:12}}>{mode==="partiel"?"Aucun produit choisi — utilisez la recherche ci-dessus.":"Aucun produit."}</div>}
          {products.map(p=>{
            const computed = getComputed(p.id);
            const counted = counts[p.id] ?? "";
            const ecart = counted!==""?Number(counted)-computed:null;
            return (
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{p.name}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Calculé : <b>{computed}</b></div>
                <input type="number" min="0" placeholder="Compté" value={counted}
                  onChange={e=>setCounts(c=>({...c,[p.id]:e.target.value}))}
                  style={{width:70,padding:"4px 6px",border:"1px solid "+(ecart==null?"#e2e8f0":ecart===0?"#86efac":"#fca5a5"),borderRadius:6,fontSize:12,textAlign:"center"}}/>
                {ecart!=null&&ecart!==0&&<span style={{fontSize:11,fontWeight:700,color:ecart<0?"#b91c1c":"#0e7490",minWidth:30}}>{ecart>0?"+":""}{ecart}</span>}
                {mode==="partiel"&&<button onClick={()=>{setSelectedIds(ids=>ids.filter(id=>id!==p.id));setCounts(c=>{const n={...c};delete n[p.id];return n;});}} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>}
              </div>
            );
          })}
        </div>

        <button onClick={submit} disabled={saving} style={{...btn(),background:"#4338ca",color:"white",width:"100%",padding:11}}>
          {saving?"⏳ Enregistrement...":"💾 Appliquer l'inventaire"}
        </button>

        {sessions.length>0&&(
          <div style={{...card,marginTop:16}}>
            <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>📋 Historique des inventaires</div>
            {sessions.map(s=>{
              const nb=s.lines.length;
              const nbConfirme=s.lines.filter(l=>l.status==="confirme").length;
              const nbRejete=s.lines.filter(l=>l.status==="rejete").length;
              return (
                <div key={s.sessionId} onClick={()=>setSelectedSession(s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #f8fafc",fontSize:12,cursor:"pointer"}}>
                  <div>
                    <div style={{fontWeight:600}}>{s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
                    <div style={{fontSize:10,color:"#94a3b8"}}>{s.createdByName} · {nb} produit(s)</div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {nbConfirme>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#dcfce7",color:"#166534"}}>✅ {nbConfirme}</span>}
                    {nbRejete>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#fee2e2",color:"#b91c1c"}}>✕ {nbRejete}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PrintModal open={showPrint} onClose={()=>setShowPrint(false)} title="Liste d'inventaire" signatories={["Compté par","Vérifié par"]}>
        <InventoryChecklistPrint
          products={products.map(p=>({name:p.name, computed:getComputed(p.id)}))}
          scopeLabel={scopeLabel}
          currentQtyLabel="Stock calculé"
        />
      </PrintModal>

      <Modal open={!!selectedSession} onClose={()=>{setSelectedSession(null);setShowPrintSession(false);}} title="🗒️ Détail de la session d'inventaire">
        {selectedSession&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
              {selectedSession.createdAt?.seconds?new Date(selectedSession.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"} · Compté par {selectedSession.createdByName}
            </div>
            {selectedSession.lines.map(d=>(
              <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                <div style={{fontWeight:600}}>{d.productName}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:"#64748b"}}>{d.computedQty} → {d.countedQty}</span>
                  <span style={{fontSize:11,fontWeight:700,color:d.ecart<0?"#b91c1c":d.ecart>0?"#0e7490":"#94a3b8"}}>{d.ecart>0?"+":""}{d.ecart}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:d.status==="confirme"?"#dcfce7":"#fee2e2",color:d.status==="confirme"?"#166534":"#b91c1c"}}>
                    {d.status==="confirme"?"✅ Confirmé":"✕ Rejeté"}
                  </span>
                </div>
              </div>
            ))}
            <button onClick={()=>setShowPrintSession(true)} style={{...btn(),background:"#eef2ff",color:"#4338ca",border:"1px solid #c7d2fe",width:"100%",padding:10,marginTop:14}}>🖨️ Imprimer cette session</button>
          </div>
        )}
      </Modal>
      <PrintModal open={showPrintSession} onClose={()=>setShowPrintSession(false)} title="Détail d'inventaire">
        {selectedSession&&(
          <Stock2InventoryHistoryPrint
            lines={selectedSession.lines.map(d=>({
              date: d.createdAt?.seconds?new Date(d.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"—",
              productName:d.productName, computedQty:d.computedQty, countedQty:d.countedQty, ecart:d.ecart, status:d.status, by:d.createdByName,
            }))}
            scopeLabel={scopeLabel}
          />
        )}
      </PrintModal>
    </div>
  );
}
