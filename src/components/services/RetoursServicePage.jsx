import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess, productAllowedForService } from "../../permissions";
import { PrintModal, SvcReturnPrint } from "../print/PrintTemplates";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { Modal } from "../ui/Modal";
import { BarcodeScanner } from "../ui/ScanReviewModal";
import { getServiceStock2 } from "../../helpers/stock2";

export function RetoursServicePage({store,currentUser}){
  const [show,setShow]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [cancelling,setCancelling]=useState(null);
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",serviceId:"",createdBy:"",status:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const [form,setForm]=useState({serviceId:"",items:[],notes:""});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [showScanner,setShowScanner]=useState(false);
  const [saving,setSaving]=useState(false);
  const [printSel,setPrintSel]=useState(null);
  const [msg,setMsg]=useState("");

  const userServiceId=currentUser?.serviceId||"";
  const isServiceAgent=currentUser?.role==="agent_service"||currentUser?.role==="admin_service";

  // Calculé directement via Stock(2) (formule réceptions/transferts/consommations/
  // retours), pas via le compteur dénormalisé svcStock — évite toute divergence
  // entre ce qui est affiché ici et ce que montre Stock Service/Statistiques.
  const svcProds=form.serviceId
    ?store.products
      .filter(p=>productAllowedForService(p,form.serviceId,store.suppliers))
      .map(p=>({...p, svcQty:getServiceStock2(store,p.id,form.serviceId)}))
      .filter(p=>p.svcQty>0)
    :[];
  const filtered=search.trim()?svcProds.filter(p=>p.name?.toLowerCase().includes(search.toLowerCase())):svcProds;

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:"1",svcQty:prod.svcQty}]};
    });
    setSearch(""); setShowResults(false);
  };

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      const svc=store.services?.find(s=>s.id===form.serviceId);
      if (editingId) {
        await store.updateSvcReturn(editingId, {...form,serviceName:svc?.name||""});
        setMsg("✅ Retour modifié.");
      } else {
        await store.addSvcReturn({...form,serviceName:svc?.name||""});
        setMsg("✅ Retour enregistré — stock pharmacie mis à jour !");
      }
      setForm({serviceId:isServiceAgent?userServiceId:"",items:[],notes:""});
      setEditingId(null);
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const openEdit=(r)=>{
    setEditingId(r.id);
    setForm({serviceId:r.serviceId, items:(r.items||[]).map(it=>({productId:it.productId,productName:it.productName,qty:String(it.qty),svcQty:store.svcStock?.[r.serviceId+"_"+it.productId]||0})), notes:r.notes||""});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const returns=(store.svcReturns||[]).filter(r=>(!isServiceAgent||!userServiceId||r.serviceId===userServiceId)&&hasServiceAccess(currentUser,r.serviceId))
    .filter(r=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000) : null;
        if (!d) return false;
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
      }
      if (filters.serviceId && r.serviceId!==filters.serviceId) return false;
      if (filters.createdBy && r.returnedBy!==filters.createdBy) return false;
      if (filters.status && r.status!==filters.status) return false;
      return true;
    });

  // Pré-remplit un nouveau retour avec les quantités manquantes (écart négatif)
  // d'un retour non conforme, pour que le service puisse le "reprendre" facilement.
  const reprendre=async(r)=>{
    if(r.repris){setMsg("⚠️ Ce retour a déjà été repris.");return;}
    try{
      await store.reprendreSvcReturn(r.id);
    }catch(e){setMsg("❌ "+e.message);return;}
    const items=(r.items||[]).filter(it=>it.conforme===false&&it.ecart<0).map(it=>({
      productId:it.productId, productName:it.productName, qty:String(Math.abs(it.ecart)), svcQty:store.svcStock?.[r.serviceId+"_"+it.productId]||0,
    }));
    setForm({serviceId:r.serviceId,items,notes:"Reprise suite écart — retour d'origine du "+(r.createdAt?.seconds?new Date(r.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"")});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const statusBadge=(r)=>{
    if(r.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    if(r.status==="confirme") return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Conforme</span>;
    if(r.status==="non_conforme") return <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⚠️ Non conforme</span>;
    return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="retours-service" title="↩️ Retours Service" subtitle="Service → Pharmacie">
        {can(currentUser,"retours-service","w")&&<button onClick={()=>{setEditingId(null);setForm({serviceId:isServiceAgent?userServiceId:"",items:[],notes:""});setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau retour</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #d97706"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#92400e"}}>↩️ {editingId?"Modifier le retour":"Retour vers la pharmacie"}</div>
            {!isServiceAgent&&(
              <div style={{marginBottom:10}}>
                <label style={label}>Service</label>
                <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value,items:[]}))}>
                  <option value="">— Choisir —</option>
                  {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {form.serviceId&&(
              <div style={{position:"relative",marginBottom:10}}>
                <label style={label}>Produit à retourner</label>
                <div style={{display:"flex",gap:6}}>
                  <div style={{position:"relative",flex:1}}>
                    <input style={{...input,paddingLeft:32}} placeholder="Rechercher dans stock service..."
                      value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                      onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                  </div>
                  <button onClick={()=>setShowScanner(true)} title="Scanner un code barre"
                    style={{...btn(),background:"#d97706",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>📷</button>
                </div>
                {showScanner&&(
                  <BarcodeScanner
                    onDetected={code=>{
                      setShowScanner(false);
                      const found=svcProds.find(p=>
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
                  <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:160,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                    {filtered.map(p=>(
                      <div key={p.id} onMouseDown={()=>addItem(p)} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                        <div style={{fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#d97706",fontWeight:700}}>Stock service : {p.svcQty}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#fffbeb",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{it.productName}</div>
                <div style={{fontSize:11,color:"#d97706"}}>Stock:{it.svcQty}</div>
                <input type="number" min="1" max={it.svcQty} value={it.qty}
                  onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                  style={{width:60,padding:"4px 6px",border:"1px solid #fcd34d",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                  style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Notes</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving}
                style={{...btn(),background:"#d97706",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Traitement...":"✅ Valider le retour"}
              </button>
              <button onClick={()=>{setShow(false);setEditingId(null);setForm({serviceId:isServiceAgent?userServiceId:"",items:[],notes:""});}} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#d97706":"#fffbeb",color:hasActiveFilters?"white":"#d97706",fontSize:12}}>
            🔍 Recherche{hasActiveFilters?" (active)":""}
          </button>
          {hasActiveFilters&&<button onClick={()=>setFilters({dateFrom:"",dateTo:"",serviceId:"",createdBy:"",status:""})} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Réinitialiser</button>}
        </div>
        {showFilters&&(
          <div style={{...card,marginBottom:12,padding:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Du</label><input type="date" style={input} value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></div>
              <div><label style={label}>Au</label><input type="date" style={input} value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></div>
            </div>
            {!isServiceAgent&&<div style={{marginBottom:8}}><label style={label}>Service</label>
              <select style={input} value={filters.serviceId} onChange={e=>setFilters(f=>({...f,serviceId:e.target.value}))}>
                <option value="">— Tous —</option>
                {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>}
            <div style={{marginBottom:8}}><label style={label}>Créé par</label>
              <select style={input} value={filters.createdBy} onChange={e=>setFilters(f=>({...f,createdBy:e.target.value}))}>
                <option value="">— Tous —</option>
                {(store.users||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={label}>Statut</label>
              <select style={input} value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}>
                <option value="">— Tous —</option>
                <option value="en_attente">⏳ En attente</option>
                <option value="confirme">✅ Conforme</option>
                <option value="non_conforme">⚠️ Non conforme</option>
                <option value="annule">🚫 Annulé</option>
              </select>
            </div>
          </div>
        )}

        {returns.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun retour ne correspond à ce filtre.":"Aucun retour enregistré."}</div>}
        {returns.map(r=>(
          <div key={r.id} onClick={()=>setPrintSel(r)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(217,119,6,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour voir le détail complet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>↩️ {r.serviceName||"—"} → Pharmacie</div>
                <div style={{fontSize:11,color:"#64748b"}}>{r.returnedByName} · {r.createdAt?.seconds?new Date(r.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {statusBadge(r)}
                <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(r.items||[]).length} produit(s)</span>
              </div>
            </div>
            {r.repris&&<div style={{fontSize:11,color:"#059669",marginTop:6,fontWeight:600}}>✅ Repris — manquant recrédité au stock service ({r.reprisAt?.seconds?new Date(r.reprisAt.seconds*1000).toLocaleDateString("fr-FR"):""})</div>}
            {r.status==="non_conforme"&&!r.repris&&can(currentUser,"retours-service","w")&&(r.items||[]).some(it=>it.ecart<0)&&(
              <button onClick={e=>{e.stopPropagation();reprendre(r);}} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:11,marginTop:8}}>🔁 Reprendre le retour (manquants)</button>
            )}
            {r.status==="en_attente"&&can(currentUser,"retours-service","w")&&(
              <div style={{display:"flex",gap:6,marginTop:8}}>
                {can(currentUser,"retours-service","w")&&<button onClick={e=>{e.stopPropagation();openEdit(r);}} style={{...btn(),background:"#fffbeb",color:"#92400e",border:"1px solid #fcd34d",fontSize:11}}>✏️ Modifier</button>}
                {can(currentUser,"retours-service","w")&&<button onClick={e=>{e.stopPropagation();setCancelling(r);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:11}}>🚫 Annuler</button>}
              </div>
            )}
            {(r.status==="confirme"||r.status==="non_conforme")&&!r.repris&&<div style={{fontSize:10,color:"#94a3b8",marginTop:6,fontStyle:"italic"}}>Déjà contrôlé par la pharmacie — non modifiable tant qu'elle n'a pas annulé son contrôle.</div>}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Retour Service">
        <SvcReturnPrint r={printSel}/>
      </PrintModal>
      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce retour ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Ce retour de <b>{cancelling.serviceName}</b> sera marqué "annulé" (jamais supprimé) et les quantités reviendront au stock du service.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await store.cancelSvcReturn(cancelling.id); setCancelling(null); }
                catch(e){ setMsg("❌ "+e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
