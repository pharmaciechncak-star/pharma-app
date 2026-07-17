import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess, hasSupplierAccess } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { PrintModal, TransferPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";

// Rubrique dédiée au CONTRÔLE de réception des transferts, réservée à l'agent
// du service destinataire (droits "controle-transfert", distincts de
// "transferts" qui reste réservé à l'agent pharmacie — voir constants.js).
// L'agent pharmacie envoie (page Transferts), l'agent service contrôle ici :
// pour chaque produit, il saisit un écart (négatif si manquant, positif si
// surplus, 0 si conforme). S'il y a au moins un écart, le transfert passe
// "non conforme" et la pharmacie est alertée (bouton "Reprendre" côté Transferts).
export function ControleTransfertPage({store,activeSupplier,currentUser}){
  const [confirmOpen,setConfirmOpen]=useState(null); // id du transfert en cours de contrôle
  const [confirmLines,setConfirmLines]=useState({}); // productId -> ecart
  const [confirmSaving,setConfirmSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [printSel,setPrintSel]=useState(null);
  const [cancellingControl,setCancellingControl]=useState(null);

  const userServiceId=currentUser?.serviceId||"";
  const isServiceAgent=currentUser?.role==="agent_service"||currentUser?.role==="admin_service";

  const transfers=(store.transfers||[]).filter(t=>
    (activeSupplier?t.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,t.supplierId))
    && hasServiceAccess(currentUser,t.serviceId)
    && (!isServiceAgent||!userServiceId||t.serviceId===userServiceId)
  );
  const pending=transfers.filter(t=>t.status==="en_attente");
  const done=transfers.filter(t=>t.status!=="en_attente");

  const openConfirm=(t)=>{
    setConfirmOpen(t.id);
    const init={};
    (t.items||[]).forEach(it=>{ init[it.productId]=0; });
    setConfirmLines(init);
  };

  const hasEcart = t => Object.values(confirmLines).some(e=>Number(e)!==0);

  const submitConfirm=async(t)=>{
    setConfirmSaving(true);
    try{
      const lineResults=(t.items||[]).map(it=>({
        productId:it.productId,
        ecart:Number(confirmLines[it.productId])||0,
      }));
      const {allConforme}=await store.confirmTransfer(t.id,lineResults);
      setMsg(allConforme?"✅ Réception confirmée conforme.":"⚠️ Transfert non conforme signalé — la pharmacie a été notifiée.");
      setConfirmOpen(null);
      setTimeout(()=>setMsg(""),5000);
    }catch(e){setMsg("❌ "+e.message);}
    setConfirmSaving(false);
  };

  const statusBadge=(t)=>{
    if(t.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    if(t.status==="confirme") return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Conforme</span>;
    if(t.status==="non_conforme") return <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⚠️ Non conforme</span>;
    return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="controle-transfert" title="🔍 Contrôle Transfert" subtitle={"Réception & vérification · "+(activeSupplier?.name||"")}/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {/* Transferts en attente de contrôle */}
        <div style={{fontWeight:700,fontSize:13,color:"#312e81",marginBottom:10}}>⏳ {pending.length} transfert(s) en attente de contrôle</div>
        {pending.length===0&&<div style={{...card,textAlign:"center",padding:30,color:"#94a3b8",marginBottom:14}}>Aucun transfert en attente.</div>}
        {pending.map(t=>(
          <div key={t.id} style={{...card,marginBottom:8,border:"2px solid #fbbf24",background:"#fffbeb"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>🔄 → {t.serviceName||"—"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{t.transferredByName} · {t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              {statusBadge(t)}
            </div>
            {confirmOpen!==t.id?(
              can(currentUser,"controle-transfert","w")
                ? <button onClick={()=>openConfirm(t)} style={{...btn(),background:"#4f46e5",color:"white",fontSize:12,width:"100%"}}>📋 Contrôler la réception</button>
                : <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:6}}>Lecture seule — vous n'avez pas le droit de contrôler ce transfert.</div>
            ):(
              <div>
                {(t.items||[]).map((it,i)=>{
                  const ecart=Number(confirmLines[it.productId])||0;
                  return(
                    <div key={i} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>{it.productName} <span style={{color:"#94a3b8",fontWeight:400}}>({it.qty} envoyé(s))</span></div>
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
                  <button onClick={()=>submitConfirm(t)} disabled={confirmSaving}
                    style={{...btn(),background:hasEcart(t)?"#dc2626":"#16a34a",color:"white",flex:1,fontSize:12}}>
                    {confirmSaving?"⏳ Envoi...":hasEcart(t)?"⚠️ Transfert non conforme":"✅ Valider — Conforme"}
                  </button>
                  <button onClick={()=>setConfirmOpen(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",fontSize:12}}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Historique des contrôles déjà effectués */}
        {done.length>0&&<div style={{fontWeight:700,fontSize:13,color:"#312e81",margin:"18px 0 10px"}}>📋 Historique des contrôles</div>}
        {done.map(t=>(
          <div key={t.id} onClick={()=>setPrintSel(t)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(79,70,229,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour voir le détail complet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>🔄 → {t.serviceName||"—"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Contrôlé par {t.confirmedByName||"—"} · {t.confirmedAt?.seconds?new Date(t.confirmedAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {statusBadge(t)}
                <span style={{background:"#eef2ff",color:"#4f46e5",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(t.items||[]).length} produit(s)</span>
              </div>
            </div>
            {t.repris&&<div style={{fontSize:11,color:"#059669",marginTop:6,fontWeight:600}}>✅ Repris par la pharmacie</div>}
            {(t.status==="confirme"||t.status==="non_conforme")&&!t.repris&&can(currentUser,"controle-transfert","w")&&(
              <button onClick={e=>{e.stopPropagation();setCancellingControl(t);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:11,marginTop:8}}>🚫 Annuler le contrôle</button>
            )}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Transfert">
        <TransferPrint t={printSel}/>
      </PrintModal>
      <Modal open={!!cancellingControl} onClose={()=>setCancellingControl(null)} title="🚫 Annuler ce contrôle ?">
        {cancellingControl&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Le contrôle de ce transfert (vers <b>{cancellingControl.serviceName}</b>) sera annulé : la quantité créditée au stock du service sera retirée, et le transfert redevient modifiable côté pharmacie.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await store.cancelTransferConfirmation(cancellingControl.id); setCancellingControl(null); }
                catch(e){ setMsg("❌ "+e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer</button>
              <button onClick={()=>setCancellingControl(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
