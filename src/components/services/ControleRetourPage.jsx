import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { PrintModal, SvcReturnPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";

// Rubrique dédiée au CONTRÔLE de réception des retours service, réservée à
// la pharmacie (droits "controle-retour", distincts de "retours-service" qui
// reste réservé au service émetteur — voir constants.js). Le service envoie
// le retour (page Retours Service), la pharmacie contrôle ici : pour chaque
// produit, elle saisit un écart (négatif si manquant, positif si surplus,
// 0 si conforme). S'il y a au moins un écart, le retour passe "non conforme"
// et le service est alerté (bouton "Reprendre" côté Retours Service).
export function ControleRetourPage({store,activeSupplier,currentUser}){
  const [confirmOpen,setConfirmOpen]=useState(null);
  const [confirmLines,setConfirmLines]=useState({});
  const [confirmSaving,setConfirmSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [printSel,setPrintSel]=useState(null);
  const [cancellingControl,setCancellingControl]=useState(null);
  const [editingExpiry,setEditingExpiry]=useState(null);
  const [expiryDrafts,setExpiryDrafts]=useState({});

  // NB : un retour service n'est pas rattaché à un fournisseur (ce n'est pas
  // une transaction fournisseur), donc pas de filtre par activeSupplier ici —
  // seul le périmètre service s'applique (même logique que RetoursServicePage).
  const returns=(store.svcReturns||[]).filter(r=>hasServiceAccess(currentUser,r.serviceId));
  const pending=returns.filter(r=>r.status==="en_attente");
  const done=returns.filter(r=>r.status!=="en_attente");

  const openConfirm=(r)=>{
    setConfirmOpen(r.id);
    const init={};
    (r.items||[]).forEach(it=>{ init[it.productId]=0; });
    setConfirmLines(init);
  };

  const hasEcart = () => Object.values(confirmLines).some(e=>Number(e)!==0);

  const submitConfirm=async(r)=>{
    setConfirmSaving(true);
    try{
      const lineResults=(r.items||[]).map(it=>({
        productId:it.productId,
        ecart:Number(confirmLines[it.productId])||0,
      }));
      const {allConforme}=await store.confirmSvcReturn(r.id,lineResults);
      setMsg(allConforme?"✅ Réception du retour confirmée conforme.":"⚠️ Retour non conforme signalé — le service a été notifié.");
      setConfirmOpen(null);
      setTimeout(()=>setMsg(""),5000);
    }catch(e){setMsg("❌ "+e.message);}
    setConfirmSaving(false);
  };

  const statusBadge=(r)=>{
    if(r.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    if(r.status==="confirme") return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Conforme</span>;
    if(r.status==="non_conforme") return <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⚠️ Non conforme</span>;
    return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="controle-retour" title="🔍 Contrôle Retour" subtitle={"Réception & vérification · "+(activeSupplier?.name||"")}/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{fontWeight:700,fontSize:13,color:"#134e4a",marginBottom:10}}>⏳ {pending.length} retour(s) en attente de contrôle</div>
        {pending.length===0&&<div style={{...card,textAlign:"center",padding:30,color:"#94a3b8",marginBottom:14}}>Aucun retour en attente.</div>}
        {pending.map(r=>(
          <div key={r.id} style={{...card,marginBottom:8,border:"2px solid #5eead4",background:"#f0fdfa"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>↩️ {r.serviceName||"—"} → Pharmacie</div>
                <div style={{fontSize:11,color:"#64748b"}}>{r.returnedByName} · {r.createdAt?.seconds?new Date(r.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              {statusBadge(r)}
            </div>
            {(r.items||[]).some(it=>it.expiry)&&(
              <button onClick={()=>{setEditingExpiry(r);setExpiryDrafts(Object.fromEntries((r.items||[]).map(it=>[it.productId,it.expiry||""])));}}
                style={{...btn(),background:"white",color:"#64748b",border:"1px solid #e2e8f0",fontSize:10,marginBottom:8,padding:"3px 8px"}}>
                📅 Vérifier/corriger les dates de péremption ✏️
              </button>
            )}
            {confirmOpen!==r.id?(
              can(currentUser,"controle-retour","w")
                ? <button onClick={()=>openConfirm(r)} style={{...btn(),background:"#0f766e",color:"white",fontSize:12,width:"100%"}}>📋 Contrôler la réception</button>
                : <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:6}}>Lecture seule — vous n'avez pas le droit de contrôler ce retour.</div>
            ):(
              <div>
                {(r.items||[]).map((it,i)=>{
                  const ecart=Number(confirmLines[it.productId])||0;
                  return(
                    <div key={i} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>{it.productName} <span style={{color:"#94a3b8",fontWeight:400}}>({it.qty} annoncé(s))</span></div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <label style={{fontSize:11,color:"#64748b"}}>Écart <span style={{color:"#94a3b8"}}>(négatif=manquant, positif=surplus, 0=conforme)</span> :</label>
                        <input type="number" value={confirmLines[it.productId]||0}
                          onChange={e=>setConfirmLines(cl=>({...cl,[it.productId]:e.target.value}))}
                          style={{width:70,padding:"3px 6px",border:"1px solid "+(ecart<0?"#fca5a5":ecart>0?"#7dd3fc":"#cbd5e1"),borderRadius:6,fontSize:12,textAlign:"center",fontWeight:ecart!==0?700:400,color:ecart<0?"#b91c1c":ecart>0?"#0e7490":"inherit"}}/>
                        <span style={{fontSize:11,color:"#64748b"}}>→ reçu : <b>{Math.max(0,Number(it.qty)+ecart)}</b></span>
                      </div>
                    </div>
                  );
                })}
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={()=>submitConfirm(r)} disabled={confirmSaving}
                    style={{...btn(),background:hasEcart()?"#dc2626":"#16a34a",color:"white",flex:1,fontSize:12}}>
                    {confirmSaving?"⏳ Envoi...":hasEcart()?"⚠️ Retour non conforme":"✅ Valider — Conforme"}
                  </button>
                  <button onClick={()=>setConfirmOpen(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",fontSize:12}}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {done.length>0&&<div style={{fontWeight:700,fontSize:13,color:"#134e4a",margin:"18px 0 10px"}}>📋 Historique des contrôles</div>}
        {done.map(r=>(
          <div key={r.id} onClick={()=>setPrintSel(r)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(15,118,110,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour voir le détail complet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>↩️ {r.serviceName||"—"} → Pharmacie</div>
                <div style={{fontSize:11,color:"#64748b"}}>Contrôlé par {r.confirmedByName||"—"} · {r.confirmedAt?.seconds?new Date(r.confirmedAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {statusBadge(r)}
                <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(r.items||[]).length} produit(s)</span>
              </div>
            </div>
            {r.repris&&<div style={{fontSize:11,color:"#059669",marginTop:6,fontWeight:600}}>✅ Repris par le service</div>}
            {(r.items||[]).some(it=>it.expiry)&&can(currentUser,"controle-retour","w")&&(
              <button onClick={e=>{e.stopPropagation();setEditingExpiry(r);setExpiryDrafts(Object.fromEntries((r.items||[]).map(it=>[it.productId,it.expiry||""])));}}
                style={{...btn(),background:"#f8fafc",color:"#64748b",border:"1px solid #e2e8f0",fontSize:10,marginTop:6,padding:"3px 8px"}}>
                📅 Corriger les dates de péremption ✏️
              </button>
            )}
            {(r.status==="confirme"||r.status==="non_conforme")&&!r.repris&&can(currentUser,"controle-retour","w")&&(
              <button onClick={e=>{e.stopPropagation();setCancellingControl(r);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:11,marginTop:8}}>🚫 Annuler le contrôle</button>
            )}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Retour Service">
        <SvcReturnPrint r={printSel}/>
      </PrintModal>
      <Modal open={!!cancellingControl} onClose={()=>setCancellingControl(null)} title="🚫 Annuler ce contrôle ?">
        {cancellingControl&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Le contrôle de ce retour (de <b>{cancellingControl.serviceName}</b>) sera annulé : le crédit donné au stock pharmacie sera retiré, et le retour redevient modifiable côté service.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await store.cancelSvcReturnConfirmation(cancellingControl.id); setCancellingControl(null); }
                catch(e){ setMsg("❌ "+e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer</button>
              <button onClick={()=>setCancellingControl(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!editingExpiry} onClose={()=>setEditingExpiry(null)} title="📅 Dates de péremption">
        {editingExpiry&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Corrigez la date si elle ne correspond pas à ce qui est physiquement reçu.</div>
            {(editingExpiry.items||[]).map(it=>(
              <div key={it.productId} style={{marginBottom:10}}>
                <label style={label}>{it.productName}{it.lot?" — lot "+it.lot:""}</label>
                <input type="date" style={input} value={expiryDrafts[it.productId]||""} onChange={e=>setExpiryDrafts(d=>({...d,[it.productId]:e.target.value}))}/>
              </div>
            ))}
            <button onClick={async()=>{
              for(const [pid,val] of Object.entries(expiryDrafts)){
                const orig=(editingExpiry.items||[]).find(it=>it.productId===pid)?.expiry||"";
                if(val!==orig) await store.updateSvcReturnItemExpiry(editingExpiry.id,pid,val);
              }
              setEditingExpiry(null);
            }} style={{...btn(),background:"#0f766e",color:"white",width:"100%",padding:10,marginTop:4}}>💾 Enregistrer</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
