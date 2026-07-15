import { useState, useRef } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess, hasSupplierAccess } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner } from "../ui/ScanReviewModal";
import { getPharmacyStock2 } from "../../helpers/stock2";

export function TransfertsPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [form,setForm]=useState({serviceId:"",items:[],notes:""});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [showScanner,setShowScanner]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const searchRef=useRef(null);

  // Confirmation de réception (côté service)
  const [confirmOpen,setConfirmOpen]=useState(null); // id du transfert en cours de contrôle
  const [confirmLines,setConfirmLines]=useState({}); // productId -> {conforme, ecart}
  const [confirmSaving,setConfirmSaving]=useState(false);

  const userServiceId=currentUser?.serviceId||"";
  const isServiceAgent=currentUser?.role==="agent_service"||currentUser?.role==="admin_service";

  const suppProds=activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId));
  const filtered=search.trim()?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())):suppProds;
  const selectedSvc=store.services?.find(s=>s.id===form.serviceId);

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:"1",stockDispo:getPharmacyStock2(store,prod.id)}]};
    });
    setSearch(""); setShowResults(false);
  };
  const removeItem=i=>setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      await store.addTransfer({...form,supplierId:activeSupplier?.id,serviceName:selectedSvc?.name});
      setMsg("✅ Transfert envoyé — en attente de confirmation du service.");
      setForm({serviceId:"",items:[],notes:""});
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  // Pré-remplit un nouveau transfert avec les quantités en écart d'un transfert
  // non conforme, pour que la pharmacie puisse le "reprendre" facilement.
  const reprendre=(t)=>{
    const items=(t.items||[]).filter(it=>it.conforme===false&&it.ecart>0).map(it=>({
      productId:it.productId, productName:it.productName, qty:String(it.ecart), stockDispo:getPharmacyStock2(store,it.productId),
    }));
    setForm({serviceId:t.serviceId,items,notes:"Reprise suite écart — transfert d'origine du "+(t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"")});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const openConfirm=(t)=>{
    setConfirmOpen(t.id);
    const init={};
    (t.items||[]).forEach(it=>{ init[it.productId]={conforme:true,ecart:0}; });
    setConfirmLines(init);
  };
  const submitConfirm=async(t)=>{
    setConfirmSaving(true);
    try{
      const lineResults=(t.items||[]).map(it=>({
        productId:it.productId,
        conforme:confirmLines[it.productId]?.conforme!==false,
        ecart:Number(confirmLines[it.productId]?.ecart)||0,
      }));
      const {allConforme}=await store.confirmTransfer(t.id,lineResults);
      setMsg(allConforme?"✅ Réception confirmée conforme.":"⚠️ Réception enregistrée avec écart(s) — la pharmacie a été notifiée.");
      setConfirmOpen(null);
      setTimeout(()=>setMsg(""),5000);
    }catch(e){setMsg("❌ "+e.message);}
    setConfirmSaving(false);
  };

  const transfers=(store.transfers||[]).filter(t=>(activeSupplier?t.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,t.supplierId))&&hasServiceAccess(currentUser,t.serviceId));
  const pendingForMe=transfers.filter(t=>t.status==="en_attente"&&(!isServiceAgent||!userServiceId||t.serviceId===userServiceId));

  const statusBadge=(t)=>{
    if(t.status==="confirme") return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Conforme</span>;
    if(t.status==="non_conforme") return <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⚠️ Non conforme</span>;
    return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="transferts" title="🔄 Transferts" subtitle={"Pharmacie → Services · "+(activeSupplier?.name||"")}>
        {can(currentUser,"transferts","w")&&<button onClick={()=>setShow(true)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":msg.startsWith("⚠️")?"warn":"warn"}>{msg}</Alert>}

        {/* Modal nouveau transfert */}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #22c55e"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#166534"}}>🔄 Nouveau Transfert</div>
            <div style={{marginBottom:10}}>
              <label style={label}>Service destinataire</label>
              <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value}))}>
                <option value="">— Choisir un service —</option>
                {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {/* Recherche produit + scan */}
            <div style={{position:"relative",marginBottom:10}}>
              <label style={label}>Ajouter un produit</label>
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Rechercher ou scanner..." value={search}
                    onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                    onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                </div>
                <button onClick={()=>setShowScanner(true)} title="Scanner un code barre"
                  style={{...btn(),background:"#16a34a",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>📷</button>
              </div>
              {showScanner&&(
                <BarcodeScanner
                  onDetected={code=>{
                    setShowScanner(false);
                    const found=suppProds.find(p=>
                      [p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code)||
                      p.name?.toLowerCase().includes(code.toLowerCase())
                    );
                    if(found) addItem(found);
                    else { setSearch(code); setShowResults(true); }
                  }}
                  onClose={()=>setShowScanner(false)}
                />
              )}
              {showResults&&filtered.length>0&&(
                <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                  {filtered.slice(0,15).map(p=>(
                    <div key={p.id} onMouseDown={()=>addItem(p)}
                      style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                      <div style={{fontWeight:600}}>{p.name}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>Stock dispo : {getPharmacyStock2(store,p.id)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Liste produits sélectionnés */}
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{it.productName}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Dispo:{it.stockDispo}</div>
                <input type="number" min="1" max={it.stockDispo} value={it.qty}
                  onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                  style={{width:60,padding:"4px 6px",border:"1px solid #86efac",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>removeItem(i)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Notes</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving||!form.serviceId||form.items.length===0}
                style={{...btn(),background:"#16a34a",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Envoi...":"✅ Valider le transfert"}
              </button>
              <button onClick={()=>setShow(false)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        {/* Transferts en attente de confirmation */}
        {pendingForMe.length>0&&(
          <div style={{...card,marginBottom:14,border:"2px solid #fbbf24",background:"#fffbeb"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#92400e",marginBottom:10}}>⏳ {pendingForMe.length} transfert(s) en attente de confirmation</div>
            {pendingForMe.map(t=>(
              <div key={t.id} style={{...card,marginBottom:8,background:"white"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>🔄 → {t.serviceName||"—"}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{t.transferredByName} · {t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
                  </div>
                  {statusBadge(t)}
                </div>
                {confirmOpen!==t.id?(
                  <button onClick={()=>openConfirm(t)} style={{...btn(),background:"#4f46e5",color:"white",fontSize:12,width:"100%"}}>📋 Contrôler la réception</button>
                ):(
                  <div>
                    {(t.items||[]).map((it,i)=>{
                      const line=confirmLines[it.productId]||{conforme:true,ecart:0};
                      return(
                        <div key={i} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:line.conforme?0:6}}>
                            <div style={{fontSize:12,fontWeight:600}}>{it.productName} <span style={{color:"#94a3b8",fontWeight:400}}>({it.qty} envoyé(s))</span></div>
                            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,cursor:"pointer"}}>
                              <input type="checkbox" checked={line.conforme}
                                onChange={e=>setConfirmLines(cl=>({...cl,[it.productId]:{...line,conforme:e.target.checked,ecart:e.target.checked?0:line.ecart}}))}/>
                              Conforme
                            </label>
                          </div>
                          {!line.conforme&&(
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <label style={{fontSize:11,color:"#b91c1c"}}>Écart (manquant/endommagé) :</label>
                              <input type="number" min="0" max={it.qty} value={line.ecart}
                                onChange={e=>setConfirmLines(cl=>({...cl,[it.productId]:{...line,ecart:e.target.value}}))}
                                style={{width:60,padding:"3px 6px",border:"1px solid #fca5a5",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{display:"flex",gap:8,marginTop:8}}>
                      <button onClick={()=>submitConfirm(t)} disabled={confirmSaving}
                        style={{...btn(),background:"#16a34a",color:"white",flex:1,fontSize:12}}>
                        {confirmSaving?"⏳ Envoi...":"✅ Valider la réception"}
                      </button>
                      <button onClick={()=>setConfirmOpen(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",fontSize:12}}>Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Historique */}
        {transfers.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun transfert.</div>}
        {transfers.map(t=>(
          <div key={t.id} style={{...card,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>🔄 → {t.serviceName||"—"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{t.transferredByName} · {t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              {statusBadge(t)}
            </div>
            {(t.items||[]).map((it,i)=>(
              <div key={i} style={{fontSize:11,color:"#64748b",paddingLeft:8}}>
                • {it.productName} — {it.qty} unité(s)
                {it.conforme===false&&<span style={{color:"#b91c1c",fontWeight:600}}> — écart de {it.ecart} signalé (reçu {it.qtyConfirmed})</span>}
              </div>
            ))}
            {t.notes&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>{t.notes}</div>}
            {t.status==="non_conforme"&&can(currentUser,"transferts","w")&&(
              <button onClick={()=>reprendre(t)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:11,marginTop:8}}>🔁 Reprendre le transfert (écarts)</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
