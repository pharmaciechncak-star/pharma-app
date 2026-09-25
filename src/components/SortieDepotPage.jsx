import { useState, useRef } from "react";
import { genId, fmtDate } from "../constants";
import { PageHeader } from "./ui/PageHeader";
import { can, visibleSuppliers, hasSupplierAccess } from "../permissions";
import { btn, card, label, input } from "../helpers/styles";
import { Alert } from "./ui/FormControls";
import { BarcodeScanner } from "./ui/ScanReviewModal";
import { PrintModal, SortieDepotPrint } from "./print/PrintTemplates";
import { Modal } from "./ui/Modal";

const MOTIFS = [
  { key:"perte", label:"Perte" },
  { key:"casse", label:"Casse" },
  { key:"usage_interne", label:"Usage interne" },
  { key:"autre", label:"Autre" },
];

// Bon de Sortie (Dépôt Vente) — sortie DIRECTE, sans contrôle ni confirmation
// d'un service : pour perte, casse, usage interne ou tout autre motif ne
// nécessitant pas ce circuit. Coexiste avec les Transferts (qui restent le
// chemin normal vers un service, avec contrôle/confirmation) — ne les
// remplace pas. Stock ajusté directement (stockQty), comme Bon
// d'Entrée/Retour — pas de lots FEFO ici (spécifique au circuit
// Comptabilité Matières).
export function SortieDepotPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [cancelling,setCancelling]=useState(null);
  const [cancelError,setCancelError]=useState("");
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",supplierId:"",motif:"",createdBy:"",status:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const emptyForm = () => ({reference:"BON-SORT-DEPOT-"+genId(),supplierId:activeSupplier?.id||"",supplierName:activeSupplier?.name||"",date:new Date().toISOString().split("T")[0],motif:"perte",items:[],notes:""});
  const [form,setForm]=useState(emptyForm());
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [showScanner,setShowScanner]=useState(false);
  const [barcodeChoices,setBarcodeChoices]=useState(null);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const searchRef=useRef(null);
  const [printSel,setPrintSel]=useState(null);

  const suppProds=(activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId)));
  const filtered=search.trim()?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())):suppProds;

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      const dispo=store.stock[prod.id]||0;
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Math.min(Number(it.qty)+1,dispo))}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:String(Math.min(1,dispo)),unitPrice:String(prod.price||""),stockDispo:dispo}]};
    });
    setSearch(""); setShowResults(false);
  };

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

  const save=async()=>{
    if(!form.motif){setMsg("⚠️ Choisissez un motif.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    for (const it of form.items) {
      const dispo = store.stock[it.productId]||0;
      if (Number(it.qty) > dispo) { setMsg(`⚠️ "${it.productName}" : quantité (${it.qty}) supérieure au stock disponible (${dispo}).`); return; }
    }
    setSaving(true);
    try{
      if (editingId) {
        await store.updateSortieDepot(editingId, {...form});
        setMsg("✅ Bon de sortie modifié.");
      } else {
        await store.addSortieDepot({...form});
        setMsg("✅ Bon de sortie enregistré.");
      }
      setForm(emptyForm());
      setEditingId(null);
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const openEdit=(s)=>{
    setEditingId(s.id);
    setForm({reference:s.reference, supplierId:s.supplierId, supplierName:s.supplierName, date:s.date, motif:s.motif||"perte", items:(s.items||[]).map(it=>({productId:it.productId,productName:it.productName,qty:String(it.qty),unitPrice:String(it.unitPrice||""),stockDispo:store.stock[it.productId]||0})), notes:s.notes||""});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const resetOrClose=()=>{ setShow(false); setEditingId(null); setForm(emptyForm()); };

  const sorties=(store.sortiesDepot||[]).filter(s=>activeSupplier?s.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,s.supplierId))
    .filter(s=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = s.createdAt?.seconds ? new Date(s.createdAt.seconds*1000) : null;
        if (!d) return false;
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
      }
      if (filters.supplierId && s.supplierId!==filters.supplierId) return false;
      if (filters.motif && s.motif!==filters.motif) return false;
      if (filters.createdBy && s.createdBy!==filters.createdBy) return false;
      if (filters.status && s.status!==filters.status) return false;
      return true;
    });

  const statusBadge=(s)=>{
    if(s.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Sorti</span>;
  };
  const motifLabel=(m)=>MOTIFS.find(x=>x.key===m)?.label||m||"—";

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="sorties-depot" title="📤 Bon de Sortie (Dépôt Vente)" subtitle={activeSupplier?.name||"Tous fournisseurs"}>
        {can(currentUser,"sorties-depot","w")&&<button onClick={()=>{setEditingId(null);setForm(emptyForm());setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#92400e",marginBottom:12}}>
          ℹ️ Sortie directe, sans contrôle ni confirmation d'un service — pour perte, casse, usage interne... Pour un envoi normal vers un service, utilisez plutôt <b>Transferts</b>.
        </div>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #7f1d1d"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:"#7f1d1d"}}>📤 {editingId?"Modifier le Bon de Sortie":"Nouveau Bon de Sortie"}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:12}}>Référence : {form.reference}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div>
                <label style={label}>Fournisseur</label>
                {activeSupplier?<div style={{...input,background:"#fef2f2",color:"#7f1d1d",fontWeight:600}}>🏢 {activeSupplier.name}</div>:
                <select style={input} value={form.supplierId} onChange={e=>{const s=store.suppliers.find(x=>x.id===e.target.value);setForm(f=>({...f,supplierId:e.target.value,supplierName:s?.name||""}));}}>
                  <option value="">— Choisir —</option>
                  {visibleSuppliers(currentUser,store.suppliers).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>}
              </div>
              <div><label style={label}>Date</label><input style={input} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={label}>Motif</label>
              <select style={input} value={form.motif} onChange={e=>setForm(f=>({...f,motif:e.target.value}))}>
                {MOTIFS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>

            <div style={{position:"relative",marginBottom:10}}>
              <label style={label}>Ajouter un produit</label>
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Nom ou code barre..."
                    value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                </div>
                <button onClick={()=>setShowScanner(true)} style={{...btn(),background:"#7f1d1d",color:"white",padding:"8px 12px",flexShrink:0}}>📷</button>
              </div>
              {showResults&&filtered.length>0&&(
                <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                  {filtered.slice(0,15).map(p=>{
                    const dispo=store.stock[p.id]||0;
                    return (
                      <div key={p.id} onMouseDown={()=>dispo>0&&addItem(p)} style={{padding:"8px 12px",cursor:dispo>0?"pointer":"not-allowed",borderBottom:"1px solid #f1f5f9",fontSize:12,opacity:dispo>0?1:0.4}}>
                        <div style={{fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>Stock disponible : {dispo}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {showScanner&&<BarcodeScanner onDetected={code=>{setShowScanner(false);const matches=suppProds.filter(x=>[x.barcode1,x.barcode2,x.barcode3].includes(code));if(matches.length>1){setBarcodeChoices(matches);return;}const p=matches[0];if(p)addItem(p);else setSearch(code);}} onClose={()=>setShowScanner(false)}/>}

            {form.items.map((it,i)=>(
              <div key={i} style={{background:"#fef2f2",borderRadius:8,padding:"8px 10px",marginBottom:6,border:"1px solid #fca5a5"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontWeight:600,fontSize:12}}>{it.productName} <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(dispo : {it.stockDispo})</span></div>
                  <button onClick={()=>removeItem(i)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"2px 7px",fontSize:11}}>✕</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div><label style={{...label,fontSize:9}}>Qté</label>
                    <input type="number" min="0" max={it.stockDispo} value={it.qty}
                      onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                      style={{...input,textAlign:"center"}}/></div>
                  <div><label style={{...label,fontSize:9}}>Prix unit.</label>
                    <input type="number" min="0" value={it.unitPrice}
                      onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,unitPrice:e.target.value}:x)}))}
                      style={input}/></div>
                </div>
                <div style={{textAlign:"right",fontSize:11,color:"#7f1d1d",fontWeight:700,marginTop:4}}>
                  Sous-total : {(Number(it.qty||0)*Number(it.unitPrice||0)).toLocaleString("fr-FR")} FCFA
                </div>
              </div>
            ))}

            <div style={{marginBottom:10}}><label style={label}>Observations</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving||form.items.length===0}
                style={{...btn(),background:form.items.length===0?"#cbd5e1":"#7f1d1d",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Enregistrement...":"📤 Valider le bon de sortie"}
              </button>
              <button onClick={resetOrClose} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#7f1d1d":"#fef2f2",color:hasActiveFilters?"white":"#7f1d1d",fontSize:12}}>
            🔍 Recherche{hasActiveFilters?" (active)":""}
          </button>
          {hasActiveFilters&&<button onClick={()=>setFilters({dateFrom:"",dateTo:"",supplierId:"",motif:"",createdBy:"",status:""})} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Réinitialiser</button>}
        </div>
        {showFilters&&(
          <div style={{...card,marginBottom:12,padding:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Du</label><input type="date" style={input} value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></div>
              <div><label style={label}>Au</label><input type="date" style={input} value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></div>
            </div>
            {!activeSupplier&&<div style={{marginBottom:8}}><label style={label}>Fournisseur</label>
              <select style={input} value={filters.supplierId} onChange={e=>setFilters(f=>({...f,supplierId:e.target.value}))}>
                <option value="">— Tous —</option>
                {visibleSuppliers(currentUser,store.suppliers).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>}
            <div style={{marginBottom:8}}><label style={label}>Motif</label>
              <select style={input} value={filters.motif} onChange={e=>setFilters(f=>({...f,motif:e.target.value}))}>
                <option value="">— Tous —</option>
                {MOTIFS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
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
                <option value="envoye">✅ Sorti</option>
                <option value="annule">🚫 Annulé</option>
              </select>
            </div>
          </div>
        )}

        {sorties.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun bon de sortie ne correspond à ce filtre.":"Aucun bon de sortie (dépôt vente)."}</div>}
        {sorties.map(s=>{
          const total=(s.items||[]).reduce((sum,i)=>sum+Number(i.qty||0)*Number(i.unitPrice||0),0);
          return(
            <div key={s.id} style={{...card,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#7f1d1d"}}>📤 {s.reference}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{motifLabel(s.motif)} · {fmtDate(s.date)}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{s.items?.length||0} produit(s) · Par {s.createdByName}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,color:s.status==="annule"?"#94a3b8":"#7f1d1d",fontSize:15,textDecoration:s.status==="annule"?"line-through":"none"}}>{total.toLocaleString("fr-FR")} FCFA</div>
                  {statusBadge(s)}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
                {s.status!=="annule"&&can(currentUser,"sorties-depot","w")&&<button onClick={()=>openEdit(s)} style={{...btn(),background:"#fef2f2",color:"#7f1d1d",border:"1px solid #fca5a5",fontSize:12}}>✏️ Modifier</button>}
                <button onClick={()=>setPrintSel(s)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
                {s.status!=="annule"&&can(currentUser,"sorties-depot","w")&&<button onClick={()=>{setCancelError("");setCancelling(s);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:12}}>🚫 Annuler</button>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon de sortie ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Le bon <b>{cancelling.reference}</b> sera marqué "annulé" (jamais supprimé) et les quantités reviendront au stock.
            </div>
            {cancelError&&<Alert type="warn">{cancelError}</Alert>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={async()=>{
                try{ await store.cancelSortieDepot(cancelling.id); setCancelling(null); }
                catch(e){ setCancelError(e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!barcodeChoices} onClose={()=>setBarcodeChoices(null)} title="📦 Plusieurs produits correspondent">
        {barcodeChoices&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Ce code-barre correspond à {barcodeChoices.length} produits. Choisissez lequel ajouter :</div>
            {barcodeChoices.map(p=>(
              <button key={p.id} onClick={()=>{addItem(p);setBarcodeChoices(null);}}
                style={{...btn(),background:"#fef2f2",color:"#7f1d1d",border:"1px solid #fca5a5",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:8,display:"block"}}>
                <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
              </button>
            ))}
            <button onClick={()=>setBarcodeChoices(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",width:"100%",padding:10,marginTop:4}}>Annuler</button>
          </div>
        )}
      </Modal>

      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Sortie (Dépôt Vente)" signatories={["Le Responsable","Le Gestionnaire de stock"]}>
        <SortieDepotPrint s={printSel} products={store.products}/>
      </PrintModal>
    </div>
  );
}
