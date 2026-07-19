import { useState, useRef } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess, hasSupplierAccess, productAllowedForService } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner } from "../ui/ScanReviewModal";
import { getPharmacyStock2 } from "../../helpers/stock2";
import { PrintModal, TransferPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";

// NB : le contrôle/la confirmation de réception d'un transfert se fait
// désormais dans la rubrique séparée "Contrôle Transfert" (droits distincts),
// pas ici. Cette page ne gère que l'envoi (pharmacie) et l'historique.
export function TransfertsPage({store,activeSupplier,currentUser}){
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
  const [msg,setMsg]=useState("");
  const searchRef=useRef(null);
  const [printSel,setPrintSel]=useState(null);

  const suppProds=(activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId)))
    .filter(p=>productAllowedForService(p,form.serviceId,store.suppliers));
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
      if (editingId) {
        await store.updateTransfer(editingId, {...form,serviceName:selectedSvc?.name});
        setMsg("✅ Transfert modifié.");
      } else {
        await store.addTransfer({...form,supplierId:activeSupplier?.id,serviceName:selectedSvc?.name});
        setMsg("✅ Transfert envoyé — en attente de confirmation du service.");
      }
      setForm({serviceId:"",items:[],notes:""});
      setEditingId(null);
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const openEdit=(t)=>{
    setEditingId(t.id);
    setForm({serviceId:t.serviceId, items:(t.items||[]).map(it=>({productId:it.productId,productName:it.productName,qty:String(it.qty),stockDispo:getPharmacyStock2(store,it.productId)})), notes:t.notes||""});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  // Pré-remplit un nouveau transfert avec les quantités manquantes (écart
  // négatif) d'un transfert non conforme, pour que la pharmacie puisse le
  // "reprendre" facilement. Un écart positif (surplus reçu) ne nécessite pas
  // de reprise.
  const reprendre=async(t)=>{
    if(t.repris){setMsg("⚠️ Ce transfert a déjà été repris.");return;}
    try{
      await store.reprendreTransfer(t.id);
    }catch(e){setMsg("❌ "+e.message);return;}
    const items=(t.items||[]).filter(it=>it.conforme===false&&it.ecart<0).map(it=>({
      productId:it.productId, productName:it.productName, qty:String(Math.abs(it.ecart)), stockDispo:getPharmacyStock2(store,it.productId),
    }));
    setForm({serviceId:t.serviceId,items,notes:"Reprise suite écart — transfert d'origine du "+(t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"")});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const transfers=(store.transfers||[]).filter(t=>(activeSupplier?t.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,t.supplierId))&&hasServiceAccess(currentUser,t.serviceId))
    .filter(t=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = t.createdAt?.seconds ? new Date(t.createdAt.seconds*1000) : null;
        if (!d) return false;
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
      }
      if (filters.serviceId && t.serviceId!==filters.serviceId) return false;
      if (filters.createdBy && t.transferredBy!==filters.createdBy) return false;
      if (filters.status && t.status!==filters.status) return false;
      return true;
    });

  const statusBadge=(t)=>{
    if(t.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    if(t.status==="confirme") return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Conforme</span>;
    if(t.status==="non_conforme") return <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⚠️ Non conforme</span>;
    return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="transferts" title="🔄 Transferts" subtitle={"Pharmacie → Services · "+(activeSupplier?.name||"")}>
        {can(currentUser,"transferts","w")&&<button onClick={()=>{setEditingId(null);setForm({serviceId:"",items:[],notes:""});setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":msg.startsWith("⚠️")?"warn":"warn"}>{msg}</Alert>}

        {/* Modal nouveau transfert */}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #22c55e"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#166534"}}>🔄 {editingId?"Modifier le Transfert":"Nouveau Transfert"}</div>
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
              {form.serviceId&&<div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Seuls les produits des fournisseurs autorisés pour ce service sont proposés.</div>}
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
              <button onClick={()=>{setShow(false);setEditingId(null);setForm({serviceId:"",items:[],notes:""});}} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        {/* Historique */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#16a34a":"#f0fdf4",color:hasActiveFilters?"white":"#16a34a",fontSize:12}}>
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
            <div style={{marginBottom:8}}><label style={label}>Service destinataire</label>
              <select style={input} value={filters.serviceId} onChange={e=>setFilters(f=>({...f,serviceId:e.target.value}))}>
                <option value="">— Tous —</option>
                {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
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

        {transfers.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun transfert ne correspond à ce filtre.":"Aucun transfert."}</div>}
        {transfers.map(t=>(
          <div key={t.id} onClick={()=>setPrintSel(t)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(79,70,229,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour voir le détail complet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>🔄 → {t.serviceName||"—"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{t.transferredByName} · {t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {statusBadge(t)}
                <span style={{background:"#eef2ff",color:"#4f46e5",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(t.items||[]).length} produit(s)</span>
              </div>
            </div>
            {t.repris&&<div style={{fontSize:11,color:"#059669",marginTop:6,fontWeight:600}}>✅ Repris — manquant réconcilié avec le stock pharmacie ({t.reprisAt?.seconds?new Date(t.reprisAt.seconds*1000).toLocaleDateString("fr-FR"):""})</div>}
            {t.status==="non_conforme"&&!t.repris&&can(currentUser,"transferts","w")&&(t.items||[]).some(it=>it.ecart<0)&&(
              <button onClick={e=>{e.stopPropagation();reprendre(t);}} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:11,marginTop:8}}>🔁 Reprendre le transfert (manquants)</button>
            )}
            {t.status==="en_attente"&&can(currentUser,"transferts","w")&&(
              <div style={{display:"flex",gap:6,marginTop:8}}>
                {can(currentUser,"transferts","w")&&<button onClick={e=>{e.stopPropagation();openEdit(t);}} style={{...btn(),background:"#eef2ff",color:"#4f46e5",border:"1px solid #c7d2fe",fontSize:11}}>✏️ Modifier</button>}
                {can(currentUser,"transferts","w")&&<button onClick={e=>{e.stopPropagation();setCancelling(t);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:11}}>🚫 Annuler</button>}
              </div>
            )}
            {(t.status==="confirme"||t.status==="non_conforme")&&!t.repris&&<div style={{fontSize:10,color:"#94a3b8",marginTop:6,fontStyle:"italic"}}>Déjà reçu par le service — non modifiable tant qu'il n'a pas annulé sa réception.</div>}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Transfert">
        <TransferPrint t={printSel}/>
      </PrintModal>
      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce transfert ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Ce transfert vers <b>{cancelling.serviceName}</b> sera marqué "annulé" (jamais supprimé) et les quantités reviendront au stock pharmacie.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await store.cancelTransfer(cancelling.id); setCancelling(null); }
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
