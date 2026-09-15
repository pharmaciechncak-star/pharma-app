import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { getPharmacyStock2, getServiceStock2 } from "../../helpers/stock2";
import { visibleServices, productAllowedForService, hasSupplierAccess } from "../../permissions";
import { PrintModal, InventoryChecklistPrint, Stock2InventoryHistoryPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";

// Inventaire du Stock (2) — comptage physique confronté au stock calculé.
// Côté pharmacie : appliqué immédiatement (l'agent qui compte est déjà
// légitime sur son propre domaine). Côté service : reste "en attente" tant
// qu'un agent DE CE SERVICE précis n'a pas confirmé — jamais la pharmacie ni
// un autre service (même principe que Contrôle Transfert/Contrôle Retour).
export function InventaireStock2Page({store,activeSupplier,currentUser}){
  const isServiceOnly = currentUser?.role==="agent_service"||currentUser?.role==="admin_service";
  const myServiceId = currentUser?.serviceId||"";
  const [scope,setScope] = useState(isServiceOnly?"service:"+myServiceId:"pharmacy");
  const [search,setSearch] = useState("");
  const [counts,setCounts] = useState({}); // productId -> quantité comptée (chaîne)
  const [msg,setMsg] = useState("");
  const [saving,setSaving] = useState(false);
  const [showPrint,setShowPrint] = useState(false);
  const [selectedSession,setSelectedSession] = useState(null); // session d'inventaire (regroupe plusieurs produits) affichée en détail
  const [showPrintSession,setShowPrintSession] = useState(false);

  const scopeServiceId = scope.startsWith("service:") ? scope.slice(8) : null;

  const products = (search.trim()
    ? store.products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
    : store.products
  ).filter(p=>{
    if (scope==="pharmacy") {
      // On n'inventorie que les produits du fournisseur sélectionné — comme
      // pour les transferts/réceptions, jamais tous les fournisseurs mélangés.
      return activeSupplier ? p.supplierId===activeSupplier.id : hasSupplierAccess(currentUser,p.supplierId);
    }
    return productAllowedForService(p, scopeServiceId, store.suppliers);
  });

  const getComputed = (productId) => scope==="pharmacy" ? getPharmacyStock2(store,productId) : getServiceStock2(store,productId,scopeServiceId);

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
      await store.createStock2Inventory(scope, lines);
      setMsg(scope==="pharmacy" ? "✅ Inventaire appliqué directement." : "✅ Inventaire envoyé — en attente de confirmation par un agent du service.");
      setCounts({});
      setTimeout(()=>setMsg(""),6000);
    } catch(e) { setMsg("❌ "+e.message); }
    setSaving(false);
  };

  // Lignes en attente de confirmation pour un agent de service — uniquement
  // celles de SON service, jamais celles d'un autre service ni de la pharmacie.
  const myPending = isServiceOnly
    ? (store.stock2Inventories||[]).filter(d=>d.status==="attente" && d.scope==="service:"+myServiceId)
    : [];

  // Historique regroupé par SESSION d'inventaire (un passage = plusieurs
  // produits comptés en une fois), pas par produit — comme pour l'inventaire
  // Stock (1) : une ligne par session dans la liste, détail au clic.
  const scopeLines = (store.stock2Inventories||[]).filter(d=>d.scope===scope);
  const sessionsMap = {};
  scopeLines.forEach(d=>{
    const sid = d.sessionId || d.id; // repli pour d'éventuelles anciennes lignes sans sessionId
    if (!sessionsMap[sid]) sessionsMap[sid] = { sessionId:sid, createdAt:d.createdAt, createdByName:d.createdByName, lines:[] };
    sessionsMap[sid].lines.push(d);
  });
  const sessions = Object.values(sessionsMap).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

  const confirmLine = async (id) => { try { await store.confirmStock2Inventory(id); } catch(e){ setMsg("❌ "+e.message); } };
  const rejectLine  = async (id) => { try { await store.rejectStock2Inventory(id); } catch(e){ setMsg("❌ "+e.message); } };

  const scopeLabel = scope==="pharmacy" ? "Pharmacie"+(activeSupplier?" — "+activeSupplier.name:"") : (store.services.find(s=>s.id===scopeServiceId)?.name||"Service");

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="inventaire-stock2" title="🗒️ Inventaire Stock 2" subtitle="Comptage physique du stock temps réel"/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {myPending.length>0&&(
          <div style={{...card,marginBottom:16,border:"2px solid #f59e0b",background:"#fffbeb"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#92400e",marginBottom:10}}>⏳ {myPending.length} ligne(s) en attente de votre confirmation</div>
            {myPending.map(d=>(
              <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div>
                  <div style={{fontWeight:600,fontSize:12}}>{d.productName}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>Calculé : {d.computedQty} → Compté : {d.countedQty} (écart {d.ecart>0?"+":""}{d.ecart})</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>confirmLine(d.id)} style={{...btn(),background:"#16a34a",color:"white",fontSize:11}}>✅ Confirmer</button>
                  <button onClick={()=>rejectLine(d.id)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Rejeter</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{marginBottom:10}}>
          <label style={label}>Périmètre</label>
          {isServiceOnly?(
            <div style={{...input,background:"#f8fafc",color:"#64748b"}}>{store.services.find(s=>s.id===myServiceId)?.name||"—"} <span style={{fontSize:10}}>(votre service)</span></div>
          ):(
            <select style={input} value={scope} onChange={e=>{setScope(e.target.value);setCounts({});}}>
              <option value="pharmacy">📦 Pharmacie</option>
              {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={"service:"+s.id}>{s.name}</option>)}
            </select>
          )}
          {scope!=="pharmacy"&&<div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Un agent de ce service devra confirmer avant que le stock ne soit mis à jour.</div>}
        </div>

        <input style={{...input,marginBottom:10}} placeholder="🔍 Rechercher un produit..." value={search} onChange={e=>setSearch(e.target.value)}/>

        {scope==="pharmacy"&&(
          <div style={{fontSize:11,color:activeSupplier?"#166534":"#92400e",marginBottom:10,background:activeSupplier?"#f0fdf4":"#fffbeb",borderRadius:8,padding:"6px 10px"}}>
            {activeSupplier ? `📦 Fournisseur sélectionné : ${activeSupplier.name}` : "⚠️ Aucun fournisseur sélectionné — tous les fournisseurs autorisés sont mélangés. Choisissez un fournisseur actif pour un inventaire précis."}
          </div>
        )}

        <button onClick={()=>setShowPrint(true)} style={{...btn(),background:"#eef2ff",color:"#4338ca",border:"1px solid #c7d2fe",fontSize:12,width:"100%",marginBottom:10}}>🖨️ Imprimer la liste à inventorier</button>

        <div style={{...card,marginBottom:12}}>
          {products.length===0&&<div style={{textAlign:"center",padding:20,color:"#94a3b8",fontSize:12}}>Aucun produit.</div>}
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
              </div>
            );
          })}
        </div>

        <button onClick={submit} disabled={saving} style={{...btn(),background:"#4338ca",color:"white",width:"100%",padding:11}}>
          {saving?"⏳ Enregistrement...":scope==="pharmacy"?"💾 Appliquer l'inventaire":"📤 Envoyer pour confirmation"}
        </button>

        {sessions.length>0&&(
          <div style={{...card,marginTop:16}}>
            <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>📋 Historique des inventaires</div>
            {sessions.map(s=>{
              const nb=s.lines.length;
              const nbConfirme=s.lines.filter(l=>l.status==="confirme").length;
              const nbAttente=s.lines.filter(l=>l.status==="attente").length;
              const nbRejete=s.lines.filter(l=>l.status==="rejete").length;
              return (
                <div key={s.sessionId} onClick={()=>setSelectedSession(s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #f8fafc",fontSize:12,cursor:"pointer"}}>
                  <div>
                    <div style={{fontWeight:600}}>{s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
                    <div style={{fontSize:10,color:"#94a3b8"}}>{s.createdByName} · {nb} produit(s)</div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {nbConfirme>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#dcfce7",color:"#166534"}}>✅ {nbConfirme}</span>}
                    {nbAttente>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#fef3c7",color:"#92400e"}}>⏳ {nbAttente}</span>}
                    {nbRejete>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#fee2e2",color:"#b91c1c"}}>✕ {nbRejete}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PrintModal open={showPrint} onClose={()=>setShowPrint(false)} title="Liste d'inventaire">
        <InventoryChecklistPrint
          products={products.map(p=>({name:p.name, computed:getComputed(p.id)}))}
          scopeLabel={scopeLabel}
          currentQtyLabel="Stock calculé"
        />
      </PrintModal>

      {/* Détail d'une session : liste de ses produits, cliquable comme pour l'inventaire Stock (1) */}
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
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:d.status==="confirme"?"#dcfce7":d.status==="rejete"?"#fee2e2":"#fef3c7",color:d.status==="confirme"?"#166534":d.status==="rejete"?"#b91c1c":"#92400e"}}>
                    {d.status==="confirme"?"✅ Confirmé":d.status==="rejete"?"✕ Rejeté":"⏳ En attente"}
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
