import { useState, useRef } from "react";
import { genId, fmtDate } from "../../constants";
import { PageHeader } from "../ui/PageHeader";
import { can, visibleServices, hasServiceAccess, hasSupplierAccess, productAllowedForService, productVisibleInCircuit } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner, ScanReviewModal } from "../ui/ScanReviewModal";
import { getFonctPharmacyStock2, getNpPharmacyStock2 } from "../../helpers/stock2";
import { PrintModal, SortieComptaPrint } from "../print/PrintTemplates";
import { getPrintModel } from "../../helpers/printModels";
import { productGroupe } from "../../helpers/nomenclature";
import { Modal } from "../ui/Modal";
import { scanDocumentWithAI } from "../../hooks/useAI";
import { getComptaCircuits, availableCircuits } from "../../helpers/circuitsConfig";
import { CircuitSelector } from "../ui/CircuitSelector";

// Bon de sortie — Comptabilité Matières (Fonctionnement/Non-Pharmaceutique).
// Envoi DIRECT vers le service, sans étape de contrôle/confirmation (convenu
// explicitement) — à la différence des Transferts du circuit vente. Pour un
// circuit qui accepte les demandes (Non-Pharmaceutique), peut répondre à une
// demande en attente : items pré-remplis, quantités ajustables/retirables,
// la demande garde la trace demandé/envoyé une fois le bon validé.
// Motifs de sortie définitive (Instruction générale, art. 9 et 12 ; doc. de
// formation diapos 44 à 53) et pièces justificatives correspondantes. « hors »
// = pas de destinataire : les matières quittent l'existant.
const SORTIE_MOTIFS = [
  { id:"consommation", label:"Consommation (remise à un service)", destLabel:"", hors:false, piecesObligatoires:false,
    pieces:"bon de sortie définitive (et fiches de consommation de stock si le détenteur gère un stock important)", placeholder:"Optionnel — ex. demande du service n°…" },
  { id:"cession", label:"Transfert / affectation à une autre structure", destLabel:"", hors:false, piecesObligatoires:true,
    pieces:"décision ou convention, acte de dépôt (ou PV de réforme si matériel réformé)", placeholder:"Ex. Convention n°… du …, acte de dépôt n°…" },
  { id:"peremption", label:"Destruction de produits périmés", destLabel:"Destruction (produits périmés)", hors:true, piecesObligatoires:true,
    pieces:"PV de réforme, PV de destruction", placeholder:"Ex. PV de réforme n°… du …, PV de destruction n°…" },
  { id:"reforme", label:"Réforme (vente ou destruction)", destLabel:"Réforme", hors:true, piecesObligatoires:true,
    pieces:"PV de réforme, PV de vente ou de destruction (acte de vente / bon à enlever en cas de vente)", placeholder:"Ex. PV de réforme n°…, PV de vente n°…" },
  { id:"perte", label:"Perte, disparition, déficit constaté", destLabel:"Perte / déficit", hors:true, piecesObligatoires:true,
    pieces:"relevé récapitulatif, PV de recensement, certificat administratif", placeholder:"Ex. PV de recensement n°…, certificat administratif n°…" },
];

export function SortiesComptaPage({store,activeSupplier,currentUser}){
  const COMPTA_CIRCUITS = getComptaCircuits(store);
  const available = availableCircuits(currentUser,"sorties");
  const [circuit,setCircuit] = useState(available[0]||"fonctionnement");
  const cfg = COMPTA_CIRCUITS[circuit];
  const getPharmacyStock2 = circuit==="fonctionnement" ? getFonctPharmacyStock2 : getNpPharmacyStock2;
  const sortiesData = circuit==="fonctionnement" ? (store.sortiesFonct||[]) : (store.sortiesNp||[]);
  const addSortie = circuit==="fonctionnement" ? store.addSortieFonct : store.addSortieNp;
  const updateSortie = circuit==="fonctionnement" ? store.updateSortieFonct : store.updateSortieNp;
  const cancelSortie = circuit==="fonctionnement" ? store.cancelSortieFonct : store.cancelSortieNp;
  const returnSortieProvisoire = circuit==="fonctionnement" ? store.returnSortieProvisoireFonct : store.returnSortieProvisoireNp;
  const updateSortieItemExpiry = circuit==="fonctionnement" ? store.updateSortieFonctItemExpiry : store.updateSortieNpItemExpiry;
  const permSection = circuit==="fonctionnement" ? "sorties-fonct" : "sorties-np";
  const [respondingDemande,setRespondingDemande]=useState(null);
  const pendingDemandes = cfg.acceptsDemandes ? (store.demandes||[]).filter(d=>d.circuit===circuit && d.status==="attente") : [];
  const [show,setShow]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [cancelling,setCancelling]=useState(null);
  const [returningProvisoire,setReturningProvisoire]=useState(null);
  const [returnError,setReturnError]=useState("");
  const [editingExpiry,setEditingExpiry]=useState(null);
  const [expiryDrafts,setExpiryDrafts]=useState({});
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",serviceId:"",beneficiaireId:"",createdBy:"",status:"",nature:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const [form,setForm]=useState({reference:"",serviceId:"",beneficiaireId:"",destType:"service",items:[],notes:"",sourceRef:"",nature:"definitive",motif:"consommation",piecesJustificatives:"",exceptionGroupe2:false});
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
    .filter(p=>productVisibleInCircuit(p,circuit,store.suppliers))
    .filter(p=>productAllowedForService(p,form.serviceId,store.suppliers));
  const filtered=search.trim()?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())):suppProds;
  const selectedSvc=store.services?.find(s=>s.id===form.serviceId);
  const selectedBenef=(store.beneficiaires||[]).find(b=>b.id===form.beneficiaireId);
  const isProvisoire = form.nature==="provisoire";
  const motifDef = SORTIE_MOTIFS.find(m=>m.id===(form.motif||"consommation")) || SORTIE_MOTIFS[0];
  // Destinataire : service (consommation), autre structure (cession), ou
  // aucun (réforme, destruction, perte — les matières quittent l'existant).
  const needsDest = isProvisoire || !motifDef.hors;
  const isBenef = isProvisoire ? form.destType==="beneficiaire" : motifDef.id==="cession";
  const destOk = !needsDest || (isBenef ? !!form.beneficiaireId : !!form.serviceId);
  const needsPieces = !isProvisoire && motifDef.piecesObligatoires;
  // Groupe 2 (consommables) en sortie provisoire : non prévu par l'Instruction
  // générale (réservée au matériel du 1er groupe : réparation, prêt, location).
  const itemsGroupe2 = isProvisoire ? form.items.filter(it=>productGroupe(store.products.find(p=>p.id===it.productId))==="2") : [];
  // Destination du bon : service interne OU autre structure (bénéficiaire).
  // Le nom est copié dans serviceName pour que listes, impressions et
  // rapports (qui affichent tous serviceName) fonctionnent sans changement.
  const destPayload = () => {
    const common = { motif: isProvisoire ? "" : motifDef.id, piecesJustificatives:(form.piecesJustificatives||"").trim(), exceptionGroupe2: isProvisoire && itemsGroupe2.length>0 };
    if (!needsDest) return { ...common, serviceId:"", beneficiaireId:"", beneficiaireName:"", serviceName:motifDef.destLabel };
    return isBenef
      ? { ...common, serviceId:"", serviceName:selectedBenef?.name||"", beneficiaireId:form.beneficiaireId, beneficiaireName:selectedBenef?.name||"" }
      : { ...common, beneficiaireId:"", beneficiaireName:"", serviceName:selectedSvc?.name };
  };

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      const dispo=getPharmacyStock2(store,prod.id);
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
  // Le document scanné a-t-il déjà été importé ? On compare son numéro
  // PROPRE (extrait par l'IA) à celui déjà enregistré sur un bon existant du
  // même circuit et du même fournisseur — jamais bloquant en soi, juste un
  // avertissement avant de continuer.
  const [duplicateWarning,setDuplicateWarning] = useState(null); // { existing, result }
  const findDuplicateByNumeroSource = (numeroSource) => {
    if (!numeroSource?.trim()) return null;
    const needle = numeroSource.trim().toLowerCase();
    return (sortiesData||[]).find(b=>
      b.status!=="annule" && b.sourceRef?.trim().toLowerCase()===needle &&
      (!activeSupplier || b.supplierId===activeSupplier.id)
    ) || null;
  };

  const handleScan = async(file) => {
    if(!file) return;
    setScanning(true); setScanMsg("📄 Analyse du document en cours...");
    try {
      const result = await scanDocumentWithAI(file, suppProds);
      if(result.success && result.items?.length>0){
        setScanMsg("");
        const dup = findDuplicateByNumeroSource(result.numeroSource);
        if (dup) { setDuplicateWarning({ existing:dup, result }); setScanning(false); return; }
        setScanResult(result); setReviewOpen(true);
      }
      else setScanMsg("⚠️ "+(result.error||"Aucun article détecté dans ce document."));
    } catch(e){ setScanMsg("❌ Erreur scan : "+e.message); }
    setScanning(false);
  };

  const handleConfirmScan = async(selectedRows) => {
    setReviewOpen(false);
    const newProds = selectedRows.filter(r=>r.isNew && r.productName?.trim());
    let newlyCreated = [];
    for (const np of newProds) {
      const id = await store.addProduct({name:np.productName.trim(), price:Number(np.unitPrice||0), unit:np.unit||"Boîte", supplierId:activeSupplier?.id||"", circuits:[circuit]});
      newlyCreated.push({...np, productId:id});
    }
    const items = selectedRows.map(r=>{
      const prodId = r.isNew ? (newlyCreated.find(nc=>nc.productName===r.productName)?.productId||"") : r.productId;
      const knownProd = suppProds.find(p=>p.id===prodId);
      if (!prodId) return null;
      const dispo = getPharmacyStock2(store,prodId);
      return { productId:prodId, productName:knownProd?.name||r.productName||"", qty:String(Math.min(Number(r.qty)||0,dispo)), stockDispo:dispo };
    }).filter(Boolean);
    setForm(f=>{
      const merged=[...f.items];
      for(const ni of items){
        const idx=merged.findIndex(x=>x.productId===ni.productId);
        if(idx>=0) merged[idx]={...merged[idx],qty:String(Math.min(Number(merged[idx].qty||0)+Number(ni.qty||0), ni.stockDispo))};
        else merged.push(ni);
      }
      return {...f, sourceRef: scanResult?.numeroSource||f.sourceRef, items: merged.length>0?merged:f.items};
    });
    setScanMsg("✅ "+items.length+" article(s) importé(s) — vérifiez les quantités avant d'envoyer"+(newProds.length>0?" · "+newProds.length+" nouveau(x) produit(s) créé(s)":""));
    setTimeout(()=>setScanMsg(""),8000);
    setScanResult(null);
  };

  const save=async()=>{
    if(!destOk){setMsg(isBenef?"⚠️ Sélectionnez un bénéficiaire.":"⚠️ Sélectionnez un service.");return;}
    if(needsPieces && !(form.piecesJustificatives||"").trim()){setMsg("⚠️ "+motifDef.label+" : indiquez les pièces justificatives ("+motifDef.pieces+").");return;}
    if(itemsGroupe2.length>0 && !form.exceptionGroupe2){setMsg("⚠️ Sortie provisoire de consommables (groupe 2) : cochez la case de confirmation ou faites une sortie définitive.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    for (const it of form.items) {
      const dispo = getPharmacyStock2(store, it.productId);
      if (Number(it.qty) > dispo) { setMsg(`⚠️ "${it.productName}" : quantité (${it.qty}) supérieure au stock disponible (${dispo}).`); return; }
    }
    setSaving(true);
    try{
      if (editingId) {
        await updateSortie(editingId, {...form,...destPayload()});
        setMsg("✅ Bon de sortie modifié.");
      } else {
        await addSortie({...form,supplierId:activeSupplier?.id,...destPayload(),demandeId:respondingDemande?.id||null});
        setMsg(respondingDemande?"✅ Bon de sortie envoyé — la demande est marquée traitée.":"✅ Bon de sortie envoyé.");
      }
      setForm({reference:"",serviceId:"",beneficiaireId:"",destType:"service",items:[],notes:"",sourceRef:"",nature:"definitive",motif:"consommation",piecesJustificatives:"",exceptionGroupe2:false});
      setEditingId(null);
      setRespondingDemande(null);
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  // Répondre à une demande : pré-remplit le service et les produits (quantité
  // demandée, plafonnée au stock disponible) — le comptable peut encore tout
  // ajuster ou retirer un article avant d'envoyer.
  const startFromDemande = (d) => {
    setEditingId(null);
    setRespondingDemande(d);
    setForm({
      reference:"", serviceId:d.serviceId, beneficiaireId:"", destType:"service", notes:"", sourceRef:"", nature:"definitive", motif:"consommation", piecesJustificatives:"", exceptionGroupe2:false,
      items:(d.items||[]).map(it=>{
        const dispo = getPharmacyStock2(store, it.productId);
        return { productId:it.productId, productName:it.productName, qty:String(Math.min(Number(it.qtyDemandee)||0,dispo)), stockDispo:dispo };
      }),
    });
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const openEdit=(s)=>{
    setEditingId(s.id);
    setRespondingDemande(null);
    setForm({reference:s.reference, serviceId:s.serviceId||"", beneficiaireId:s.beneficiaireId||"", destType:s.beneficiaireId?"beneficiaire":"service", items:(s.items||[]).map(it=>({productId:it.productId,productName:it.productName,qty:String(it.qty),stockDispo:getPharmacyStock2(store,it.productId)})), notes:s.notes||"", sourceRef:s.sourceRef||"", nature:s.nature||"definitive", motif:s.motif||(s.beneficiaireId?"cession":"consommation"), piecesJustificatives:s.piecesJustificatives||"", exceptionGroupe2:!!s.exceptionGroupe2});
    setShow(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const resetOrClose=()=>{ setShow(false); setEditingId(null); setRespondingDemande(null); setForm({reference:"",serviceId:"",beneficiaireId:"",destType:"service",items:[],notes:"",sourceRef:"",nature:"definitive",motif:"consommation",piecesJustificatives:"",exceptionGroupe2:false}); };

  const sorties=(sortiesData||[]).filter(s=>(activeSupplier?s.supplierId===activeSupplier?.id:hasSupplierAccess(currentUser,s.supplierId))&&hasServiceAccess(currentUser,s.serviceId))
    .filter(s=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = s.createdAt?.seconds ? new Date(s.createdAt.seconds*1000) : null;
        if (!d) return false;
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
      }
      if (filters.serviceId && s.serviceId!==filters.serviceId) return false;
      if (filters.beneficiaireId && s.beneficiaireId!==filters.beneficiaireId) return false;
      if (filters.createdBy && s.sentBy!==filters.createdBy) return false;
      if (filters.status && s.status!==filters.status) return false;
      if (filters.nature && (s.nature||"definitive")!==filters.nature) return false;
      return true;
    });

  const statusBadge=(s)=>{
    if(s.status==="annule") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulé</span>;
    if(s.status==="retournee") return <span style={{background:"#ede9fe",color:"#6d28d9",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>↩️ Retournée</span>;
    if(s.nature==="provisoire") return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente de retour</span>;
    return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Envoyé (définitive)</span>;
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId={permSection} title={"📤 Bon de Sortie — "+cfg.label} subtitle={"Pharmacie → Services · "+(activeSupplier?.name||"")}>
        {can(currentUser,permSection,"w")&&<button onClick={()=>{setEditingId(null);setRespondingDemande(null);setForm({reference:"",serviceId:"",beneficiaireId:"",destType:"service",items:[],notes:"",sourceRef:"",nature:"definitive",motif:"consommation",piecesJustificatives:"",exceptionGroupe2:false});setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        <CircuitSelector circuit={circuit} setCircuit={c=>{setCircuit(c);setShow(false);setEditingId(null);setRespondingDemande(null);}} available={available} circuits={COMPTA_CIRCUITS}/>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {cfg.acceptsDemandes&&pendingDemandes.length>0&&!show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #6d28d9",background:"#faf5ff"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#6d28d9",marginBottom:8}}>📝 {pendingDemandes.length} demande(s) en attente</div>
            {pendingDemandes.map(d=>(
              <div key={d.id} onClick={()=>startFromDemande(d)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",borderRadius:8,padding:"8px 10px",marginBottom:6,cursor:"pointer"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:12}}>{d.serviceName}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{(d.items||[]).length} produit(s) · {d.createdAt?.seconds?new Date(d.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"—"}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();startFromDemande(d);}} style={{...btn(),background:"#6d28d9",color:"white",fontSize:11}}>Répondre</button>
              </div>
            ))}
          </div>
        )}

        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #ea580c"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:"#9a3412"}}>📤 {editingId?"Modifier le Bon de Sortie":respondingDemande?"Réponse à la demande de "+respondingDemande.serviceName:"Nouveau Bon de Sortie"}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:12}}>N° : {form.reference||"attribué à l'enregistrement (série de la gestion)"}</div>
            {respondingDemande&&<div style={{fontSize:11,color:"#6d28d9",fontWeight:600,marginBottom:10}}>📝 Réponse à une demande — service fixé, retirez ou ajustez les produits ci-dessous si besoin.</div>}
            <div style={{marginBottom:10}}>
              <label style={label}>Nature de la sortie</label>
              <div style={{display:"flex",gap:8}}>
                <label style={{...btn(),flex:1,textAlign:"center",cursor:"pointer",background:form.nature!=="provisoire"?"#ea580c":"white",color:form.nature!=="provisoire"?"white":"#9a3412",border:"1px solid #fdba74",fontSize:12}}>
                  <input type="radio" name="nature" checked={form.nature!=="provisoire"} onChange={()=>setForm(f=>({...f,nature:"definitive",destType:f.motif==="cession"?"beneficiaire":"service"}))} style={{display:"none"}}/>
                  Définitive
                </label>
                <label style={{...btn(),flex:1,textAlign:"center",cursor:"pointer",background:form.nature==="provisoire"?"#7c3aed":"white",color:form.nature==="provisoire"?"white":"#6d28d9",border:"1px solid #c4b5fd",fontSize:12}}>
                  <input type="radio" name="nature" checked={form.nature==="provisoire"} onChange={()=>setForm(f=>({...f,nature:"provisoire"}))} style={{display:"none"}}/>
                  Provisoire
                </label>
              </div>
              {form.nature==="provisoire"&&<div style={{fontSize:10,color:"#6d28d9",marginTop:4}}>Matériel du 1er groupe sorti momentanément (réparation, prêt, location) : n'affecte pas l'existant, inscrit pour mémoire jusqu'à son retour.</div>}
            </div>
            {!isProvisoire&&(
              <div style={{marginBottom:10}}>
                <label style={label}>Motif de la sortie définitive</label>
                <select style={input} value={form.motif||"consommation"} disabled={!!editingId||!!respondingDemande}
                  onChange={e=>{const m=e.target.value; setForm(f=>({...f,motif:m,destType:m==="cession"?"beneficiaire":"service",serviceId:m==="consommation"?f.serviceId:"",beneficiaireId:m==="cession"?f.beneficiaireId:""}));}}>
                  {SORTIE_MOTIFS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <div style={{fontSize:10.5,color:"#64748b",marginTop:3}}>Pièces : {motifDef.pieces}</div>
              </div>
            )}


            {needsDest&&(
            <div style={{marginBottom:10}}>
              <label style={label}>Destinataire</label>
              {isProvisoire&&!respondingDemande&&!editingId&&(
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <button type="button" onClick={()=>setForm(f=>({...f,destType:"service",beneficiaireId:"",items:[]}))} style={{...btn(),flex:1,fontSize:12,background:!isBenef?"#ea580c":"white",color:!isBenef?"white":"#9a3412",border:"1px solid #fdba74"}}>🏥 Service de l'hôpital</button>
                  <button type="button" onClick={()=>setForm(f=>({...f,destType:"beneficiaire",serviceId:"",items:[]}))} style={{...btn(),flex:1,fontSize:12,background:isBenef?"#0f766e":"white",color:isBenef?"white":"#0f766e",border:"1px solid #5eead4"}}>🤝 Autre structure</button>
                </div>
              )}
              {isBenef?(
                <>
                  <select style={input} value={form.beneficiaireId} onChange={e=>setForm(f=>({...f,beneficiaireId:e.target.value}))} disabled={!!editingId}>
                    <option value="">— Choisir un bénéficiaire —</option>
                    {(store.beneficiaires||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {(store.beneficiaires||[]).length===0&&<div style={{fontSize:10,color:"#b45309",marginTop:4}}>Aucun bénéficiaire enregistré — ajoutez-en dans Paramètres › Bénéficiaires.</div>}
                </>
              ):(
                <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value}))} disabled={!!respondingDemande||!!editingId}>
                  <option value="">— Choisir un service —</option>
                  {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
            )}
            {!isProvisoire&&(
              <div style={{marginBottom:10}}>
                <label style={label}>Pièces justificatives {needsPieces?<span style={{color:"#dc2626"}}>*</span>:<span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span>}</label>
                <input style={input} value={form.piecesJustificatives||""} onChange={e=>setForm(f=>({...f,piecesJustificatives:e.target.value}))}
                  placeholder={motifDef.placeholder}/>
                {motifDef.id==="cession"&&<div style={{fontSize:10,color:"#b45309",marginTop:3}}>La cession gratuite de matières est interdite : la sortie vers une autre structure doit reposer sur une décision ou un acte (convention, ordre de l'autorité, acte de dépôt).</div>}
              </div>
            )}
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
              {form.serviceId&&!isBenef&&<div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Seuls les produits ({cfg.label}) autorisés pour ce service sont proposés.</div>}
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
                      <div style={{fontSize:11,color:"#64748b"}}>Stock dispo : {getPharmacyStock2(store,p.id)}</div>
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
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {itemsGroupe2.length>0&&(
                <div style={{background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:8,padding:"8px 10px",fontSize:11,color:"#92400e",marginBottom:8,flexBasis:"100%"}}>
                  ⚠️ {itemsGroupe2.map(i=>i.productName).join(", ")} : matière(s) du 2e groupe (consommables). L'Instruction générale réserve la sortie provisoire au matériel du 1er groupe ; un consommable remis est normalement une sortie définitive.
                  <label style={{display:"flex",gap:6,alignItems:"center",marginTop:6,fontWeight:600,cursor:"pointer"}}>
                    <input type="checkbox" checked={!!form.exceptionGroupe2} onChange={e=>setForm(f=>({...f,exceptionGroupe2:e.target.checked}))}/>
                    Je confirme cette sortie provisoire (prêt à retourner à l'identique)
                  </label>
                </div>
              )}
              <button onClick={save} disabled={saving||!destOk||form.items.length===0}
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
          {hasActiveFilters&&<button onClick={()=>setFilters({dateFrom:"",dateTo:"",serviceId:"",beneficiaireId:"",createdBy:"",status:"",nature:""})} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Réinitialiser</button>}
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
            {(store.beneficiaires||[]).length>0&&<div style={{marginBottom:8}}><label style={label}>Bénéficiaire (autre structure)</label>
              <select style={input} value={filters.beneficiaireId} onChange={e=>setFilters(f=>({...f,beneficiaireId:e.target.value}))}>
                <option value="">— Tous —</option>
                {(store.beneficiaires||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
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
                <option value="envoye">✅ Envoyé</option>
                <option value="annule">🚫 Annulé</option>
                <option value="retournee">↩️ Retournée</option>
              </select>
            </div>
            <div style={{marginTop:8}}><label style={label}>Nature</label>
              <select style={input} value={filters.nature} onChange={e=>setFilters(f=>({...f,nature:e.target.value}))}>
                <option value="">— Toutes —</option>
                <option value="definitive">Définitive</option>
                <option value="provisoire">Provisoire</option>
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
                <div style={{fontWeight:700,fontSize:13}}>📤 → {s.serviceName||"—"}{s.beneficiaireId&&<span style={{marginLeft:6,fontSize:10,fontWeight:700,background:"#ccfbf1",color:"#0f766e",borderRadius:99,padding:"1px 7px"}}>🤝 Autre structure</span>} <span style={{fontWeight:400,fontSize:11,color:"#94a3b8"}}>({s.reference||"—"})</span></div>
                <div style={{fontSize:11,color:"#64748b"}}>{s.sentByName} · {s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}{s.dateOperation?<b> · opération du {fmtDate(s.dateOperation)}</b>:null}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {statusBadge(s)}
                <span style={{background:"#ffedd5",color:"#9a3412",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(s.items||[]).length} produit(s)</span>
              </div>
            </div>
            {(s.items||[]).some(it=>it.expiry)&&(
              <button onClick={e=>{e.stopPropagation();setEditingExpiry(s);setExpiryDrafts(Object.fromEntries((s.items||[]).map(it=>[it.productId,it.expiry||""])));}}
                style={{...btn(),background:"#f8fafc",color:"#64748b",border:"1px solid #e2e8f0",fontSize:10,marginTop:6,padding:"3px 8px"}}>
                📅 Péremption la plus proche : {fmtDate((s.items||[]).filter(it=>it.expiry).sort((a,b)=>a.expiry<b.expiry?-1:1)[0]?.expiry)} ✏️
              </button>
            )}
            {s.status!=="annule"&&can(currentUser,permSection,"w")&&(
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <button onClick={e=>{e.stopPropagation();openEdit(s);}} style={{...btn(),background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",fontSize:11}}>✏️ Modifier</button>
                <button onClick={e=>{e.stopPropagation();setCancelling(s);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:11}}>🚫 Annuler</button>
                {s.nature==="provisoire"&&s.status==="envoye"&&(
                  <button onClick={e=>{e.stopPropagation();setReturningProvisoire(s);}} style={{...btn(),background:"#ede9fe",color:"#6d28d9",border:"1px solid #c4b5fd",fontSize:11}}>↩️ Marquer comme retournée</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title={"Bon de Sortie — "+cfg.label} reference={"BON DE SORTIE N° "+(printSel?.reference||"")+" — "+cfg.label} landscape signatories={getPrintModel(store,printSel?.nature==="provisoire"?"sortie_prov":"sortie_def").signers}>
        <SortieComptaPrint s={printSel} products={store.products} circuitLabel={cfg.label} model={getPrintModel(store,printSel?.nature==="provisoire"?"sortie_prov":"sortie_def")}/>
      </PrintModal>
      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler ce bon de sortie ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Ce bon de sortie vers <b>{cancelling.serviceName}</b> sera marqué "annulé" (jamais supprimé) et les quantités reviendront au stock pharmacie.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await cancelSortie(cancelling.id); setCancelling(null); }
                catch(e){ setMsg("❌ "+e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!returningProvisoire} onClose={()=>{setReturningProvisoire(null);setReturnError("");}} title="↩️ Marquer cette sortie comme retournée ?">
        {returningProvisoire&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              La sortie provisoire vers <b>{returningProvisoire.serviceName}</b> sera marquée "retournée" et les quantités reviendront au stock pharmacie — la sortie reste dans l'historique, ce n'est pas une annulation.
            </div>
            {returnError&&<Alert type="warn">{returnError}</Alert>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                setReturnError("");
                try{ await returnSortieProvisoire(returningProvisoire.id); setReturningProvisoire(null); }
                catch(e){ setReturnError(e.message); }
              }} style={{...btn(),background:"#6d28d9",color:"white",flex:1,padding:10}}>↩️ Confirmer le retour</button>
              <button onClick={()=>{setReturningProvisoire(null);setReturnError("");}} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
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
                if(val!==orig) await updateSortieItemExpiry(editingExpiry.id,pid,val);
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
                <div style={{fontSize:11,color:"#64748b"}}>Stock dispo : {getPharmacyStock2(store,p.id)}</div>
              </button>
            ))}
            <button onClick={()=>setBarcodeChoices(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",width:"100%",padding:10,marginTop:4}}>Annuler</button>
          </div>
        )}
      </Modal>
      <ScanReviewModal open={reviewOpen} onClose={()=>{setReviewOpen(false);setScanResult(null);}}
        scanResult={scanResult} allProducts={store.products} activeSupplier={activeSupplier}
        onConfirm={handleConfirmScan} mode="bon"/>
      <Modal open={!!duplicateWarning} onClose={()=>setDuplicateWarning(null)} title="⚠️ Ce document a peut-être déjà été importé">
        {duplicateWarning&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Un Bon de Sortie portant le même numéro de document (<b>{duplicateWarning.result.numeroSource}</b>) existe déjà :
            </div>
            <div style={{background:"#fef3c7",borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12}}>
              <div style={{fontWeight:700}}>{duplicateWarning.existing.reference}</div>
              <div style={{color:"#92400e"}}>{(duplicateWarning.existing.items||[]).length} produit(s)</div>
            </div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Si c'est bien le même document, ne l'importez pas une seconde fois. Sinon (correction, deuxième page...), vous pouvez continuer.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{ setScanResult(duplicateWarning.result); setReviewOpen(true); setDuplicateWarning(null); }}
                style={{...btn(),background:"#fee2e2",color:"#ef4444",flex:1,padding:10}}>Continuer quand même</button>
              <button onClick={()=>setDuplicateWarning(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler l'import</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
