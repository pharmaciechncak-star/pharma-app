import { useState, useEffect, useRef } from "react";
import { scanDocumentWithAI } from "../hooks/useAI";
import { monthLabel, genId } from "../constants";
import { PageHeader } from "./ui/PageHeader";
import { Alert } from "./ui/FormControls";
import { card, input, btn } from "../helpers/styles";
import { ScanReviewModal } from "./ui/ScanReviewModal";
import { downloadExcel } from "../helpers/exportUtils";
import { pdfHeader, downloadPDF } from "../helpers/pdfUtils";
import { PrintModal } from "./print/PrintTemplates";
import { LOGO_B64 } from "../images";

export function InventoryPage({store,activeSupplier,currentUser}){
  const DRAFT_KEY = `inv_draft_${activeSupplier?.id||"global"}`;

  // mode: "choose" | "by-depot" | "consolidated"
  const [mode,setMode]=useState("choose");
  const [depotId,setDepotId]=useState("");
  // depotPhysical = { depotId: { productId: qty } }
  const [depotPhysical,setDepotPhysical]=useState({});
  const [result,setResult]=useState(null); // consolidated rows
  const [depotResults,setDepotResults]=useState({}); // { depotId: rows }
  const [step,setStep]=useState(1); // 1=choose depot 2=saisie 3=results 4=done
  const [scanning,setScanning]=useState(false);
  const [scanMsg,setScanMsg]=useState("");
  const [printList,setPrintList]=useState(false);
  const [showOldStock,setShowOldStock]=useState(true);
  const [editingResult,setEditingResult]=useState(false); // mode édition résultats
  const fileRef=useRef(null);

  // ── Restaurer le brouillon au montage ──
  useEffect(()=>{
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if(saved){
        const draft = JSON.parse(saved);
        if(draft.depotPhysical) setDepotPhysical(draft.depotPhysical);
        if(draft.depotResults)  setDepotResults(draft.depotResults);
        if(draft.result)        setResult(draft.result);
        if(draft.step && draft.step < 4) setStep(draft.step);
        if(draft.depotId)       setDepotId(draft.depotId);
      }
    } catch(e){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeSupplier?.id]);

  // ── Sauvegarder le brouillon à chaque changement ──
  useEffect(()=>{
    if(step===4){ localStorage.removeItem(DRAFT_KEY); return; }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        depotPhysical, depotResults, result, step, depotId
      }));
    } catch(e){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[depotPhysical, depotResults, result, step, depotId]);

  const suppDepots = activeSupplier
    ? store.depots.filter(d=>d.supplierId===activeSupplier.id && !d.isPrincipal && !d.isAutoCreated)
    : store.depots.filter(d=>!d.isPrincipal && !d.isAutoCreated);
  const principalDepot = activeSupplier
    ? store.depots.find(d=>d.supplierId===activeSupplier.id && (d.isPrincipal||d.isAutoCreated))
    : null;
  // All products of this supplier (no depotId filter — same products in all depots)
  const suppProds = activeSupplier ? store.products.filter(p=>p.supplierId===activeSupplier.id) : store.products;

  const m=new Date().getMonth(), y=new Date().getFullYear();

  // Compute rows for one depot
  const computeDepot=(dId, phys)=>{
    const mEnts=store.entries.filter(e=>new Date(e.date).getMonth()===m&&new Date(e.date).getFullYear()===y&&e.depotId===dId&&(!activeSupplier||e.supplierId===activeSupplier.id));
    const mRets=store.returns.filter(r=>new Date(r.date).getMonth()===m&&new Date(r.date).getFullYear()===y&&r.depotId===dId&&(!activeSupplier||r.supplierId===activeSupplier.id));
    return suppProds.map(p=>{
      const old=store.stock[p.id]||0;
      const ent=mEnts.reduce((s,e)=>s+(e.items?.find(i=>i.productId===p.id)?.qty||0)*1,0);
      const ret=mRets.reduce((s,r)=>s+(r.items?.find(i=>i.productId===p.id)?.qty||0)*1,0);
      // ⚠️ DISTINCTION CRITIQUE :
      // - phys[p.id] === undefined → produit NON inventorié → garder ancien stock (nw = old+ent-ret)
      // - phys[p.id] === "0" ou 0  → produit inventorié à ZÉRO → sold = old+ent-ret
      const rawVal = (phys||{})[p.id];
      const wasInventoried = rawVal !== undefined && rawVal !== "";
      const nw = wasInventoried ? Number(rawVal) : (old+ent-ret); // si non inventorié, nw = stock théorique → sold = 0
      const sold = wasInventoried ? Math.max(0, old+ent-ret-nw) : 0;
      return{product:p, old, ent, ret, nw, sold, wasInventoried,
        depot:store.depots.find(d=>d.id===dId)?.name||dId};
    });
  };

  // Consolidated: sum across all depots
  const consolidate=(allDepotResults)=>{
    const byProd={};
    Object.values(allDepotResults).forEach(rows=>{
      rows.forEach(row=>{
        if(!byProd[row.product.id]){
          byProd[row.product.id]={product:row.product,old:0,ent:0,ret:0,nw:0,sold:0,wasInventoried:false,depotBreakdown:{}};
        }
        byProd[row.product.id].old = Math.max(byProd[row.product.id].old, row.old); // prendre le max (même produit)
        byProd[row.product.id].ent += row.ent;
        byProd[row.product.id].ret += row.ret;
        if(row.wasInventoried){
          byProd[row.product.id].wasInventoried = true;
          byProd[row.product.id].nw += row.nw;
          byProd[row.product.id].sold += row.sold;
        }
        byProd[row.product.id].depotBreakdown[row.depot] = row.wasInventoried ? row.nw : "—";
      });
    });
    // Pour les produits non inventoriés, sold reste 0 et nw = old+ent-ret
    return Object.values(byProd).map(r=>{
      if(!r.wasInventoried){
        r.nw = r.old + r.ent - r.ret;
        r.sold = 0;
      }
      return r;
    });
  };

  const handleStartDepot=()=>{
    if(!depotId) return;
    setStep(2);
    setScanMsg("");
  };

  const [invScanResult,  setInvScanResult]  = useState(null);
  const [invReviewOpen,  setInvReviewOpen]  = useState(false);

  const handleScan=async(file)=>{
    if(!file) return;
    setScanning(true); setScanMsg("📄 Analyse du document en cours...");
    if(fileRef.current) fileRef.current.value="";
    try {
      const res=await scanDocumentWithAI(file, suppProds);
      if(res.success && res.items?.length > 0){
        setScanMsg("");
        setInvScanResult(res);
        setInvReviewOpen(true); // ouvrir révision
      } else {
        setScanMsg("⚠️ " + (res.error || "Aucune quantité détectée. Saisissez manuellement."));
      }
    } catch(e) {
      setScanMsg("❌ Erreur : " + e.message);
    }
    setScanning(false);
  };

  const handleConfirmInvScan = async (selectedRows) => {
    setInvReviewOpen(false);
    // Nouveaux produits → créer d'abord
    const newProds = selectedRows.filter(r => r.isNew && r.productName?.trim());
    const createdIds = {};
    for (const np of newProds) {
      const id = await store.addProduct({
        name: np.productName.trim(),
        price: Number(np.unitPrice||0),
        unit: np.unit||"Boîte",
        supplierId: activeSupplier?.id||"",
      });
      createdIds[np.productName] = id;
    }
    // Remplir les quantités physiques
    const phys = {};
    selectedRows.forEach(r => {
      const pid = r.isNew ? (createdIds[r.productName]||"") : r.productId;
      if(pid && r.qty) phys[pid] = String(r.qty);
    });
    setDepotPhysical(prev=>({...prev,[depotId]:{...(prev[depotId]||{}),...phys}}));
    const nNew = newProds.length;
    setScanMsg("✅ " + Object.keys(phys).length + " quantité(s) renseignée(s)"
      + (nNew>0 ? " · " + nNew + " nouveau(x) produit(s) créé(s)" : ""));
    setInvScanResult(null);
  };

  const handleComputeDepot=()=>{
    const phys=depotPhysical[depotId]||{};
    if(depotId==="__global__"){
      // Global mode: treat as single virtual depot containing all products
      const rows=suppProds.map(p=>{
        const m=new Date().getMonth(), y=new Date().getFullYear();
        const mEnts=store.entries.filter(e=>new Date(e.date).getMonth()===m&&new Date(e.date).getFullYear()===y&&(!activeSupplier||e.supplierId===activeSupplier.id));
        const mRets=store.returns.filter(r=>new Date(r.date).getMonth()===m&&new Date(r.date).getFullYear()===y&&(!activeSupplier||r.supplierId===activeSupplier.id));
        const old=store.stock[p.id]||0;
        const ent=mEnts.reduce((s,e)=>s+(e.items?.find(i=>i.productId===p.id)?.qty||0)*1,0);
        const ret=mRets.reduce((s,r)=>s+(r.items?.find(i=>i.productId===p.id)?.qty||0)*1,0);
        const nw=Number((phys||{})[p.id]||0);
        const sold=Math.max(0,old+ent-ret-nw);
        return{product:p,old,ent,ret,nw,sold,depot:"Global",depotBreakdown:{"Global":nw}};
      });
      const globalResult=rows.map(r=>({...r}));
      setResult(globalResult);
      setDepotResults({"__global__":rows});
      setStep(3);
    } else {
      const rows=computeDepot(depotId,phys);
      const newDR={...depotResults,[depotId]:rows};
      setDepotResults(newDR);
      setResult(consolidate(newDR));
      setStep(3);
    }
  };

  const handleAddAnotherDepot=()=>{
    setDepotId(""); setStep(1);
  };

  const saveAndFinish=async()=>{
    const inv={
      month:monthLabel(), supplierId:activeSupplier?.id,
      data:result,
      depotResults:depotResults,
      totalSold:result.reduce((s,r)=>s+r.sold,0),
    };
    await store.addInventory(inv);
    // Mettre à jour le stock UNIQUEMENT pour les produits qui ont été inventoriés
    // (wasInventoried = true) — les autres gardent leur stock inchangé
    for(const row of (result||[])){
      if(!row.product?.id) continue;
      if(row.wasInventoried && row.nw >= 0){
        try { await store.setStockForProduct(row.product.id, row.nw); } catch(e){ console.warn("Stock update error:", e); }
      }
      // Si non inventorié → stock inchangé
    }
    setStep(4);
  };

  const createInvoice=()=>{
    if(!result) return;
    const items=result.filter(r=>r.sold>0).map(r=>({
      productId:r.product.id, productName:r.product.name,
      qty:r.sold, unitPrice:r.product.price||0, total:r.sold*(r.product.price||0),
    }));
    store.addInvoice({
      month:monthLabel(), supplierId:activeSupplier?.id,
      supplier:activeSupplier?.name||"—",
      reference:"FACT-"+genId(), items,
      total:items.reduce((s,i)=>s+i.total,0),
    });
    alert("✅ Facture générée avec les prix FCFA !");
  };

  const thS={padding:"7px 9px",textAlign:"left",fontSize:11,fontWeight:700,color:"#64748b",borderBottom:"2px solid #e2e8f0",background:"#f8fafc"};
  const tdS={padding:"7px 9px",borderBottom:"1px solid #f1f5f9",fontSize:12};

  const completedDepots=Object.keys(depotResults);
  const remainingDepots=suppDepots.filter(d=>!completedDepots.includes(d.id));

  return(
    <div style={{padding:16}}>
      <PageHeader pageId="inventaire" title="🗂️ Inventaire Mensuel"
        subtitle={monthLabel() + " · " + (activeSupplier?activeSupplier.name:"Aucun fournisseur sélectionné")}/>

      {!activeSupplier&&<Alert type="warn">⚠️ Sélectionnez un fournisseur pour lancer l'inventaire.</Alert>}

      {/* Bandeau brouillon */}
      {activeSupplier && step>1 && step<4 && (
        <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{fontSize:12,color:"#92400e",fontWeight:600}}>
            ⏸️ Inventaire en cours — brouillon sauvegardé automatiquement
            {Object.keys(depotResults).length>0&&<span style={{marginLeft:8,fontWeight:400,color:"#78350f"}}>· {Object.keys(depotResults).length} dépôt(s) saisi(s)</span>}
          </div>
          <button onClick={()=>{
            localStorage.removeItem(DRAFT_KEY);
            setDepotPhysical({}); setDepotResults({}); setResult(null); setStep(1); setDepotId("");
          }} style={{background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
            🗑️ Réinitialiser
          </button>
        </div>
      )}

      {/* Steps */}
      <div style={{display:"flex",gap:0,marginBottom:20}}>
        {["Dépôt","Saisie","Résultats","Terminé"].map((s,i)=>(
          <div key={s} style={{flex:1,display:"flex",alignItems:"center"}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:step>i?"#0891b2":step===i+1?"#0891b2":"#e2e8f0",color:step>=i+1?"white":"#94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:11,flexShrink:0}}>{i+1}</div>
            <div style={{fontSize:10,marginLeft:4,color:step>=i+1?"#1e293b":"#94a3b8",fontWeight:step===i+1?700:400,whiteSpace:"nowrap"}}>{s}</div>
            {i<3&&<div style={{flex:1,height:2,background:step>i+1?"#0891b2":"#e2e8f0",margin:"0 5px"}}/>}
          </div>
        ))}
      </div>

      {/* STEP 1 — Choisir dépôt */}
      {step===1&&activeSupplier&&(
        <div style={{...card}}>
          <div style={{fontWeight:700,marginBottom:4,fontSize:14}}>Choisir le dépôt à saisir</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>
            {suppProds.length} produits · {suppDepots.length} dépôt(s) au total
            {completedDepots.length>0&&<span style={{color:"#059669",marginLeft:8}}>· {completedDepots.length} déjà saisi(s)</span>}
          </div>

          {/* Dépôts déjà saisis */}
          {completedDepots.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#059669",marginBottom:6}}>✅ Dépôts saisis :</div>
              {completedDepots.map(dId=>{
                const d=store.depots.find(x=>x.id===dId);
                const rows=depotResults[dId]||[];
                return(
                  <div key={dId} style={{display:"flex",justifyContent:"space-between",background:"#f0fdf4",borderRadius:7,padding:"7px 12px",marginBottom:5,fontSize:12}}>
                    <span style={{fontWeight:600,color:"#1e293b"}}>🏭 {d?.name||dId}</span>
                    <span style={{color:"#059669"}}>Vendus : {rows.reduce((s,r)=>s+r.sold,0)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <select style={input} value={depotId} onChange={e=>setDepotId(e.target.value)}>
            <option value="">-- Choisir un dépôt --</option>
            {suppDepots.map(d=>(
              <option key={d.id} value={d.id}>
                {completedDepots.includes(d.id)?"✅ ":""}{d.name} — {d.location}
              </option>
            ))}
          </select>

          <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
            <button onClick={handleStartDepot} disabled={!depotId} style={{...btn(),background:!depotId?"#cbd5e1":"#0891b2",color:"white",flex:1}}>
              Saisie par dépôt →
            </button>
            <button onClick={()=>{
              const globalId = principalDepot?.id || "__global__";
              setDepotId(globalId);
              setStep(2);
              setScanMsg("");
            }} style={{...btn(),background:"#7c3aed",color:"white",flex:1}}>
              🌐 Inventaire global (tous dépôts)
            </button>
            {completedDepots.length>0&&(
              <button onClick={()=>setStep(3)} style={{...btn(),background:"#059669",color:"white"}}>
                Voir consolidation →
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2 — Saisie physique du dépôt */}
      {step===2&&(
        <div>
          <div style={{...card,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:14}}>
                {depotId==="__global__"?"🌐 Inventaire Global (tous dépôts)":"🏭 "+( store.depots.find(d=>d.id===depotId)?.name||"Dépôt")+" — Stock physique"}
              </div>
              <button onClick={()=>setStep(1)} style={{...btn(),background:"#f1f5f9",color:"#64748b",padding:"5px 10px",fontSize:11}}>← Retour</button>
            </div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
              Saisissez la quantité physique constatée pour chaque produit dans ce dépôt
            </div>

            {/* Modale de révision scan inventaire */}
            <ScanReviewModal
              open={invReviewOpen}
              onClose={()=>{setInvReviewOpen(false);setInvScanResult(null);}}
              scanResult={invScanResult}
              allProducts={store.products}
              activeSupplier={activeSupplier}
              onConfirm={handleConfirmInvScan}
              mode="inventory"
            />
            {/* Scanner */}
            <div style={{background:"#fdf4ff",border:"1px solid #e9d5ff",borderRadius:8,padding:12,marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:"#7c3aed",marginBottom:8}}>📄 Scanner un document</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={()=>fileRef.current?.click()} disabled={scanning} style={{...btn(),background:"#7c3aed",color:"white",fontSize:12,padding:"7px 14px"}}>
                  {scanning?"⏳ Analyse...":"📎 Choisir fichier"}
                </button>
                <button onClick={()=>{if(fileRef.current)fileRef.current.value="";setScanMsg("");setDepotPhysical(prev=>({...prev,[depotId]:{}}));}} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"6px 10px"}}>
                  🔄 Effacer
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png" style={{display:"none"}}
                  onChange={e=>{if(e.target.files[0]) handleScan(e.target.files[0]);}}/>
              </div>
              {scanMsg&&<Alert type={scanMsg.startsWith("✅")?"success":"warn"}>{scanMsg}</Alert>}
              <div style={{fontSize:10,color:"#94a3b8",marginTop:6}}>Formats : PDF, Excel (.xlsx), Images (JPG/PNG)</div>
            </div>

            {/* Grille saisie */}
            {suppProds.length===0&&<Alert type="warn">Aucun produit pour ce fournisseur.</Alert>}
            {suppProds.map(p=>{
              const phys=depotPhysical[depotId]||{};
              return(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"9px 12px",background:"#f8fafc",borderRadius:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>
                      Stock sys. total: <b style={{color:"#0891b2"}}>{store.stock[p.id]||0}</b>
                      {completedDepots.length>0&&(
                        <span style={{color:"#7c3aed",marginLeft:8}}>
                          Déjà saisi: {completedDepots.filter(dId2=>dId2!==depotId).reduce((s,dId2)=>s+Number((depotPhysical[dId2]||{})[p.id]||0),0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <input type="number" min="0"
                    value={phys[p.id]!==undefined?phys[p.id]:""}
                    onChange={e=>setDepotPhysical(prev=>({...prev,[depotId]:{...(prev[depotId]||{}),[p.id]:e.target.value}}))}
                    placeholder="0"
                    style={{width:90,padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,textAlign:"center",outline:"none"}}
                  />
                </div>
              );
            })}
            <button onClick={handleComputeDepot} disabled={suppProds.length===0}
              style={{...btn(),background:"#0891b2",color:"white",width:"100%",marginTop:10}}>
              Valider ce dépôt →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Résultats consolidés */}
      {step===3&&result&&(
        <div>
          {/* Dépôts saisis */}
          <div style={{...card,marginBottom:12,padding:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Dépôts inventoriés</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {completedDepots.map(dId=>{
                const d=store.depots.find(x=>x.id===dId);
                const rows=depotResults[dId]||[];
                return(
                  <div key={dId} style={{background:"#f0fdf4",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#059669"}}>✅ {d?.name}</div>
                    <div style={{fontSize:12,color:"#1e293b",fontWeight:700,marginTop:2}}>{rows.reduce((s,r)=>s+r.nw,0)} unités</div>
                  </div>
                );
              })}
              {remainingDepots.map(d=>(
                <div key={d.id} style={{background:"#fef3c7",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#92400e"}}>⏳ {d.name}</div>
                  <div style={{fontSize:10,color:"#78350f",marginTop:2}}>Non saisi</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tableau consolidé */}
          <div style={{...card,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:14}}>📊 Consolidation — {monthLabel()}</div>
              <button onClick={()=>setEditingResult(v=>!v)}
                style={{...btn(),background:editingResult?"#0891b2":"#f0f9ff",color:editingResult?"white":"#0891b2",border:"1px solid #bae6fd",fontSize:11,padding:"5px 10px"}}>
                {editingResult?"✅ Terminer édition":"✏️ Modifier"}
              </button>
            </div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>
              Formule : Vendus = Ancien + Entrées − Retours − Stock Nouveau (somme de tous les dépôts)
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>
              👤 Inventaire en cours par : <b>{store.users?.find(u=>u.id===currentUser?.uid)?.name||currentUser?.name||"—"}</b>
            </div>
            {result.map(row=>(
              <div key={row.product.id} style={{background:row.wasInventoried?"#f8fafc":"#fffbeb",borderRadius:8,padding:"10px 12px",marginBottom:8,border:editingResult?"1.5px dashed #bae6fd":row.wasInventoried?"1.5px solid transparent":"1.5px solid #fcd34d"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <div style={{fontWeight:700,color:"#1e293b",fontSize:13,flex:1}}>{row.product.name}</div>
                  {!row.wasInventoried&&<span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏭️ Non inventorié</span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:6}}>
                  {[["Ancien",row.old,"#64748b"],["+Entrées",row.ent,"#059669"],["−Retours",row.ret,"#d97706"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",background:"white",borderRadius:6,padding:"5px 3px"}}>
                      <div style={{color:c,fontWeight:700,fontSize:14}}>{v}</div>
                      <div style={{color:"#94a3b8",fontSize:10}}>{l}</div>
                    </div>
                  ))}
                  <div style={{textAlign:"center",background:"white",borderRadius:6,padding:"5px 3px"}}>
                    {editingResult ? (
                      <input type="number" min="0"
                        value={row.nw}
                        onChange={e=>{
                          const newNw = Number(e.target.value)||0;
                          const newSold = Math.max(0, row.old+row.ent-row.ret-newNw);
                          setResult(prev=>prev.map(r=>r.product.id===row.product.id ? {...r,nw:newNw,sold:newSold} : r));
                          // Mettre à jour depotPhysical pour cohérence
                          const firstDepot = Object.keys(depotPhysical)[0]||"__global__";
                          setDepotPhysical(prev=>({...prev,[firstDepot]:{...(prev[firstDepot]||{}),[row.product.id]:String(newNw)}}));
                        }}
                        style={{width:"100%",padding:"4px",border:"1.5px solid #0891b2",borderRadius:6,fontSize:14,textAlign:"center",fontWeight:700,color:"#0891b2"}}/>
                    ) : (
                      <div style={{color:"#0891b2",fontWeight:700,fontSize:14}}>{row.nw}</div>
                    )}
                    <div style={{color:"#94a3b8",fontSize:10}}>Nouveau total</div>
                  </div>
                </div>
                {/* Détail par dépôt */}
                {Object.keys(row.depotBreakdown||{}).length>1&&(
                  <div style={{fontSize:10,color:"#7c3aed",marginBottom:4}}>
                    Dépôts : {Object.entries(row.depotBreakdown).map(([d,q])=>`${d}: ${q}`).join(" · ")}
                  </div>
                )}
                <div style={{textAlign:"center"}}>
                  <span style={{background:row.sold>0?"#dcfce7":"#f1f5f9",color:row.sold>0?"#059669":"#94a3b8",padding:"4px 14px",borderRadius:99,fontWeight:700,fontSize:12}}>
                    VENDUS : {row.sold}
                  </span>
                </div>
              </div>
            ))}
            <div style={{background:"#0891b2",color:"white",borderRadius:8,padding:"10px 14px",textAlign:"center",fontWeight:800,fontSize:14,marginTop:8}}>
              Total vendu : {result.reduce((s,r)=>s+r.sold,0)} unités
            </div>
          </div>

          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {remainingDepots.length>0&&(
              <button onClick={handleAddAnotherDepot} style={{...btn(),background:"#f0f9ff",color:"#0891b2",border:"1px solid #bae6fd"}}>
                + Ajouter dépôt ({remainingDepots.length} restant{remainingDepots.length>1?"s":""})
              </button>
            )}
            <button onClick={saveAndFinish} style={{...btn(),background:"#059669",color:"white",flex:1}}>💾 Valider inventaire</button>
            <button onClick={createInvoice} style={{...btn(),background:"#7c3aed",color:"white",flex:1}}>📊 Générer Situation</button>
            <button onClick={()=>{const rows=result.map(r=>[r.product.name,r.old,r.ent,r.ret,r.nw,r.sold]);const hdrs=["Produit","Ancien","Entrées","Retours","Nouveau","Vendus"];downloadExcel("inventaire_"+monthLabel().replace(" ","_")+".xlsx",rows,hdrs);}} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",fontSize:12}}>⬇️ Excel</button>
            <button onClick={()=>{const rows=result.map(r=>[r.product.name,r.old,r.ent,r.ret,r.nw,r.sold]);const hdrs=["Produit","Ancien","Entrées","Retours","Nouveau","Vendus"];const tbl=""+pdfHeader("INVENTAIRE","Période : "+monthLabel())+"<table><tr>"+hdrs.map(h=>"<th>"+h+"</th>").join("")+"</tr>"+rows.map(r=>"<tr>"+r.map(c=>"<td>"+c+"</td>").join("")+"</tr>").join("")+"<tr class=\"total-row\"><td colspan=5>TOTAL VENDU</td><td>"+result.reduce((s,r)=>s+r.sold,0)+"</td></tr></table><div class=\"footer\">Généré le "+new Date().toLocaleDateString("fr-FR")+"</div>";downloadPDF("inventaire_"+monthLabel(),tbl);}} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>⬇️ PDF</button>
          </div>

          {/* Impression liste */}
          <button onClick={()=>setPrintList(true)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",border:"1px solid #bae6fd",width:"100%",fontSize:12}}>
            🖨️ Imprimer liste d'inventaire
          </button>

          <PrintModal open={printList} onClose={()=>setPrintList(false)} title="Liste d'Inventaire">
            <div style={{marginBottom:12}}>
              <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                <input type="checkbox" checked={showOldStock} onChange={e=>setShowOldStock(e.target.checked)}/>
                Afficher le stock système (ancien stock)
              </label>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:12,borderBottom:"2px solid #0891b2"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <img src={LOGO_B64} alt="CHNCAK" style={{width:55,height:55,borderRadius:"50%",objectFit:"cover"}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0891b2"}}>CHNCAK</div>
                  <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>PharmaStock</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>LISTE D'INVENTAIRE</div>
                <div style={{fontSize:11,color:"#64748b"}}>{monthLabel()} · {activeSupplier?.name}</div>
              </div>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
              <thead>
                <tr>
                  <th style={thS}>Produit</th>
                  <th style={thS}>Unité</th>
                  {showOldStock&&<th style={thS}>Stock Sys.</th>}
                  {suppDepots.map(d=><th key={d.id} style={thS}>{d.name}</th>)}
                  <th style={thS}>Total</th>
                  <th style={thS}>Observations</th>
                </tr>
              </thead>
              <tbody>
                {suppProds.map(p=>(
                  <tr key={p.id}>
                    <td style={{...tdS,fontWeight:600}}>{p.name}</td>
                    <td style={tdS}>{p.unit}</td>
                    {showOldStock&&<td style={{...tdS,color:"#0891b2",fontWeight:700}}>{store.stock[p.id]||0}</td>}
                    {suppDepots.map(d=>{
                      const row=depotResults[d.id]?.find(r=>r.product.id===p.id);
                      return <td key={d.id} style={{...tdS,textAlign:"center"}}>{row?row.nw:"___"}</td>;
                    })}
                    <td style={{...tdS,fontWeight:700,color:"#0891b2",textAlign:"center"}}>
                      {result.find(r=>r.product.id===p.id)?.nw||"___"}
                    </td>
                    <td style={{...tdS,minWidth:100}}>___________</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{background:"#f0f9ff"}}>
                  <td colSpan={showOldStock?2:1} style={{...tdS,fontWeight:700}}>TOTAL</td>
                  {showOldStock&&<td style={{...tdS,fontWeight:700,color:"#0891b2"}}>{suppProds.reduce((s,p)=>s+(store.stock[p.id]||0),0)}</td>}
                  {suppDepots.map(d=>{
                    const total=(depotResults[d.id]||[]).reduce((s,r)=>s+r.nw,0);
                    return <td key={d.id} style={{...tdS,fontWeight:700,textAlign:"center"}}>{total||"—"}</td>;
                  })}
                  <td style={{...tdS,fontWeight:800,color:"#0891b2",textAlign:"center"}}>{result.reduce((s,r)=>s+r.nw,0)}</td>
                  <td style={tdS}></td>
                </tr>
              </tfoot>
            </table>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#94a3b8",borderTop:"1px solid #e2e8f0",paddingTop:10}}>
              <span>Signataire : ___________________________</span>
              <span>Date : {new Date().toLocaleDateString("fr-FR")}</span>
            </div>
          </PrintModal>
        </div>
      )}

      {step===4&&(
        <div style={{...card,textAlign:"center",padding:32}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontWeight:800,fontSize:18,color:"#059669",marginBottom:8}}>Inventaire validé !</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>{monthLabel()} · {activeSupplier?.name}</div>
          <div style={{fontSize:13,color:"#0891b2",marginBottom:20}}>{completedDepots.length} dépôt(s) · {result?.reduce((s,r)=>s+r.sold,0)} unités vendues</div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={createInvoice} style={{...btn(),background:"#7c3aed",color:"white"}}>🧾 Générer Facture</button>
            <button onClick={()=>{setStep(1);setResult(null);setDepotResults({});setDepotPhysical({});setDepotId("");}} style={{...btn(),background:"#f1f5f9",color:"#374151"}}>Nouvel Inventaire</button>
          </div>
        </div>
      )}
    </div>
  );
}
