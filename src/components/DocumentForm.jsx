import { useState, useEffect, useRef } from "react";
import { genId, fmtDate } from "../constants";
import { scanDocumentWithAI } from "../hooks/useAI";
import { ConfirmDelete } from "./ui/Modal";
import { ScanReviewModal, BarcodeScanner } from "./ui/ScanReviewModal";
import { PageHeader } from "./ui/PageHeader";
import { btn, card, label, input } from "../helpers/styles";
import { Alert } from "./ui/FormControls";
import { downloadExcel } from "../helpers/exportUtils";
import { can } from "../permissions";
import { PrintModal, BonPrint } from "./print/PrintTemplates";

export function DocumentForm({type,store,activeSupplier,activeDepot,ai,onNav,currentUser}){
  const isEntry=type==="entry";
  const suppDepots=activeSupplier ? store.depots.filter(d=>d.supplierId===activeSupplier.id) : store.depots;
  const suppProds=activeSupplier ? store.products.filter(p=>p.supplierId===activeSupplier.id) : store.products;

  const blank=()=>({
    reference:`BON-${isEntry?"ENT":"RET"}-${genId()}`,
    supplierId: activeSupplier?.id||"",
    depotId: suppDepots[0]?.id||"",
    date: new Date().toISOString().split("T")[0],
    notes:"",
    items:[],
  });
  const [form,setForm]=useState(blank);
  const [saved,setSaved]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [scanMsg,setScanMsg]=useState("");
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [showBarcodeScanner,setShowBarcodeScanner]=useState(false);
  const searchRef=useRef(null);
  const fileRef=useRef(null);
  const [printBon,setPrintBon]=useState(null);

  // sync supplier
  useEffect(()=>{ if(activeSupplier) setForm(f=>({...f,supplierId:activeSupplier.id,depotId:suppDepots[0]?.id||f.depotId})); },[activeSupplier?.id]);

  // Filtrer produits selon recherche
  const filtered = search.trim().length>0
    ? suppProds.filter(p=>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode1&&p.barcode1.includes(search)) ||
        (p.barcode2&&p.barcode2.includes(search)) ||
        (p.barcode3&&p.barcode3.includes(search))
      )
    : suppProds;

  // Ajouter un produit à la liste
  const lastQtyRef = useRef(null);

  const addProduct=(prod)=>{
    setForm(f=>{
      const exists=f.items.find(it=>it.productId===prod.id);
      if(exists) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty||0)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,qty:"1",unitPrice:prod.price?String(prod.price):"",lot:"",expiry:""}]};
    });
    setSearch(""); setShowResults(false);
    // Focus sur le champ quantité du dernier produit ajouté
    setTimeout(()=>{ lastQtyRef.current?.focus(); lastQtyRef.current?.select(); }, 80);
  };

  const removeItem=i=>setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));
  const setItem=(i,field,val)=>setForm(f=>({...f,items:f.items.map((it,idx)=>idx===i?{...it,[field]:val}:it)}));

  const recentBons=(isEntry?store.entries:store.returns).filter(b=>!activeSupplier||b.supplierId===activeSupplier?.id).slice(0,3);

  const handleSave=()=>{
    const doc={...form,items:form.items.filter(it=>it.productId&&it.qty),supplierId:form.supplierId||activeSupplier?.id};
    if(doc.items.length===0){alert("⚠️ Ajoutez au moins un produit.");return;}
    if(isEntry) store.addEntry(doc); else store.addReturn(doc);
    setSaved(true); setForm(blank());
    setTimeout(()=>setSaved(false),3000);
  };

  const [bonScanResult,setBonScanResult]=useState(null);
  const [bonReviewOpen,setBonReviewOpen]=useState(false);
  const [deletingBon,setDeletingBon]=useState(null);

  const handleScan=async(file)=>{
    if(!file) return;
    setScanning(true); setScanMsg("📄 Analyse du document en cours...");
    try {
      const result=await scanDocumentWithAI(file,suppProds);
      if(result.success&&result.items?.length>0){ setScanMsg(""); setBonScanResult(result); setBonReviewOpen(true); }
      else setScanMsg("⚠️ "+(result.error||"Aucun article détecté."));
    } catch(e){ setScanMsg("❌ Erreur scan : "+e.message); }
    setScanning(false);
  };

  const handleConfirmBonScan=async(selectedRows)=>{
    setBonReviewOpen(false);
    const newProds=selectedRows.filter(r=>r.isNew&&r.productName?.trim());
    let newlyCreated=[];
    for(const np of newProds){
      const id=await store.addProduct({name:np.productName.trim(),price:Number(np.unitPrice||0),unit:np.unit||"Boîte",supplierId:activeSupplier?.id||""});
      newlyCreated.push({...np,productId:id});
    }
    const items=selectedRows.map(r=>{
      const prodId=r.isNew?(newlyCreated.find(nc=>nc.productName===r.productName)?.productId||""):r.productId;
      const knownProd=suppProds.find(p=>p.id===prodId);
      return{productId:prodId,qty:String(r.qty||""),unitPrice:r.unitPrice?String(r.unitPrice):knownProd?.price?String(knownProd.price):"",lot:r.lot||"",expiry:r.expiry||""};
    }).filter(it=>it.productId);
    setForm(f=>({...f,reference:bonScanResult?.reference||f.reference,notes:"Extrait du document scanné",items:items.length>0?items:f.items}));
    setScanMsg("✅ "+items.length+" article(s) importé(s)"+(newProds.length>0?" · "+newProds.length+" nouveau(x) produit(s) créé(s)":""));
    setTimeout(()=>setScanMsg(""),8000);
    setBonScanResult(null);
  };

  const total=form.items.reduce((s,it)=>s+(Number(it.qty||0)*Number(it.unitPrice||0)),0);

  return(
    <div style={{padding:0}}>
      <ConfirmDelete open={!!deletingBon} onClose={()=>setDeletingBon(null)}
        label={deletingBon?.reference||""}
        onConfirm={()=>{ if(isEntry) store.deleteEntry(deletingBon.id); else store.deleteReturn(deletingBon.id); }}/>
      <ScanReviewModal open={bonReviewOpen} onClose={()=>{setBonReviewOpen(false);setBonScanResult(null);}}
        scanResult={bonScanResult} allProducts={store.products} activeSupplier={activeSupplier}
        onConfirm={handleConfirmBonScan} mode="bon"/>
      <PageHeader pageId={isEntry?"entrees":"retours"}
        title={isEntry?"📥 Bon d'Entrée":"↩️ Bon de Retour"}
        subtitle={isEntry?"Réception · "+(activeSupplier?.name||""):"Retour · "+(activeSupplier?.name||"")}>
        <button onClick={()=>fileRef.current?.click()} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>
          {scanning?"⏳ Analyse...":"📄 Scanner"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{handleScan(e.target.files[0]);e.target.value="";}}/>
      </PageHeader>

      <div style={{padding:16}}>
      {!activeSupplier&&<Alert type="warn">⚠️ Aucun fournisseur actif.</Alert>}
      {saved&&<Alert type="success">✅ Bon enregistré avec succès !</Alert>}
      {scanMsg&&<Alert type={scanMsg.startsWith("✅")?"success":scanMsg.startsWith("⚠️")?"warn":"error"}>{scanMsg}</Alert>}

      {/* Infos du bon */}
      <div style={{...card,marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:8}}>
          <div><label style={label}>Référence</label>
            <input style={input} value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/></div>
          <div><label style={label}>Date</label>
            <input style={input} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
        </div>
        <div style={{marginBottom:8}}>
          <label style={label}>Fournisseur</label>
          <div style={{...input,background:"#f8fafc",color:activeSupplier?"#1e293b":"#94a3b8",display:"flex",alignItems:"center"}}>
            {activeSupplier?`🏢 ${activeSupplier.name}`:"— Aucun fournisseur actif —"}
          </div>
        </div>
        <div>
          <label style={label}>Dépôt</label>
          <select style={input} value={form.depotId} onChange={e=>setForm(f=>({...f,depotId:e.target.value}))}>
            <option value="">Sélectionner un dépôt...</option>
            {suppDepots.map(d=><option key={d.id} value={d.id}>{d.name} — {d.location}</option>)}
          </select>
        </div>
      </div>

      {/* ── Recherche produit ── */}
      <div style={{...card,marginBottom:12}}>
        <div style={{fontWeight:700,color:"#1e293b",marginBottom:10,fontSize:14}}>
          🔍 Rechercher un produit à ajouter
        </div>
        <div style={{position:"relative",display:"flex",gap:6}}>
          <div style={{position:"relative",flex:1}}>
            <input
              ref={searchRef}
              style={{...input,paddingLeft:36,fontSize:13}}
              placeholder="Tapez le nom ou scannez un code barre..."
              value={search}
              onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
              onFocus={()=>setShowResults(true)}
              onBlur={()=>setTimeout(()=>setShowResults(false),200)}
            />
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:16,pointerEvents:"none"}}>🔍</span>
          </div>
          {/* Bouton scan barcode */}
          <button onClick={()=>setShowBarcodeScanner(true)}
            title="Scanner un code barre"
            style={{...btn(),background:"#0891b2",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>
            📷
          </button>
        </div>

        {/* Scanner barcode */}
        {showBarcodeScanner&&(
          <BarcodeScanner
            onDetected={(code)=>{
              setShowBarcodeScanner(false);
              // Chercher le produit par code barre
              const found = suppProds.find(p=>
                p.barcode1===code || p.barcode2===code || p.barcode3===code ||
                p.name.toLowerCase().includes(code.toLowerCase())
              );
              if(found){ addProduct(found); }
              else { setSearch(code); setShowResults(true); }
            }}
            onClose={()=>setShowBarcodeScanner(false)}
          />
        )}
        {showResults&&filtered.length>0&&(
          <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:8,marginTop:4,maxHeight:220,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.10)"}}>
            {filtered.slice(0,20).map(p=>(
              <div key={p.id} onMouseDown={()=>addProduct(p)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 14px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",
                  background:form.items.find(it=>it.productId===p.id)?"#f0fdf4":"white"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f9ff"}
                onMouseLeave={e=>e.currentTarget.style.background=form.items.find(it=>it.productId===p.id)?"#f0fdf4":"white"}>
                <div>
                  <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{Number(p.price||0).toLocaleString("fr-FR")} FCFA · {p.unit||"Boîte"}</div>
                </div>
                {form.items.find(it=>it.productId===p.id)
                  ? <span style={{color:"#059669",fontWeight:700,fontSize:12}}>✓ Ajouté</span>
                  : <span style={{color:"#0891b2",fontWeight:700,fontSize:12}}>+ Ajouter</span>}
              </div>
            ))}
            {filtered.length>20&&<div style={{padding:"8px 14px",fontSize:11,color:"#94a3b8",textAlign:"center"}}>{filtered.length-20} autres résultats — affinez la recherche</div>}
          </div>
        )}
        {showResults&&search.trim().length>0&&filtered.length===0&&(
          <div style={{padding:"12px 14px",fontSize:12,color:"#94a3b8",textAlign:"center",background:"#f8fafc",borderRadius:8,marginTop:4}}>
            Aucun produit trouvé pour « {search} »
          </div>
        )}
      </div>

      {/* ── Liste des produits sélectionnés ── */}
      <div style={{...card,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>
            🛒 Produits sélectionnés
            {form.items.length>0&&<span style={{marginLeft:8,background:"#0891b2",color:"white",borderRadius:99,padding:"2px 8px",fontSize:11}}>{form.items.length}</span>}
          </div>
          {total>0&&<div style={{fontWeight:800,color:"#0891b2",fontSize:14}}>Total : {total.toLocaleString("fr-FR")} FCFA</div>}
        </div>
        {form.items.length===0?(
          <div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8",fontSize:13}}>
            ☝️ Recherchez et sélectionnez des produits ci-dessus
          </div>
        ):(
          form.items.map((it,i)=>{
            const prod=suppProds.find(p=>p.id===it.productId);
            const lineTotal=Number(it.qty||0)*Number(it.unitPrice||0);
            return(
              <div key={i} style={{background:"#f8fafc",borderRadius:8,padding:"10px 12px",marginBottom:8,border:"1.5px solid #e2e8f0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{fontWeight:700,color:"#1e293b",fontSize:13,flex:1,marginRight:8}}>{prod?.name||it.productId}</div>
                  <button onClick={()=>removeItem(i)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 8px",fontSize:11,flexShrink:0}}>✕</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><label style={label}>Quantité</label>
                    <input
                      ref={i===form.items.length-1 ? lastQtyRef : null}
                      style={input} type="number" min="0" value={it.qty}
                      onChange={e=>setItem(i,"qty",e.target.value)}/></div>
                  <div><label style={label}>Prix unit. (FCFA)</label>
                    <input style={{...input,background:it.unitPrice?"#f0fdf4":"white"}} type="number" min="0" value={it.unitPrice} onChange={e=>setItem(i,"unitPrice",e.target.value)} placeholder="Auto"/></div>
                  <div><label style={label}>N° Lot</label>
                    <input style={input} value={it.lot} onChange={e=>setItem(i,"lot",e.target.value)}/></div>
                  <div><label style={label}>Expiration</label>
                    <input style={input} type="date" value={it.expiry} onChange={e=>setItem(i,"expiry",e.target.value)}/></div>
                </div>
                {lineTotal>0&&<div style={{textAlign:"right",fontSize:11,color:"#0891b2",fontWeight:700,marginTop:4}}>Sous-total : {lineTotal.toLocaleString("fr-FR")} FCFA</div>}
              </div>
            );
          })
        )}
      </div>

      <div style={{...card,marginBottom:14}}>
        <label style={label}>Notes</label>
        <textarea style={{...input,height:70,resize:"vertical"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
      </div>

      <button onClick={handleSave} disabled={!activeSupplier||!form.depotId||form.items.length===0}
        style={{...btn(),background:(!activeSupplier||form.items.length===0)?"#cbd5e1":"linear-gradient(135deg,#0891b2,#0e7490)",color:"white",width:"100%",padding:12,fontSize:14,marginBottom:4}}>
        💾 Enregistrer le Bon {form.items.length>0&&`(${form.items.length} produit${form.items.length>1?"s":""})`}
      </button>
      </div>{/* end padding:16 */}

      {/* Bons récents avec impression */}
      {recentBons.length > 0 && (
        <div style={{marginTop:20}}>
          <div style={{fontWeight:700,color:"#1e293b",fontSize:13,marginBottom:10}}>
            {isEntry ? "📥" : "↩️"} Bons récents
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {recentBons.map(b => {
              const depot = store.depots.find(d => d.id === b.depotId);
              return (
                <div key={b.id} style={{...card,padding:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#1e293b",fontSize:12}}>{b.reference}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{fmtDate(b.date)} · {depot?.name||"—"} · {b.items?.length||0} article(s)</div>
                    {b.createdByName&&<div style={{fontSize:10,color:"#94a3b8"}}>👤 {b.createdByName}</div>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>setPrintBon(b)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",border:"1px solid #bae6fd",padding:"5px 8px",fontSize:11}}>🖨️</button>
                    <button onClick={()=>{const rows=(b.items||[]).map(it=>{const p=store.products.find(x=>x.id===it.productId);return[p?.name||it.productId,it.qty,Number(it.unitPrice||0),it.lot||"",it.expiry||""];});downloadExcel(b.reference+".xlsx",rows,["Produit","Qté","Prix unit. FCFA","Lot","Expiration"]);}} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",padding:"5px 7px",fontSize:11}}>⬇️</button>
                    {can(currentUser,isEntry?"entrees":"retours","d")&&<button onClick={()=>setDeletingBon(b)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"5px 7px",fontSize:11}}>🗑️</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modale impression bon */}
      {printBon && (
        <PrintModal open={!!printBon} onClose={()=>setPrintBon(null)} title={"Bon " + (printBon?.reference||"")}>
          <BonPrint
            bon={printBon}
            suppName={store.suppliers.find(s=>s.id===printBon.supplierId)?.name||activeSupplier?.name||"—"}
            depotName={store.depots.find(d=>d.id===printBon.depotId)?.name||"—"}
            products={store.products}
          />
        </PrintModal>
      )}
    </div>
  );
}
