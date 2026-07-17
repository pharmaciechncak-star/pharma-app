import { useState, useRef } from "react";
import { genId } from "../../constants";
import { IMG_CARDIO_SRC, IMG_LABEL_SRC, IMG_CHNCAK_SRC } from "../../images";
import { imageUrlToDataURL } from "../../helpers/fileUtils";
import { PageHeader } from "../ui/PageHeader";
import { btn, card, label, input } from "../../helpers/styles";
import { can, visibleSuppliers, hasSupplierAccess } from "../../permissions";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner } from "../ui/ScanReviewModal";
import { Modal } from "../ui/Modal";

export function ReceptionsPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({reference:"",supplierId:"",supplierName:"",date:new Date().toISOString().split("T")[0],items:[],notes:""});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [showScanner,setShowScanner]=useState(false);
  const [cancelling,setCancelling]=useState(null); // réception en attente de confirmation d'annulation
  const [cancelError,setCancelError]=useState("");
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",supplierId:"",reference:"",createdBy:"",status:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const searchRef=useRef(null);
  const lastQtyRef=useRef(null);

  const suppProds=activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId));
  const filtered=search.trim()
    ?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b.includes(search)))
    :suppProds;
  const receptions=(store.receptions||[]).filter(r=>activeSupplier?r.supplierId===activeSupplier.id:hasSupplierAccess(currentUser,r.supplierId))
    .filter(r=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000) : null;
        if (!d) return false;
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
      }
      if (filters.supplierId && r.supplierId!==filters.supplierId) return false;
      if (filters.reference && !(r.reference||"").toLowerCase().includes(filters.reference.toLowerCase())) return false;
      if (filters.createdBy && r.receivedBy!==filters.createdBy) return false;
      if (filters.status && (r.status==="annule"?"annule":"recu")!==filters.status) return false;
      return true;
    });

  const openNew=()=>{
    setEditing(null);
    setForm({reference:"BON-REC-"+genId(),supplierId:activeSupplier?.id||"",supplierName:activeSupplier?.name||"",date:new Date().toISOString().split("T")[0],items:[],notes:""});
    setShow(true); setSelected(null);
  };

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(i=>i.productId===prod.id);
      if(ex) return {...f,items:f.items.map(i=>i.productId===prod.id?{...i,qty:String(Number(i.qty)+1)}:i)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:"1",unitPrice:String(prod.price||""),lot:"",expiry:""}]};
    });
    setSearch(""); setShowResults(false);
    setTimeout(()=>{lastQtyRef.current?.focus();lastQtyRef.current?.select();},80);
  };

  const save=async()=>{
    if(!form.items.length){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      if(editing){
        await store.updateReception(editing,{...form});
        setMsg("✅ Réception modifiée !");
      } else {
        await store.addReception({...form});
        setMsg("✅ Réception enregistrée !");
      }
      setShow(false); setEditing(null);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const printReception=async(r)=>{
    const [cardioB64, labelB64, chncakB64] = await Promise.all([
      imageUrlToDataURL(IMG_CARDIO_SRC),
      imageUrlToDataURL(IMG_LABEL_SRC),
      imageUrlToDataURL(IMG_CHNCAK_SRC),
    ]);
    const rows=(r.items||[]).map((it,i)=>
      "<tr style=\"background:"+(i%2===0?"#fff":"#f8fafc")+"\">" +
      "<td>"+it.productName+"</td><td style=\"text-align:center\">"+it.qty+"</td>" +
      "<td style=\"text-align:right\">"+Number(it.unitPrice||0).toLocaleString("fr-FR")+"</td>" +
      "<td style=\"text-align:right;font-weight:600\">"+Number((it.qty||0)*(it.unitPrice||0)).toLocaleString("fr-FR")+"</td></tr>"
    ).join("");
    const total=r.items?.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0)||0;
    const html=
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Réception "+r.reference+"</title>"+
      "<style>@page{size:A4;margin:1.5cm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px}"+
      ".ph{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #065f46;padding-bottom:8px;margin-bottom:6px}"+
      ".ent{flex:1;text-align:center;font-size:8.5px;line-height:1.8;color:#111;padding:0 8px}"+
      ".eln{display:inline-block;border-bottom:1px solid #999;padding-bottom:1px}"+
      ".sub{background:#065f46;color:#fff;padding:5px;font-size:11px;font-weight:bold;text-align:center;letter-spacing:1px;margin-bottom:8px}"+
      ".info{display:flex;justify-content:space-between;font-size:9px;color:#444;margin-bottom:8px}"+
      "table{width:100%;border-collapse:collapse;font-size:10px}"+
      "th{background:#065f46;color:#fff;padding:6px 8px;text-align:center;border:1px solid #064e3b}"+
      "td{padding:5px 8px;border:1px solid #ddd}"+
      ".tot{background:#065f46;color:#fff;font-weight:bold}"+
      ".sig{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}"+
      ".sb{text-align:center}.sl{font-weight:bold;font-size:9px;color:#065f46;text-decoration:underline;margin-bottom:60px;display:block}"+
      ".su{height:4px}</style></head><body>"+
      "<div class=\"ph\">"+
        "<div style=\"flex-shrink:0;width:85px\"><img src=\"" + cardioB64 + "\" style=\"width:80px;height:100px;object-fit:contain\"/></div>"+
        "<div class=\"ent\">"+
          "<div style=\"font-size:11px;font-weight:bold\">République du Sénégal</div>"+
          "<div><span class=\"eln\">Un peuple - un but - une foi</span></div>"+
          "<div><span class=\"eln\">Ministère de la Santé et de l'Action Sociale</span></div>"+
          "<div><span class=\"eln\">Direction Générale des Établissements de Santé</span></div>"+
          "<div><span class=\"eln\">Direction des Établissements Publics de Santé</span></div>"+
          "<div style=\"font-weight:bold\"><span class=\"eln\">Centre Hospitalier National Cheikh Ahmadoul Khadim</span></div>"+
        "</div>"+
        "<div style=\"flex-shrink:0;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;width:145px\">"+
          "<img src=\"" + labelB64 + "\" style=\"width:65px;height:65px;object-fit:contain\"/>"+
          "<img src=\"" + chncakB64 + "\" style=\"width:65px;height:50px;object-fit:contain\"/>"+
        "</div>"+
      "</div>"+
      "<div class=\"sub\">BON DE RÉCEPTION — PHARMACIE CHNCAK</div>"+
      "<div class=\"info\"><span>Réf : <strong>"+r.reference+"</strong></span><span>Fournisseur : <strong>"+r.supplierName+"</strong></span><span>Date : "+r.date+"</span></div>"+
      "<table><thead><tr><th style=\"width:45%\">DÉSIGNATION</th><th>QTÉ</th><th>PRIX UNIT. (FCFA)</th><th>TOTAL (FCFA)</th></tr></thead><tbody>"+
      rows+"<tr class=\"tot\"><td colspan=\"3\" style=\"text-align:center\">TOTAL</td><td style=\"text-align:right\">"+total.toLocaleString("fr-FR")+"</td></tr></tbody></table>"+
      (r.notes?"<div style=\"margin-top:8px;font-size:9px;color:#444;font-style:italic\">Notes : "+r.notes+"</div>":"")+
      "<div class=\"sig\">"+
      "<div class=\"sb\"><div class=\"sl\">Le Fournisseur</div><div class=\"su\"></div></div>"+
      "<div class=\"sb\"><div class=\"sl\">Le Chef de service Pharmacie CHNCAK</div><div class=\"su\"></div></div>"+
      "</div>"+
      "</body></html>";
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const win=window.open(url,"_blank");
    if(win) win.addEventListener("load",()=>{setTimeout(()=>{win.print();URL.revokeObjectURL(url);},400);});
  };

  // Vue détail
  if(selected){
    const r=selected;
    const total=r.items?.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0)||0;
    return(
      <div style={{padding:0}}>
        <PageHeader pageId="receptions" title="📦 Bon de Réception" subtitle={r.reference}>
          <button onClick={()=>setSelected(null)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>← Retour</button>
        </PageHeader>
        <div style={{padding:16}}>
          <div style={{background:"#065f46",color:"white",borderRadius:"8px 8px 0 0",padding:"10px 14px",fontWeight:800,fontSize:13}}>
            BON DE RÉCEPTION — PHARMACIE CHNCAK
          </div>
          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"0 0 8px 8px",padding:"10px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,fontSize:12}}>
              <div><b>Réf :</b> {r.reference}</div>
              <div><b>Fournisseur :</b> {r.supplierName}</div>
              <div><b>Date :</b> {r.date}</div>
              <div><b>Par :</b> {r.receivedByName}</div>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:8}}>
            <thead><tr>
              {["DÉSIGNATION","QTÉ","PRIX UNIT.","TOTAL"].map(h=><th key={h} style={{background:"#065f46",color:"white",padding:"6px 8px",border:"1px solid #064e3b",textAlign:"center"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(r.items||[]).map((it,i)=>(
                <tr key={i} style={{background:i%2===0?"white":"#f0fdf4"}}>
                  <td style={{padding:"5px 8px",border:"1px solid #ddd"}}>{it.productName}</td>
                  <td style={{padding:"5px 8px",border:"1px solid #ddd",textAlign:"center"}}>{it.qty}</td>
                  <td style={{padding:"5px 8px",border:"1px solid #ddd",textAlign:"right"}}>{Number(it.unitPrice||0).toLocaleString("fr-FR")}</td>
                  <td style={{padding:"5px 8px",border:"1px solid #ddd",textAlign:"right",fontWeight:700}}>{(Number(it.qty||0)*Number(it.unitPrice||0)).toLocaleString("fr-FR")}</td>
                </tr>
              ))}
              <tr style={{background:"#065f46",color:"white"}}>
                <td colSpan={3} style={{padding:"6px 8px",border:"1px solid #064e3b",textAlign:"center",fontWeight:800}}>TOTAL</td>
                <td style={{padding:"6px 8px",border:"1px solid #064e3b",textAlign:"right",fontWeight:800,fontSize:13}}>{total.toLocaleString("fr-FR")} FCFA</td>
              </tr>
            </tbody>
          </table>
          {r.notes&&<div style={{fontSize:11,color:"#64748b",fontStyle:"italic",marginBottom:12}}>Notes : {r.notes}</div>}
          {r.status==="annule"&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:600,marginBottom:12}}>🚫 Cette réception a été annulée{r.cancelledByName?" par "+r.cancelledByName:""}{r.cancelledAt?.seconds?" le "+new Date(r.cancelledAt.seconds*1000).toLocaleString("fr-FR"):""}.</div>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {r.status!=="annule"&&can(currentUser,"receptions","w")&&<button onClick={()=>{setEditing(r.id);setForm({...r});setShow(true);setSelected(null);}} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>✏️ Modifier</button>}
            <button onClick={()=>printReception(r)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
            {r.status!=="annule"&&can(currentUser,"receptions","w")&&<button onClick={()=>{setCancelError("");setCancelling(r);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:12}}>🚫 Annuler</button>}
          </div>
        </div>
        <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon de réception ?">
          {cancelling&&(
            <div>
              <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
                Le bon <b>{cancelling.reference}</b> sera marqué "annulé" (jamais supprimé) et les quantités seront retirées du stock, sauf si une partie a déjà été transférée à un service.
              </div>
              {cancelError&&<Alert type="warn">{cancelError}</Alert>}
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={async()=>{
                  try{ await store.cancelReception(cancelling.id); setCancelling(null); setSelected(null); }
                  catch(e){ setCancelError(e.message); }
                }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
                <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="receptions" title="📦 Réceptions Service" subtitle={activeSupplier?.name||"Tous fournisseurs"}>
        {can(currentUser,"receptions","w")&&<button onClick={openNew} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau bon</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {/* Formulaire */}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #059669"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#065f46"}}>📦 {editing?"Modifier":"Nouveau"} Bon de Réception</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div><label style={label}>Référence</label><input style={input} value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/></div>
              <div><label style={label}>Date</label><input style={{...input}} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={label}>Fournisseur</label>
              {activeSupplier?<div style={{...input,background:"#f0fdf4",color:"#065f46",fontWeight:600}}>🏢 {activeSupplier.name}</div>:
              <select style={input} value={form.supplierId} onChange={e=>{const s=store.suppliers.find(x=>x.id===e.target.value);setForm(f=>({...f,supplierId:e.target.value,supplierName:s?.name||""}));}}>
                <option value="">— Choisir —</option>
                {visibleSuppliers(currentUser,store.suppliers).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>}
            </div>
            {/* Recherche produit */}
            <div style={{position:"relative",marginBottom:10}}>
              <label style={label}>Ajouter un produit</label>
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Nom ou code barre..."
                    value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                    onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                </div>
                <button onClick={()=>setShowScanner(true)} style={{...btn(),background:"#0891b2",color:"white",padding:"8px 12px",flexShrink:0}}>📷</button>
              </div>
              {showResults&&filtered.length>0&&(
                <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                  {filtered.slice(0,15).map(p=>(
                    <div key={p.id} onMouseDown={()=>addItem(p)} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                      <div style={{fontWeight:600}}>{p.name}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{Number(p.price||0).toLocaleString("fr-FR")} FCFA · {p.unit||"Boîte"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {showScanner&&<BarcodeScanner onDetected={code=>{setShowScanner(false);const p=suppProds.find(x=>[x.barcode1,x.barcode2,x.barcode3].includes(code)||x.name.toLowerCase().includes(code.toLowerCase()));if(p)addItem(p);else setSearch(code);}} onClose={()=>setShowScanner(false)}/>}
            {/* Liste produits */}
            {form.items.map((it,i)=>(
              <div key={i} style={{background:"#f0fdf4",borderRadius:8,padding:"8px 10px",marginBottom:6,border:"1px solid #86efac"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontWeight:600,fontSize:12}}>{it.productName}</div>
                  <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"2px 7px",fontSize:11}}>✕</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                  <div><label style={{...label,fontSize:9}}>Qté</label>
                    <input ref={i===form.items.length-1?lastQtyRef:null} type="number" min="0" value={it.qty}
                      onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                      style={{...input,textAlign:"center"}}/></div>
                  <div><label style={{...label,fontSize:9}}>Prix unit.</label>
                    <input type="number" min="0" value={it.unitPrice}
                      onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,unitPrice:e.target.value}:x)}))}
                      style={input}/></div>
                  <div><label style={{...label,fontSize:9}}>N° Lot</label>
                    <input value={it.lot||""} onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,lot:e.target.value}:x)}))} style={input}/></div>
                  <div><label style={{...label,fontSize:9}}>Expiration</label>
                    <input type="date" value={it.expiry||""} onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,expiry:e.target.value}:x)}))} style={input}/></div>
                </div>
                <div style={{textAlign:"right",fontSize:11,color:"#059669",fontWeight:700,marginTop:4}}>
                  Sous-total : {(Number(it.qty||0)*Number(it.unitPrice||0)).toLocaleString("fr-FR")} FCFA
                </div>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Notes</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving||form.items.length===0}
                style={{...btn(),background:form.items.length===0?"#cbd5e1":"#059669",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Enregistrement...":"✅ Valider le bon de réception"}
              </button>
              <button onClick={()=>{setShow(false);setEditing(null);}} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        {/* Liste */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#0891b2":"#ecfeff",color:hasActiveFilters?"white":"#0891b2",fontSize:12}}>
            🔍 Recherche{hasActiveFilters?" (active)":""}
          </button>
          {hasActiveFilters&&<button onClick={()=>setFilters({dateFrom:"",dateTo:"",supplierId:"",reference:"",createdBy:"",status:""})} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Réinitialiser</button>}
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
            <div style={{marginBottom:8}}><label style={label}>Référence</label><input style={input} value={filters.reference} onChange={e=>setFilters(f=>({...f,reference:e.target.value}))} placeholder="Ex: BON-REC-..."/></div>
            <div style={{marginBottom:8}}><label style={label}>Créé par</label>
              <select style={input} value={filters.createdBy} onChange={e=>setFilters(f=>({...f,createdBy:e.target.value}))}>
                <option value="">— Tous —</option>
                {(store.users||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={label}>Statut</label>
              <select style={input} value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}>
                <option value="">— Tous —</option>
                <option value="recu">✅ Reçu</option>
                <option value="annule">🚫 Annulé</option>
              </select>
            </div>
          </div>
        )}
        {receptions.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun bon de réception ne correspond à ce filtre.":"Aucun bon de réception."}</div>}
        {receptions.map(r=>{
          const total=r.items?.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0)||0;
          return(
            <div key={r.id} onClick={()=>setSelected(r)}
              style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.1)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow=""}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#065f46"}}>📦 {r.reference}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{r.supplierName} · {r.date}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{r.items?.length||0} produit(s) · Par {r.receivedByName}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,color:r.status==="annule"?"#94a3b8":"#059669",fontSize:15,textDecoration:r.status==="annule"?"line-through":"none"}}>{total.toLocaleString("fr-FR")} FCFA</div>
                  <span style={{background:r.status==="annule"?"#fee2e2":"#dcfce7",color:r.status==="annule"?"#b91c1c":"#059669",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{r.status==="annule"?"annulé":(r.status||"reçu")}</span>
                </div>
                <div style={{color:"#cbd5e1",fontSize:18,marginLeft:8}}>›</div>
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon de réception ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Le bon <b>{cancelling.reference}</b> sera marqué "annulé" (jamais supprimé) et les quantités seront retirées du stock, sauf si une partie a déjà été transférée à un service.
            </div>
            {cancelError&&<Alert type="warn">{cancelError}</Alert>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={async()=>{
                try{ await store.cancelReception(cancelling.id); setCancelling(null); setSelected(null); }
                catch(e){ setCancelError(e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
