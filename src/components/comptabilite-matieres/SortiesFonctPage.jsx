import { useState, useRef } from "react";
import { genId } from "../../constants";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess, hasSupplierAccess, productAllowedForService, productVisibleInCircuit } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner, ScanReviewModal } from "../ui/ScanReviewModal";
import { getFonctPharmacyStock2 } from "../../helpers/stock2";
import { PrintModal, SortieFonctPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";
import { scanDocumentWithAI } from "../../hooks/useAI";

// Bon de sortie — circuit fonctionnement (Comptabilité Matières). Envoi
// DIRECT vers le service, sans étape de contrôle/confirmation (convenu
// explicitement) — à la différence des Transferts du circuit vente.
export function SortiesFonctPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [cancelling,setCancelling]=useState(null);
  const [editingExpiry,setEditingExpiry]=useState(null);
  const [expiryDrafts,setExpiryDrafts]=useState({});
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",serviceId:"",createdBy:"",status:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const [form,setForm]=useState({reference:"BON-SORT-FONCT-"+genId(),serviceId:"",items:[],notes:""});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [showScanner,setShowScanner]=useState(false);
  const [barcodeChoices,setBarcodeChoices]=useState(null);
  const [saving,setSaving]=useState(false);
  const [scanResult,setScanResult]=useState(null);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [scanMsg,setScanMsg]=useState("");
  const [msg,setMsg]=useState("");
  const searchRef=useRef(null);
  const [printSel,setPrintSel]=useState(null);

  const suppProds=(activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId)))
    .filter(p=>productVisibleInCircuit(p,"fonctionnement",store.suppliers))
    .filter(p=>productAllowedForService(p,form.serviceId,store.suppliers));
  const filtered=search.trim()?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())):suppProds;
  const selectedSvc=store.services?.find(s=>s.id===form.serviceId);

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      const dispo=getFonctPharmacyStock2(store,prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Math.min(Number(it.qty)+1,dispo))}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:String(Math.min(1,dispo)),stockDispo:dispo}]};
    });
    setSearch(""); setShowResults(false);
  };

  // Lecteur de code-barre physique (USB/Bluetooth) : même logique que Transferts.
  const handleSearchKeyDown = e => {
    if (e.key !== "Enter") return;
    const code = search.trim();
    if (!code) return;
    const matches = suppProds.filter(p=>[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code));
    if (matches.length===0) return;
    e.preventDefault();
    if (matches.length>1) { setBarcodeChoices(matches); return; }
    addItem(matches[0]);
  };
  const removeItem=i=>setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));

  // Scan d'un document (liste/demande papier du service, par exemple) pour
  // remplir automatiquement les produits à sortir — révision obligatoire
  // avant confirmation, comme pour les Bons d'Entrée. Contrairement à une
  // entrée, une sortie n'a pas de lot/péremption saisis manuellement (FEFO
  // automatique à l'envoi) : seuls le produit et la quantité sont retenus,
  // et la quantité est plafonnée au stock disponible comme partout ailleurs.
  const handleScan = async(file) => {
    if(!file) return;
    setScanning(true); setScanMsg("📄 Analyse du document en cours...");
    try {
      const result = await scanDocumentWithAI(file, suppProds);
      if(result.success && result.items?.length>0){ setScanMsg(""); setScanResult(result); setReviewOpen(true); }
      else setScanMsg("⚠️ "+(result.error||"Aucun article détecté dans ce document."));
    } catch(e){ setScanMsg("❌ Erreur scan : "+e.message); }
    setScanning(false);
  };

  const handleConfirmScan = async(selectedRows) => {
    setReviewOpen(false);
    const newProds = selectedRows.filter(r=>r.isNew && r.productName?.trim());
    let newlyCreated = [];
    for (const np of newProds) {
      const id = await store.addProduct({name:np.productName.trim(), price:Number(np.unitPrice||0), unit:np.unit||"Boîte", supplierId:activeSupplier?.id||"", circuits:["fonctionnement"]});
      newlyCreated.push({...np, productId:id});
    }
    const items = selectedRows.map(r=>{
      const prodId = r.isNew ? (newlyCreated.find(nc=>nc.productName===r.productName)?.productId||"") : r.productId;
      const knownProd = suppProds.find(p=>p.id===prodId);
      if (!prodId) return null;
      const dispo = getFonctPharmacyStock2(store,prodId);
      return { productId:prodId, productName:knownProd?.name||r.productName||"", qty:String(Math.min(Number(r.qty)||0,dispo)), stockDispo:dispo };
    }).filter(Boolean);
    setForm(f=>{
      const merged=[...f.items];
      for(const ni of items){
        const idx=merged.findIndex(x=>x.productId===ni.productId);
        if(idx>=0) merged[idx]={...merged[idx],qty:String(Math.min(Number(merged[idx].qty||0)+Number(ni.qty||0), ni.stockDispo))};
        else merged.push(ni);
      }
      return {...f, items: merged.length>0?merged:f.items};
    });
    setScanMsg("✅ "+items.length+" article(s) importé(s) — vérifiez les quantités avant d'envoyer"+(newProds.length>0?" · "+newProds.length+" nouveau(x) produit(s) créé(s)":""));
    setTimeout(()=>setScanMsg(""),8000);
    setScanResult(null);
  };

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    for (const it of form.items) {
      const dispo = getFonctPharmacyStock2(store, it.productId);
      if (Number(it.qty) > dispo) { setMsg(`⚠️ "${it.productName}" : quantité (${it.qty}) supérieure au stock disponible (${dispo}).`); return; }
    }
    setSaving(true);
    try{
      if (editingId) {
        await store.updateSortieFonct(editingId, {...form,serviceName:selectedSvc?.name});
        setMsg("✅ Bon de sortie modifié.");
      } else {
        await store.addSortieFonct({...form,supplierId:activeSupplier?.id,serviceName:selectedSvc?.name});
        setMsg("✅ Bon de sortie envoyé.");
      }
      setForm({reference:"BON-SORT-FONCT-"+genId(),serviceId:"",items:[],notes:""});
      setEditingId(null);
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const openEdit=(s)=>{
    setEditingId(s.id);
    setForm({reference:s.reference, serviceId:s.serviceId, items:(s.items||[]).map(it=>({productId:it.productId,productName:it.productName,qty:String(it.qty),stockDispo:getFonctPharmacyStock2(store,it.productId)})), notes:s.notes||""});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const resetOrClose=()=>{ setShow(false); setEditingId(null); setForm({reference:"BON-SORT-FONCT-"+genId(),serviceId:"",items:[],notes:""}); };

  const sorties=(store.sortiesFonct||[]).filter(s=>(activeSupplier?s.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,s.supplierId))&&hasServiceAccess(currentUser,s.serviceId))
    .filter(s=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = s.createdAt?.seconds ? new Date(s.createdAt.seconds*1000) : null;
        if (!d) return false;
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
      }
      if (filters.serviceId && s.serviceId!==filters.serviceId) return false;
      if (filters.createdBy && s.sentBy!==filters.createdBy) return false;
      if (filters.status && s.status!==filters.status) return false;
      return true;
    });

  const statusBadge=(s)=>{
    if(s.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Envoyé</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="sorties-fonct" title="📤 Bon de Sortie (Fonctionnement)" subtitle={"Pharmacie → Services · "+(activeSupplier?.name||"")}>
        {can(currentUser,"sorties-fonct","w")&&<button onClick={()=>{setEditingId(null);setForm({reference:"BON-SORT-FONCT-"+genId(),serviceId:"",items:[],notes:""});setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #ea580c"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:"#9a3412"}}>📤 {editingId?"Modifier le Bon de Sortie":"Nouveau Bon de Sortie"}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:12}}>Référence : {form.reference}</div>
            <div style={{marginBottom:10}}>
              <label style={label}>Service destinataire</label>
              <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value}))}>
                <option value="">— Choisir un service —</option>
                {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{marginBottom:10}}>
              <label style={label}>Scanner un document <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(liste/demande du service, Excel, PDF, Word ou photo — remplit la liste automatiquement, à réviser avant envoi)</span></label>
              {scanMsg&&<div style={{background:scanMsg.startsWith("✅")?"#f0fdf4":"#fef3c7",color:scanMsg.startsWith("✅")?"#166534":"#92400e",borderRadius:8,padding:"6px 10px",fontSize:11,marginBottom:6}}>{scanMsg}</div>}
              <div style={{display:"flex",gap:8}}>
                <label style={{...btn(),background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",fontSize:12,flex:1,textAlign:"center",cursor:"pointer"}}>
                  {scanning?"⏳ Analyse...":"📄 Scanner"}
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" style={{display:"none"}}
                    onChange={e=>handleScan(e.target.files?.[0])}/>
                </label>
                <label style={{...btn(),background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",fontSize:12,flex:1,textAlign:"center",cursor:"pointer"}}>
                  📷 Prendre une photo
                  <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    onChange={e=>handleScan(e.target.files?.[0])}/>
                </label>
              </div>
            </div>

            <div style={{position:"relative",marginBottom:10}}>
              <label style={label}>Ajouter un produit</label>
              {form.serviceId&&<div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Seuls les produits de fonctionnement autorisés pour ce service sont proposés.</div>}
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Rechercher ou scanner..." value={search}
                    onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                </div>
                <button onClick={()=>setShowScanner(true)} title="Scanner un code barre"
                  style={{...btn(),background:"#ea580c",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>📷</button>
              </div>
              {showScanner&&(
                <BarcodeScanner
                  onDetected={code=>{
                    setShowScanner(false);
                    const matches=suppProds.filter(p=>[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code));
                    if(matches.length>1){ setBarcodeChoices(matches); return; }
                    const found=matches[0]||suppProds.find(p=>p.name?.toLowerCase().includes(code.toLowerCase()));
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
                      <div style={{fontSize:11,color:"#64748b"}}>Stock dispo : {getFonctPharmacyStock2(store,p.id)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#fff7ed",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{it.productName}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Dispo:{it.stockDispo}</div>
                <input type="number" min="1" max={it.stockDispo} value={it.qty}
                  onChange={e=>{
                    const raw=e.target.value;
                    const clamped = raw==="" ? "" : String(Math.min(Number(raw)||0, it.stockDispo));
                    setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:clamped}:x)}));
                  }}
                  style={{width:60,padding:"4px 6px",border:"1px solid #fdba74",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>removeItem(i)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Observations</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving||!form.serviceId||form.items.length===0}
                style={{...btn(),background:"#ea580c",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Envoi...":"✅ Valider le bon de sortie"}
              </button>
              <button onClick={()=>{resetOrClose();}} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#ea580c":"#fff7ed",color:hasActiveFilters?"white":"#ea580c",fontSize:12}}>
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
                <option value="envoye">✅ Envoyé</option>
                <option value="annule">🚫 Annulé</option>
              </select>
            </div>
          </div>
        )}

        {sorties.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun bon de sortie ne correspond à ce filtre.":"Aucun bon de sortie."}</div>}
        {sorties.map(s=>(
          <div key={s.id} onClick={()=>setPrintSel(s)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(234,88,12,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour voir le détail complet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>📤 → {s.serviceName||"—"} <span style={{fontWeight:400,fontSize:11,color:"#94a3b8"}}>({s.reference||"—"})</span></div>
                <div style={{fontSize:11,color:"#64748b"}}>{s.sentByName} · {s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {statusBadge(s)}
                <span style={{background:"#ffedd5",color:"#9a3412",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(s.items||[]).length} produit(s)</span>
              </div>
            </div>
            {(s.items||[]).some(it=>it.expiry)&&(
              <button onClick={e=>{e.stopPropagation();setEditingExpiry(s);setExpiryDrafts(Object.fromEntries((s.items||[]).map(it=>[it.productId,it.expiry||""])));}}
                style={{...btn(),background:"#f8fafc",color:"#64748b",border:"1px solid #e2e8f0",fontSize:10,marginTop:6,padding:"3px 8px"}}>
                📅 Péremption la plus proche : {(s.items||[]).filter(it=>it.expiry).sort((a,b)=>a.expiry<b.expiry?-1:1)[0]?.expiry} ✏️
              </button>
            )}
            {s.status!=="annule"&&can(currentUser,"sorties-fonct","w")&&(
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <button onClick={e=>{e.stopPropagation();openEdit(s);}} style={{...btn(),background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",fontSize:11}}>✏️ Modifier</button>
                <button onClick={e=>{e.stopPropagation();setCancelling(s);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:11}}>🚫 Annuler</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Sortie (Fonctionnement)">
        <SortieFonctPrint s={printSel} products={store.products}/>
      </PrintModal>
      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon de sortie ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Ce bon de sortie vers <b>{cancelling.serviceName}</b> sera marqué "annulé" (jamais supprimé) et les quantités reviendront au stock fonctionnement pharmacie.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await store.cancelSortieFonct(cancelling.id); setCancelling(null); }
                catch(e){ setMsg("❌ "+e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!editingExpiry} onClose={()=>setEditingExpiry(null)} title="📅 Dates de péremption">
        {editingExpiry&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Corrigez la date si une erreur a été constatée. La correction s'applique aussi au lot physique suivi en interne.</div>
            {(editingExpiry.items||[]).map(it=>(
              <div key={it.productId} style={{marginBottom:10}}>
                <label style={label}>{it.productName}{it.lot?" — lot "+it.lot:""}</label>
                <input type="date" style={input} value={expiryDrafts[it.productId]||""} onChange={e=>setExpiryDrafts(d=>({...d,[it.productId]:e.target.value}))}/>
              </div>
            ))}
            <button onClick={async()=>{
              for(const [pid,val] of Object.entries(expiryDrafts)){
                const orig=(editingExpiry.items||[]).find(it=>it.productId===pid)?.expiry||"";
                if(val!==orig) await store.updateSortieFonctItemExpiry(editingExpiry.id,pid,val);
              }
              setEditingExpiry(null);
            }} style={{...btn(),background:"#ea580c",color:"white",width:"100%",padding:10,marginTop:4}}>💾 Enregistrer</button>
          </div>
        )}
      </Modal>
      <Modal open={!!barcodeChoices} onClose={()=>setBarcodeChoices(null)} title="📦 Plusieurs produits correspondent">
        {barcodeChoices&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Ce code-barre correspond à {barcodeChoices.length} produits chez ce fournisseur (doublon de saisie possible). Choisissez lequel ajouter :</div>
            {barcodeChoices.map(p=>(
              <button key={p.id} onClick={()=>{addItem(p);setBarcodeChoices(null);}}
                style={{...btn(),background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:8,display:"block"}}>
                <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Stock dispo : {getFonctPharmacyStock2(store,p.id)}</div>
              </button>
            ))}
            <button onClick={()=>setBarcodeChoices(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",width:"100%",padding:10,marginTop:4}}>Annuler</button>
          </div>
        )}
      </Modal>
      <ScanReviewModal open={reviewOpen} onClose={()=>{setReviewOpen(false);setScanResult(null);}}
        scanResult={scanResult} allProducts={store.products} activeSupplier={activeSupplier}
        onConfirm={handleConfirmScan} mode="bon"/>
    </div>
  );
}
