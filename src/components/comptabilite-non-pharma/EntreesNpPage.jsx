import { useState, useRef } from "react";
import { genId } from "../../constants";
import { IMG_CARDIO_SRC, IMG_LABEL_SRC, IMG_CHNCAK_SRC } from "../../images";
import { imageUrlToDataURL } from "../../helpers/fileUtils";
import { PageHeader } from "../ui/PageHeader";
import { btn, card, label, input } from "../../helpers/styles";
import { can, visibleSuppliers, hasSupplierAccess, productVisibleInCircuit } from "../../permissions";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner, ScanReviewModal } from "../ui/ScanReviewModal";
import { Modal } from "../ui/Modal";
import { scanDocumentWithAI } from "../../hooks/useAI";

export function EntreesNpPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({reference:"",supplierId:"",supplierName:"",date:new Date().toISOString().split("T")[0],items:[],notes:"",attachmentUrl:"",attachmentName:"",attachmentType:""});
  const [uploadingAttachment,setUploadingAttachment]=useState(false);
  const [attachError,setAttachError]=useState("");
  const [scanResult,setScanResult]=useState(null);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [scanMsg,setScanMsg]=useState("");
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [showScanner,setShowScanner]=useState(false);
  const [barcodeChoices,setBarcodeChoices]=useState(null); // ce code-barre correspond à plusieurs produits CHEZ CE FOURNISSEUR
  const [cancelling,setCancelling]=useState(null); // réception en attente de confirmation d'annulation
  const [cancelError,setCancelError]=useState("");
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",supplierId:"",reference:"",createdBy:"",status:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const searchRef=useRef(null);
  const lastQtyRef=useRef(null);

  const suppProds=(activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId))).filter(p=>productVisibleInCircuit(p,"non_pharmaceutique",store.suppliers));
  const filtered=search.trim()
    ?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b.includes(search)))
    :suppProds;
  const receptions=(store.entreesNp||[]).filter(r=>activeSupplier?r.supplierId===activeSupplier.id:hasSupplierAccess(currentUser,r.supplierId))
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
    setForm({reference:"BON-ENT-NP-"+genId(),supplierId:activeSupplier?.id||"",supplierName:activeSupplier?.name||"",date:new Date().toISOString().split("T")[0],items:[],notes:"",attachmentUrl:"",attachmentName:"",attachmentType:""});
    setAttachError("");
    setShow(true); setSelected(null);
  };

  const handleAttachmentUpload = (file) => {
    if (!file) return;
    // Un seul document Firestore par réception : on garde une marge sous 1 Mo
    // (les articles/notes prennent aussi de la place), donc plafond raisonnable
    // par pièce jointe — comme pour les images du carrousel.
    if (file.size > 700*1024) {
      setAttachError("⚠️ Fichier trop volumineux (max 700 Ko). Compressez-le ou prenez une photo moins lourde.");
      return;
    }
    setAttachError("");
    setUploadingAttachment(true);
    const reader = new FileReader();
    reader.onload = e => {
      setForm(f=>({...f, attachmentUrl:e.target.result, attachmentName:file.name, attachmentType:file.type}));
      setUploadingAttachment(false);
    };
    reader.onerror = () => { setAttachError("❌ Erreur lors de la lecture du fichier."); setUploadingAttachment(false); };
    reader.readAsDataURL(file);
    // En plus de le garder en pièce jointe (archive du document d'origine),
    // on tente d'en extraire automatiquement la liste des articles — comme
    // pour Bon d'Entrée : révision obligatoire avant confirmation, jamais
    // d'ajout automatique sans validation humaine.
    handleScan(file);
  };

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
    // Les nouveaux produits détectés (absents du catalogue) sont créés avant
    // d'être rattachés aux lignes de la réception — même logique que Bon d'Entrée.
    const newProds = selectedRows.filter(r=>r.isNew && r.productName?.trim());
    let newlyCreated = [];
    for (const np of newProds) {
      const id = await store.addProduct({name:np.productName.trim(), price:Number(np.unitPrice||0), unit:np.unit||"Boîte", supplierId:form.supplierId||activeSupplier?.id||"", circuits:["non_pharmaceutique"]});
      newlyCreated.push({...np, productId:id});
    }
    const items = selectedRows.map(r=>{
      const prodId = r.isNew ? (newlyCreated.find(nc=>nc.productName===r.productName)?.productId||"") : r.productId;
      const knownProd = suppProds.find(p=>p.id===prodId);
      return { productId:prodId, productName:knownProd?.name||r.productName||"", qty:String(r.qty||""), unitPrice:r.unitPrice?String(r.unitPrice):knownProd?.price?String(knownProd.price):"", lot:r.lot||"", expiry:r.expiry||"" };
    }).filter(it=>it.productId);
    setForm(f=>{
      const merged=[...f.items];
      for(const ni of items){
        const idx=merged.findIndex(x=>x.productId===ni.productId);
        if(idx>=0) merged[idx]={...merged[idx],qty:String((Number(merged[idx].qty)||0)+(Number(ni.qty)||0))};
        else merged.push(ni);
      }
      return {...f, items: merged.length>0?merged:f.items};
    });
    setScanMsg("✅ "+items.length+" article(s) importé(s) — vérifiez avant d'enregistrer"+(newProds.length>0?" · "+newProds.length+" nouveau(x) produit(s) créé(s)":""));
    setTimeout(()=>setScanMsg(""),8000);
    setScanResult(null);
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

  // Lecteur de code-barre physique (USB/Bluetooth) : "tape" le code puis
  // Entrée dans le champ actif — le bouton 📷 (caméra) ne le capte pas. Cette
  // page est déjà scopée à un seul fournisseur (activeSupplier) : même si le
  // même code-barre existe chez un autre fournisseur, on ne s'intéresse qu'à
  // celui actuellement sélectionné (suppProds).
  // Cette page est déjà scopée à un seul fournisseur (activeSupplier), mais ce
  // fournisseur peut avoir donné le même code-barre à deux produits
  // différents (erreur de saisie ou volontaire) — on propose un choix dès que
  // plus d'une fiche correspond, même au sein de suppProds.
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

  const save=async()=>{
    if(!form.items.length){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      if(editing){
        await store.updateEntreeNp(editing,{...form});
        setMsg("✅ Bon d'entrée modifié !");
      } else {
        await store.addEntreeNp({...form});
        setMsg("✅ Bon d'entrée enregistré !");
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
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Bon d'entrée non pharmaceutique "+r.reference+"</title>"+
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
          "<div><span class=\"eln\">Ministère de la Santé et de l'Hygiène Publique</span></div>"+
          "<div><span class=\"eln\">Direction Générale des Établissements de Santé</span></div>"+
          "<div><span class=\"eln\">Direction des Établissements Publics de Santé</span></div>"+
          "<div style=\"font-weight:bold\"><span class=\"eln\">Centre Hospitalier National Cheikh Ahmadoul Khadim</span></div>"+
        "</div>"+
        "<div style=\"flex-shrink:0;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;width:145px\">"+
          "<img src=\"" + labelB64 + "\" style=\"width:65px;height:65px;object-fit:contain\"/>"+
          "<img src=\"" + chncakB64 + "\" style=\"width:65px;height:50px;object-fit:contain\"/>"+
        "</div>"+
      "</div>"+
      "<div class=\"sub\">BON D'ENTRÉE (NON PHARMACEUTIQUE) — CHNCAK</div>"+
      "<div class=\"info\"><span>Réf : <strong>"+r.reference+"</strong></span><span>Fournisseur : <strong>"+r.supplierName+"</strong></span><span>Date : "+r.date+"</span></div>"+
      "<table><thead><tr><th style=\"width:45%\">DÉSIGNATION</th><th>QTÉ</th><th>PRIX UNIT. (FCFA)</th><th>TOTAL (FCFA)</th></tr></thead><tbody>"+
      rows+"<tr class=\"tot\"><td colspan=\"3\" style=\"text-align:center\">TOTAL</td><td style=\"text-align:right\">"+total.toLocaleString("fr-FR")+"</td></tr></tbody></table>"+
      (r.notes?"<div style=\"margin-top:8px;font-size:9px;color:#444;font-style:italic\">Observations : "+r.notes+"</div>":"")+
      "<div class=\"sig\">"+
      "<div class=\"sb\"><div class=\"sl\">Le Fournisseur</div><div class=\"su\"></div></div>"+
      "<div class=\"sb\"><div class=\"sl\">Le Comptable Non Pharmaceutique CHNCAK</div><div class=\"su\"></div></div>"+
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
        <PageHeader pageId="entrees-np" title="📦 Bon d'Entrée (Non Pharmaceutique)" subtitle={r.reference}>
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
          {r.notes&&<div style={{fontSize:11,color:"#64748b",fontStyle:"italic",marginBottom:12}}>Observations : {r.notes}</div>}
          {r.attachmentUrl&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:6}}>📎 Document joint</div>
              {r.attachmentType?.startsWith("image/")?(
                <a href={r.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  <img src={r.attachmentUrl} alt={r.attachmentName} style={{maxWidth:220,maxHeight:220,borderRadius:8,border:"1px solid #e2e8f0"}}/>
                </a>
              ):(
                <a href={r.attachmentUrl} download={r.attachmentName} style={{...btn(),background:"#eef2ff",color:"#4f46e5",border:"1px solid #c7d2fe",fontSize:12,textDecoration:"none",display:"inline-block"}}>
                  📄 {r.attachmentName||"Télécharger le document"}
                </a>
              )}
            </div>
          )}
          {r.status==="annule"&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:600,marginBottom:12}}>🚫 Ce bon d'entrée a été annulé{r.cancelledByName?" par "+r.cancelledByName:""}{r.cancelledAt?.seconds?" le "+new Date(r.cancelledAt.seconds*1000).toLocaleString("fr-FR"):""}.</div>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {r.status!=="annule"&&can(currentUser,"entrees-np","w")&&<button onClick={()=>{setEditing(r.id);setForm({...r});setShow(true);setSelected(null);}} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>✏️ Modifier</button>}
            <button onClick={()=>printReception(r)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
            {r.status!=="annule"&&can(currentUser,"entrees-np","w")&&<button onClick={()=>{setCancelError("");setCancelling(r);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:12}}>🚫 Annuler</button>}
          </div>
        </div>
        <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon d'entrée ?">
          {cancelling&&(
            <div>
              <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
                Le bon <b>{cancelling.reference}</b> sera marqué "annulé" (jamais supprimé) et les quantités seront retirées du stock, sauf si une partie a déjà été transférée à un service.
              </div>
              {cancelError&&<Alert type="warn">{cancelError}</Alert>}
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={async()=>{
                  try{ await store.cancelEntreeNp(cancelling.id); setCancelling(null); setSelected(null); }
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
      <PageHeader pageId="entrees-np" title="📦 Bon d'Entrée (Non Pharmaceutique)" subtitle={activeSupplier?.name||"Tous fournisseurs"}>
        {can(currentUser,"entrees-np","w")&&<button onClick={openNew} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau bon</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {/* Formulaire */}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #059669"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#065f46"}}>📦 {editing?"Modifier":"Nouveau"} Bon d'Entrée (Non Pharmaceutique)</div>
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
                    onKeyDown={handleSearchKeyDown}
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
            {showScanner&&<BarcodeScanner onDetected={code=>{setShowScanner(false);const matches=suppProds.filter(x=>[x.barcode1,x.barcode2,x.barcode3].includes(code));if(matches.length>1){setBarcodeChoices(matches);return;}const p=matches[0]||suppProds.find(x=>x.name.toLowerCase().includes(code.toLowerCase()));if(p)addItem(p);else setSearch(code);}} onClose={()=>setShowScanner(false)}/>}
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
            <div style={{marginBottom:10}}><label style={label}>Observations</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>

            {/* Pièce jointe : bon de livraison scanné, facture fournisseur, photo
                des produits reçus... Excel/PDF/Word/image, ou prise de photo
                directe sur mobile (capture="environment"). */}
            <div style={{marginBottom:10}}>
              <label style={label}>Scanner un document <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(Excel, PDF, Word ou photo — remplit la liste automatiquement, à réviser avant confirmation · 700 Ko max)</span></label>
              {attachError&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"6px 10px",fontSize:11,marginBottom:6}}>{attachError}</div>}
              {scanMsg&&<div style={{background:scanMsg.startsWith("✅")?"#f0fdf4":"#fef3c7",color:scanMsg.startsWith("✅")?"#166534":"#92400e",borderRadius:8,padding:"6px 10px",fontSize:11,marginBottom:6}}>{scanMsg}</div>}
              {form.attachmentUrl?(
                <div style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"8px 10px"}}>
                  {form.attachmentType?.startsWith("image/")
                    ? <img src={form.attachmentUrl} alt="pièce jointe" style={{width:40,height:40,objectFit:"cover",borderRadius:6}}/>
                    : <span style={{fontSize:22}}>📄</span>}
                  <div style={{flex:1,fontSize:12,color:"#166534",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{form.attachmentName}</div>
                  <button onClick={()=>setForm(f=>({...f,attachmentUrl:"",attachmentName:"",attachmentType:""}))} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
                </div>
              ):(
                <div style={{display:"flex",gap:8}}>
                  <label style={{...btn(),background:"#eef2ff",color:"#4f46e5",border:"1px solid #c7d2fe",fontSize:12,flex:1,textAlign:"center",cursor:"pointer"}}>
                    {uploadingAttachment||scanning?"⏳ Analyse...":"📄 Scanner"}
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" style={{display:"none"}}
                      onChange={e=>handleAttachmentUpload(e.target.files?.[0])}/>
                  </label>
                  <label style={{...btn(),background:"#eef2ff",color:"#4f46e5",border:"1px solid #c7d2fe",fontSize:12,flex:1,textAlign:"center",cursor:"pointer"}}>
                    📷 Prendre une photo
                    <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                      onChange={e=>handleAttachmentUpload(e.target.files?.[0])}/>
                  </label>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving||form.items.length===0}
                style={{...btn(),background:form.items.length===0?"#cbd5e1":"#059669",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Enregistrement...":"✅ Valider le bon d'entrée"}
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
            <div style={{marginBottom:8}}><label style={label}>Référence</label><input style={input} value={filters.reference} onChange={e=>setFilters(f=>({...f,reference:e.target.value}))} placeholder="Ex: BON-ENT-NP-..."/></div>
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
        {receptions.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun bon d'entrée (non pharmaceutique) ne correspond à ce filtre.":"Aucun bon d'entrée (non pharmaceutique)."}</div>}
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
      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon d'entrée ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Le bon <b>{cancelling.reference}</b> sera marqué "annulé" (jamais supprimé) et les quantités seront retirées du stock, sauf si une partie a déjà été transférée à un service.
            </div>
            {cancelError&&<Alert type="warn">{cancelError}</Alert>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={async()=>{
                try{ await store.cancelEntreeNp(cancelling.id); setCancelling(null); setSelected(null); }
                catch(e){ setCancelError(e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
      <ScanReviewModal open={reviewOpen} onClose={()=>{setReviewOpen(false);setScanResult(null);}}
        scanResult={scanResult} allProducts={store.products} activeSupplier={activeSupplier}
        onConfirm={handleConfirmScan} mode="bon"/>
      <Modal open={!!barcodeChoices} onClose={()=>setBarcodeChoices(null)} title="📦 Plusieurs produits correspondent">
        {barcodeChoices&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Ce code-barre correspond à {barcodeChoices.length} produits chez ce fournisseur (doublon de saisie possible). Choisissez lequel ajouter :</div>
            {barcodeChoices.map(p=>(
              <button key={p.id} onClick={()=>{addItem(p);setBarcodeChoices(null);}}
                style={{...btn(),background:"#ecfeff",color:"#0891b2",border:"1px solid #a5f3fc",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:8,display:"block"}}>
                <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
              </button>
            ))}
            <button onClick={()=>setBarcodeChoices(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",width:"100%",padding:10,marginTop:4}}>Annuler</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
