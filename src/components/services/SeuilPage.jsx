import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { Modal } from "../ui/Modal";
import { visibleServices, productAllowedForService } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { getServiceStock2 } from "../../helpers/stock2";
import { BarcodeScanner } from "../ui/ScanReviewModal";

// Rubrique dédiée : un agent de service choisit son service (verrouillé sur le
// sien s'il en a un) et définit, produit par produit, le seuil de réappro-
// visionnement PROPRE à ce service (distinct du seuil pharmacie global géré
// dans Produits). Il est aussi autorisé ici — et seulement ici — à ajouter ou
// corriger un code-barre, via une fonction de store volontairement restreinte
// (voir updateProductThreshold) : il n'a pas le droit d'édition produit
// générale (nom, prix, fournisseur...).
export function SeuilPage({store,currentUser}){
  const userServiceId = currentUser?.serviceId||"";
  const isServiceAgent = currentUser?.role==="agent_service"||currentUser?.role==="admin_service";
  const [svcId,setSvcId] = useState(isServiceAgent?userServiceId:"");
  const [search,setSearch] = useState("");
  const [editing,setEditing] = useState(null); // produit en cours d'édition
  const [form,setForm] = useState({threshold:"",barcode1:"",barcode2:"",barcode3:""});
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState("");
  const [showScannerSearch,setShowScannerSearch] = useState(false);
  const [showScannerBarcode,setShowScannerBarcode] = useState(false);
  const [barcodeChoices,setBarcodeChoices]=useState(null); // plusieurs produits (fournisseurs différents) partagent ce code-barre

  const services = isServiceAgent
    ? (store.services||[]).filter(s=>s.id===userServiceId)
    : visibleServices(currentUser, store.services||[]);

  const products = (search.trim()
    ? store.products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
    : store.products
  ).filter(p=>productAllowedForService(p,svcId,store.suppliers));

  const openEdit = (p) => {
    setEditing(p);
    const t = p.reorderThresholds?.[svcId];
    setForm({ threshold: t!=null?String(t):"", barcode1:p.barcode1||"", barcode2:p.barcode2||"", barcode3:p.barcode3||"" });
  };

  // Lecteur de code-barre physique (USB/Bluetooth) : "tape" le code puis
  // Entrée dans le champ actif — le bouton 📷 (caméra) ne le capte pas, donc
  // on intercepte Entrée directement sur le champ de recherche.
  const handleSearchKeyDown = e => {
    if (e.key !== "Enter") return;
    const code = search.trim();
    if (!code) return;
    const matches = products.filter(p=>[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code));
    if (matches.length===0) return;
    e.preventDefault();
    if (matches.length>1) { setBarcodeChoices(matches); return; }
    openEdit(matches[0]);
  };

  const save = async () => {
    if(!svcId){ setMsg("⚠️ Choisissez d'abord un service."); return; }
    setSaving(true);
    try {
      await store.updateProductThreshold(editing.id, svcId, {
        threshold: form.threshold,
        barcode1: form.barcode1, barcode2: form.barcode2, barcode3: form.barcode3,
      });
      setEditing(null);
      setMsg("✅ Enregistré.");
      setTimeout(()=>setMsg(""),3000);
    } catch(e) { setMsg("❌ "+e.message); }
    setSaving(false);
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="seuil" title="🎚️ Seuil" subtitle="Seuils de réapprovisionnement par service"/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{marginBottom:12}}>
          <label style={label}>Service</label>
          {isServiceAgent?(
            <div style={{...input,background:"#f8fafc",color:"#581c87",fontWeight:600}}>
              {services[0]?.name||"—"} <span style={{fontSize:10,color:"#94a3b8",fontWeight:400}}>(votre service)</span>
            </div>
          ):(
            <select style={input} value={svcId} onChange={e=>setSvcId(e.target.value)}>
              <option value="">— Choisir un service —</option>
              {services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {!svcId&&<div style={{...card,textAlign:"center",padding:30,color:"#94a3b8"}}>Choisissez un service pour gérer ses seuils.</div>}

        {svcId&&(
          <>
            <div style={{position:"relative",marginBottom:10}}>
              <div style={{display:"flex",gap:6}}>
                <input style={{...input,flex:1}} placeholder="🔍 Rechercher un produit..."
                  value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={handleSearchKeyDown}/>
                <button onClick={()=>setShowScannerSearch(true)} title="Scanner un code barre"
                  style={{...btn(),background:"#7e22ce",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>📷</button>
              </div>
              {showScannerSearch&&(
                <BarcodeScanner
                  onDetected={code=>{
                    setShowScannerSearch(false);
                    const matches=products.filter(p=>[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code));
                    if(matches.length>1){ setBarcodeChoices(matches); return; }
                    if(matches[0]) openEdit(matches[0]);
                    else setSearch(code);
                  }}
                  onClose={()=>setShowScannerSearch(false)}
                />
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {products.map(p=>{
                const t = p.reorderThresholds?.[svcId];
                const stock = getServiceStock2(store,p.id,svcId);
                const isAlert = t!=null && stock<=t;
                return(
                  <div key={p.id} onClick={()=>openEdit(p)}
                    style={{...card,padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,border:isAlert?"1.5px solid #fca5a5":card.border}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                      <div style={{fontSize:11,color:"#94a3b8"}}>
                        Stock service : {stock} {p.barcode1&&<span style={{fontFamily:"monospace",marginLeft:6}}>#{p.barcode1}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10,color:"#94a3b8"}}>Seuil</div>
                      <div style={{fontWeight:700,color:isAlert?"#dc2626":"#581c87"}}>{t!=null?t:"—"}</div>
                    </div>
                    <span style={{fontSize:16,color:"#c084fc"}}>✏️</span>
                  </div>
                );
              })}
              {products.length===0&&<div style={{...card,textAlign:"center",padding:30,color:"#94a3b8"}}>Aucun produit.</div>}
            </div>
          </>
        )}

        <Modal open={!!editing} onClose={()=>setEditing(null)} title={"🎚️ "+(editing?.name||"")}>
          <div style={{marginBottom:12}}>
            <label style={label}>Seuil de réapprovisionnement <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(pour ce service)</span></label>
            <input style={input} type="number" min="0" value={form.threshold}
              onChange={e=>setForm(f=>({...f,threshold:e.target.value}))}
              placeholder="Ex : 10 — alerte si le stock du service descend en dessous"/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"#581c87"}}>Codes-barres</div>
            <button onClick={()=>setShowScannerBarcode(true)} title="Scanner pour remplir un code-barre"
              style={{...btn(),background:"#7e22ce",color:"white",padding:"4px 10px",fontSize:11}}>📷 Scanner</button>
          </div>
          {showScannerBarcode&&(
            <BarcodeScanner
              onDetected={code=>{
                setShowScannerBarcode(false);
                setForm(f=>{
                  // Remplit le premier emplacement vide, sinon écrase le principal (barcode1)
                  const slot = !f.barcode1?"barcode1":!f.barcode2?"barcode2":!f.barcode3?"barcode3":"barcode1";
                  return {...f,[slot]:code};
                });
              }}
              onClose={()=>setShowScannerBarcode(false)}
            />
          )}
          {["barcode1","barcode2","barcode3"].map((f,i)=>(
            <div key={f} style={{marginBottom:10}}>
              <label style={label}>Code-barre {i+1} {i===0&&<span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(principal)</span>}</label>
              <input style={{...input,fontFamily:"monospace"}} value={form[f]} onChange={e=>setForm(fo=>({...fo,[f]:e.target.value}))}/>
            </div>
          ))}
          <button onClick={save} disabled={saving} style={{...btn(),background:"#7e22ce",color:"white",width:"100%",padding:11,marginTop:8}}>
            {saving?"⏳ Enregistrement...":"💾 Enregistrer"}
          </button>
        </Modal>

        <Modal open={!!barcodeChoices} onClose={()=>setBarcodeChoices(null)} title="📦 Plusieurs produits correspondent">
          {barcodeChoices&&(
            <div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Ce code-barre correspond à {barcodeChoices.length} produits (fournisseurs différents). Choisissez lequel modifier :</div>
              {barcodeChoices.map(p=>(
                <button key={p.id} onClick={()=>{openEdit(p);setBarcodeChoices(null);}}
                  style={{...btn(),background:"#faf5ff",color:"#7e22ce",border:"1px solid #d8b4fe",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:8,display:"block"}}>
                  <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>Fournisseur : {store.suppliers.find(s=>s.id===p.supplierId)?.name||"—"} · Stock service : {getServiceStock2(store,p.id,svcId)}</div>
                </button>
              ))}
              <button onClick={()=>setBarcodeChoices(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",width:"100%",padding:10,marginTop:4}}>Annuler</button>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
