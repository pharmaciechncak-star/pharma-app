import { useState } from "react";
import { fmtDate } from "../../constants";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { productVisibleInCircuit, hasSupplierAccess, visibleServices } from "../../permissions";
import { PrintModal, GrandLivrePrint, FicheStockPrint, ConsommationMatieresPrint, BalancePeriodiquePrint, LivreJournalPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";
import { getComptaCircuits, availableCircuits } from "../../helpers/circuitsConfig";
import { CircuitSelector } from "../ui/CircuitSelector";
import { downloadExcelTable } from "../../helpers/exportUtils";
import { downloadPdfTable, fmtNumPdf } from "../../helpers/pdfUtils";

// Rapports comptables standards (comptabilité matières publique) — communs
// à Fonctionnement et Non-Pharmaceutique : Grand Livre des Comptes (valorisé,
// P.U./Montant) et Fiche de Stock (quantités, suivi Entrée/Sortie). Les deux
// suivent, pour un produit donné, tous ses mouvements avec un solde
// ("Existant"/"Stock") couru — reconstruits à partir des Bons d'Entrée et de
// Sortie déjà en place, jamais une donnée séparée à ressaisir.
export function StatistiquesComptaPage({store,activeSupplier,currentUser}){
  const COMPTA_CIRCUITS = getComptaCircuits(store);
  const available = availableCircuits(currentUser,"statistiques");
  const [circuit,setCircuit] = useState(available[0]||"fonctionnement");
  const cfg = COMPTA_CIRCUITS[circuit];
  const entreesData = circuit==="fonctionnement" ? (store.entreesFonct||[]) : (store.entreesNp||[]);
  const sortiesData = circuit==="fonctionnement" ? (store.sortiesFonct||[]) : (store.sortiesNp||[]);
  const permSection = circuit==="fonctionnement" ? "statistiques-fonct" : "statistiques-np";
  const [productId,setProductId] = useState("");
  const [search,setSearch] = useState("");
  const [showResults,setShowResults] = useState(false);
  const [periodFrom,setPeriodFrom] = useState("");
  const [periodTo,setPeriodTo] = useState("");
  const [showGrandLivre,setShowGrandLivre] = useState(false);
  const [showFicheStock,setShowFicheStock] = useState(false);
  const [serviceId,setServiceId] = useState("");
  const [showConsoMatieres,setShowConsoMatieres] = useState(false);
  const [showTotaux,setShowTotaux] = useState(false);
  const [showBalance,setShowBalance] = useState(false);
  const [showLivreJournal,setShowLivreJournal] = useState(false);
  const [filterType,setFilterType] = useState("");

  // Périmètre (fournisseur actif, type) — sert de base à la Balance
  // Périodique (TOUS les produits) et au sélecteur ci-dessous ; la recherche
  // texte ne doit filtrer QUE le sélecteur, jamais la Balance Périodique.
  const products = store.products
    .filter(p=>productVisibleInCircuit(p,circuit,store.suppliers))
    .filter(p=>!filterType||p.typeFonct===filterType)
    .filter(p=>activeSupplier?p.supplierId===activeSupplier.id:hasSupplierAccess(currentUser,p.supplierId));
  // Résultats affichés dans le menu déroulant de recherche (clic pour choisir).
  const searchResults = search.trim()
    ? products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
    : products;
  const product = store.products.find(p=>p.id===productId);

  // Montant total des entrées et des sorties sur la période — tous produits
  // confondus (scopé au fournisseur actif si un fournisseur est sélectionné,
  // comme le reste de la page), pour une vue d'ensemble rapide sans avoir à
  // choisir un produit précis.
  const globalTotals = () => {
    let totalEntrees = 0, totalSorties = 0;
    (entreesData||[]).forEach(e=>{
      if (e.status==="annule") return;
      if (activeSupplier && e.supplierId!==activeSupplier.id) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      if (periodFrom && d<periodFrom) return;
      if (periodTo && d>periodTo) return;
      (e.items||[]).forEach(it=>{
        const p = store.products.find(x=>x.id===it.productId);
        totalEntrees += (Number(it.qty)||0) * (Number(p?.price)||0);
      });
    });
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule") return;
      if (activeSupplier && s.supplierId!==activeSupplier.id) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      if (periodFrom && d<periodFrom) return;
      if (periodTo && d>periodTo) return;
      (s.items||[]).forEach(it=>{
        const p = store.products.find(x=>x.id===it.productId);
        totalSorties += (Number(it.qty)||0) * (Number(p?.price)||0);
      });
    });
    return { totalEntrees, totalSorties };
  };

  // Balance Périodique : une ligne par produit du périmètre affiché (pas un
  // seul produit choisi) — solde de début de période (mouvements antérieurs),
  // entrées/sorties DE la période, solde de fin, valorisation. Un seul passage
  // sur les collections, agrégé par produit, pour rester rapide même avec un
  // catalogue large.
  const balancePeriodiqueRows = () => {
    const agg = {}; // productId -> { avant: {e,s}, periode: {e,s} }
    const touch = pid => { if(!agg[pid]) agg[pid] = { avantE:0, avantS:0, periodeE:0, periodeS:0 }; return agg[pid]; };
    (entreesData||[]).forEach(e=>{
      if (e.status==="annule") return;
      if (activeSupplier && e.supplierId!==activeSupplier.id) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      (e.items||[]).forEach(it=>{
        const a = touch(it.productId);
        if (periodFrom && d<periodFrom) a.avantE += Number(it.qty)||0;
        else if (!periodTo || d<=periodTo) a.periodeE += Number(it.qty)||0;
      });
    });
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule") return;
      if (activeSupplier && s.supplierId!==activeSupplier.id) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      (s.items||[]).forEach(it=>{
        const a = touch(it.productId);
        if (periodFrom && d<periodFrom) a.avantS += Number(it.qty)||0;
        else if (!periodTo || d<=periodTo) a.periodeS += Number(it.qty)||0;
      });
    });
    return products.map(p=>{
      const a = agg[p.id] || { avantE:0, avantS:0, periodeE:0, periodeS:0 };
      const existantDebut = a.avantE - a.avantS;
      const totalEntree = existantDebut + a.periodeE;
      const existantFin = totalEntree - a.periodeS;
      const pu = Number(p.price)||0;
      return {
        productId:p.id, compteNumero:p.compteNumero||"", productName:p.name,
        existantDebut, entreePeriode:a.periodeE, totalEntree, sortiePeriode:a.periodeS,
        existantFin, pu, montant: existantFin*pu,
      };
    });
  };


  // Reconstruit, pour le produit choisi, la liste chronologique de tous ses
  // mouvements (entrées et sorties confondues, hors documents annulés), avec
  // le solde couru — la même donnée alimente les deux rapports.
  const buildMovements = () => {
    if (!product) return [];
    const moves = [];
    (entreesData||[]).forEach(e=>{
      if (e.status==="annule") return;
      const it = (e.items||[]).find(i=>i.productId===productId);
      if (!it) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      moves.push({ type:"entree", date:d, ts:e.createdAt?.seconds||0, bon:e.reference, qty:Number(it.qty)||0, tiers:e.supplierName||"—" });
    });
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule") return;
      const it = (s.items||[]).find(i=>i.productId===productId);
      if (!it) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      moves.push({ type:"sortie", date:d, ts:s.createdAt?.seconds||0, bon:s.reference, qty:Number(it.qty)||0, tiers:s.serviceName||"—" });
    });
    moves.sort((a,b)=>a.ts-b.ts);
    return moves
      .filter(m=>!periodFrom||m.date>=periodFrom)
      .filter(m=>!periodTo||m.date<=periodTo);
  };

  // Le solde couru doit partir de la situation réelle AVANT la période
  // affichée (pas de zéro artificiel) — on calcule donc le solde de départ à
  // partir de TOUS les mouvements antérieurs à periodFrom, même s'ils ne sont
  // pas listés dans le tableau.
  const openingBalance = () => {
    if (!product || !periodFrom) return 0;
    let bal = 0;
    const all = [];
    (entreesData||[]).forEach(e=>{
      if (e.status==="annule") return;
      const it=(e.items||[]).find(i=>i.productId===productId); if(!it) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      all.push({d, qty:Number(it.qty)||0, sign:1});
    });
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule") return;
      const it=(s.items||[]).find(i=>i.productId===productId); if(!it) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      all.push({d, qty:Number(it.qty)||0, sign:-1});
    });
    all.filter(m=>m.d<periodFrom).forEach(m=>{ bal += m.sign*m.qty; });
    return bal;
  };

  const grandLivreRows = () => {
    let existant = openingBalance();
    const pu = Number(product?.price)||0;
    return buildMovements().map(m=>{
      existant += m.type==="entree" ? m.qty : -m.qty;
      return {
        date: m.date, bon: m.bon,
        origine: m.type==="entree" ? "Entrée — "+m.tiers : "Sortie — "+m.tiers,
        entree: m.type==="entree" ? m.qty : "",
        sortie: m.type==="sortie" ? m.qty : "",
        pu, existant, montant: existant*pu,
      };
    });
  };

  const ficheStockRows = () => {
    let stock = openingBalance();
    return buildMovements().map(m=>{
      stock += m.type==="entree" ? m.qty : -m.qty;
      return {
        date: m.date,
        entreeBon: m.type==="entree" ? m.bon : "", entreeQty: m.type==="entree" ? m.qty : "",
        destinataire: m.type==="sortie" ? m.tiers : "", sortieBon: m.type==="sortie" ? m.bon : "", sortieQty: m.type==="sortie" ? m.qty : "",
        stock,
      };
    });
  };

  // Consommation Matières par service : tout ce qui a été remis à CE service
  // (Bons de Sortie) sur la période, regroupé et valorisé par produit — pas
  // de solde couru ici, juste un total par ligne (document différent du
  // Grand Livre/Fiche de Stock, qui eux suivent UN produit dans le temps).
  const consommationMatieresRows = () => {
    if (!serviceId) return [];
    const byProduct = {};
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule" || s.serviceId!==serviceId) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      if (periodFrom && d<periodFrom) return;
      if (periodTo && d>periodTo) return;
      (s.items||[]).forEach(it=>{
        if (!byProduct[it.productId]) {
          const p = store.products.find(x=>x.id===it.productId);
          byProduct[it.productId] = { productName:it.productName, compteNumero:p?.compteNumero||"", pu:Number(p?.price)||0, qty:0 };
        }
        byProduct[it.productId].qty += Number(it.qty)||0;
      });
    });
    return Object.values(byProduct).map(r=>({ ...r, montant:r.qty*r.pu }));
  };

  // Livre-Journal des mouvements des matières affectant l'existant : une
  // ligne par mouvement (entrée OU sortie) de CHAQUE produit, dans l'ordre
  // chronologique, tous produits confondus — contrairement au Grand
  // Livre/Fiche de Stock qui suivent un seul produit. La valorisation d'une
  // sortie utilise le prix courant du produit (les sorties n'enregistrent
  // pas de prix unitaire propre, contrairement aux entrées).
  const livreJournalRows = () => {
    const moves = [];
    (entreesData||[]).forEach(e=>{
      if (e.status==="annule") return;
      if (activeSupplier && e.supplierId!==activeSupplier.id) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      (e.items||[]).forEach(it=>{
        const p = store.products.find(x=>x.id===it.productId);
        moves.push({
          type:"entree", date:d, ts:e.createdAt?.seconds||0, bon:e.reference,
          compteNumero:p?.compteNumero||"", productName:it.productName||p?.name||"",
          qty:Number(it.qty)||0, unite:p?.unit||"", pu:Number(it.unitPrice)||Number(p?.price)||0,
          observations: e.supplierName?("Facture "+e.supplierName):"",
        });
      });
    });
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule") return;
      if (activeSupplier && s.supplierId!==activeSupplier.id) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      (s.items||[]).forEach(it=>{
        const p = store.products.find(x=>x.id===it.productId);
        moves.push({
          type:"sortie", date:d, ts:s.createdAt?.seconds||0, bon:s.reference,
          compteNumero:p?.compteNumero||"", productName:it.productName||p?.name||"",
          qty:Number(it.qty)||0, unite:p?.unit||"", pu:Number(p?.price)||0,
          observations: s.serviceName||"",
        });
      });
    });
    moves.sort((a,b)=>a.ts-b.ts);
    return moves
      .filter(m=>!periodFrom||m.date>=periodFrom)
      .filter(m=>!periodTo||m.date<=periodTo);
  };

  // Report — cumul de tous les mouvements antérieurs à periodFrom (jamais un
  // zéro artificiel en début de période), tous produits confondus.
  const livreJournalReport = () => {
    if (!periodFrom) return { qtyEntree:0, qtySortie:0, montantEntree:0, montantSortie:0 };
    let qtyEntree=0, qtySortie=0, montantEntree=0, montantSortie=0;
    (entreesData||[]).forEach(e=>{
      if (e.status==="annule") return;
      if (activeSupplier && e.supplierId!==activeSupplier.id) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      if (d>=periodFrom) return;
      (e.items||[]).forEach(it=>{ qtyEntree+=Number(it.qty)||0; montantEntree+=(Number(it.qty)||0)*(Number(it.unitPrice)||0); });
    });
    (sortiesData||[]).forEach(s=>{
      if (s.status==="annule") return;
      if (activeSupplier && s.supplierId!==activeSupplier.id) return;
      const d = s.createdAt?.seconds?new Date(s.createdAt.seconds*1000).toISOString().slice(0,10):"";
      if (d>=periodFrom) return;
      (s.items||[]).forEach(it=>{
        const p = store.products.find(x=>x.id===it.productId);
        qtySortie+=Number(it.qty)||0; montantSortie+=(Number(it.qty)||0)*(Number(p?.price)||0);
      });
    });
    return { qtyEntree, qtySortie, montantEntree, montantSortie };
  };

  const totals = globalTotals();

  // ── Export Excel/PDF — un bouton par rapport, dans la barre d'action de
  // l'aperçu, à côté d'Imprimer. Les deux téléchargent un vrai fichier
  // directement, sans passer par la boîte de dialogue d'impression. Le nom
  // de fichier inclut la période pour éviter les doublons. Pour le PDF, les
  // nombres passent par fmtNumPdf (espace normal) plutôt que
  // toLocaleString("fr-FR") (espace fine insécable, mal supportée par la
  // police du PDF) — Excel, lui, garde des nombres bruts pour rester calculable.
  const periodSuffix = (periodFrom||periodTo) ? "_"+(periodFrom||"debut")+"_"+(periodTo||"fin") : "";
  const periodSubtitle = "Période : "+(fmtDate(periodFrom)||"—")+" au "+(fmtDate(periodTo)||"—");
  const toPdfRows = (rows, numericIdx) => rows.map(r => r.map((c,i) => (numericIdx.includes(i) && c!=="") ? fmtNumPdf(c) : c));

  const exportGrandLivre = (fmt) => {
    const headers = ["Date","Bon","Origine / Destination","Entrées","Sorties","P.U.","Existant","Montant"];
    const rows = grandLivreRows().map(r=>[fmtDate(r.date),r.bon,r.origine,r.entree||"",r.sortie||"",r.pu,r.existant,r.montant]);
    const filename = "grand_livre_"+(product?.name||"produit")+periodSuffix;
    if (fmt==="excel") downloadExcelTable({ filename, title:"GRAND LIVRE DES COMPTES", subtitle:(product?.name||"")+" — "+periodSubtitle, headers, rows });
    else downloadPdfTable({ filename, title:"GRAND LIVRE DES COMPTES", subtitle:(product?.name||"")+" — "+periodSubtitle, headers, rows: toPdfRows(rows,[3,4,5,6,7]) });
  };
  const exportFicheStock = (fmt) => {
    const headers = ["Date","Bon entrée","Qté entrée","Destinataire","Bon sortie","Qté sortie","Stock"];
    const rows = ficheStockRows().map(r=>[fmtDate(r.date),r.entreeBon||"",r.entreeQty||"",r.destinataire||"",r.sortieBon||"",r.sortieQty||"",r.stock]);
    const filename = "fiche_stock_"+(product?.name||"produit")+periodSuffix;
    if (fmt==="excel") downloadExcelTable({ filename, title:"FICHE DE STOCK", subtitle:(product?.name||"")+" — "+periodSubtitle, headers, rows });
    else downloadPdfTable({ filename, title:"FICHE DE STOCK", subtitle:(product?.name||"")+" — "+periodSubtitle, headers, rows: toPdfRows(rows,[2,5,6]) });
  };
  const exportConsommation = (fmt) => {
    const headers = ["Produit","Compte","Quantité","P.U.","Montant"];
    const cRows = consommationMatieresRows();
    const rows = cRows.map(r=>[r.productName,r.compteNumero,r.qty,r.pu,r.montant]);
    const totalNum = cRows.reduce((s,r)=>s+r.montant,0);
    const svcName = store.services?.find(s=>s.id===serviceId)?.name||"service";
    const filename = "consommation_matieres_"+svcName+periodSuffix;
    const totalRowExcel = ["TOTAL","","","",totalNum];
    if (fmt==="excel") downloadExcelTable({ filename, title:"CONSOMMATION MATIÈRES", subtitle:svcName+" — "+periodSubtitle, headers, rows, totalRow:totalRowExcel });
    else downloadPdfTable({ filename, title:"CONSOMMATION MATIÈRES", subtitle:svcName+" — "+periodSubtitle, headers,
      rows: toPdfRows(rows,[2,3,4]), totalRow:["TOTAL","","","",fmtNumPdf(totalNum)] });
  };
  const exportBalance = (fmt) => {
    const headers = ["Compte","Désignation","Existant Début","Entrée Période","Total Entrée","Sortie Période","Existant Fin","P.U.","Montant Existant"];
    const bRows = balancePeriodiqueRows();
    const rows = bRows.map(r=>[r.compteNumero,r.productName,r.existantDebut,r.entreePeriode,r.totalEntree,r.sortiePeriode,r.existantFin,r.pu,r.montant]);
    const totalNum = bRows.reduce((s,r)=>s+r.montant,0);
    const filename = "balance_periodique"+periodSuffix;
    const totalRowExcel = ["","TOTAL","","","","","","",totalNum];
    if (fmt==="excel") downloadExcelTable({ filename, title:"BALANCE PÉRIODIQUE", subtitle:periodSubtitle, headers, rows, totalRow:totalRowExcel });
    else downloadPdfTable({ filename, title:"BALANCE PÉRIODIQUE", subtitle:periodSubtitle, headers,
      rows: toPdfRows(rows,[2,3,4,5,6,7,8]), totalRow:["","TOTAL","","","","","","",fmtNumPdf(totalNum)] });
  };
  const exportLivreJournal = (fmt) => {
    const headers = ["Date","Compte","Désignation","Bon Entrée","Qté Entrée","Bon Sortie","Qté Sortie","P.U.","Montant Entrée","Montant Sortie","Observations"];
    const jRows = livreJournalRows();
    const jReport = livreJournalReport();
    const reportRow = ["","","Reports","",jReport.qtyEntree,"",jReport.qtySortie,"",jReport.montantEntree,jReport.montantSortie,""];
    const rows = [reportRow, ...jRows.map(r=>[fmtDate(r.date),r.compteNumero,r.productName,r.type==="entree"?r.bon:"",r.type==="entree"?r.qty:"",r.type==="sortie"?r.bon:"",r.type==="sortie"?r.qty:"",r.pu,r.type==="entree"?r.qty*r.pu:"",r.type==="sortie"?r.qty*r.pu:"",r.observations])];
    const filename = "livre_journal"+periodSuffix;
    if (fmt==="excel") downloadExcelTable({ filename, title:"LIVRE-JOURNAL DES MOUVEMENTS DES MATIÈRES", subtitle:periodSubtitle, headers, rows });
    else downloadPdfTable({ filename, title:"LIVRE-JOURNAL DES MOUVEMENTS DES MATIÈRES", subtitle:periodSubtitle, headers, rows: toPdfRows(rows,[4,6,7,8,9]) });
  };



  return (
    <div style={{padding:0}}>
      <PageHeader pageId={permSection} title={"📚 Statistiques — "+cfg.label} subtitle="Grand Livre des Comptes & Fiche de Stock"/>
      <div style={{padding:16}}>
        <CircuitSelector circuit={circuit} setCircuit={c=>{setCircuit(c);setProductId("");setSearch("");setServiceId("");}} available={available} circuits={COMPTA_CIRCUITS}/>
        <div style={{...card,marginBottom:12}}>
          {(store.productTypesFonct||[]).length>0&&(
            <div style={{marginBottom:10}}>
              <label style={label}>Filtrer par type <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span></label>
              <select style={input} value={filterType} onChange={e=>setFilterType(e.target.value)}>
                <option value="">— Tous les types —</option>
                {store.productTypesFonct.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div style={{marginBottom:10,position:"relative"}}>
            <label style={label}>Produit</label>
            <input style={input} placeholder="🔍 Rechercher un produit..."
              value={product ? product.name : search}
              onChange={e=>{setSearch(e.target.value);setProductId("");setShowResults(true);}}
              onFocus={()=>{setShowResults(true);if(product){setSearch("");setProductId("");}}}
              onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
            {showResults&&searchResults.length>0&&(
              <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:200,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                {searchResults.slice(0,20).map(p=>(
                  <div key={p.id} onMouseDown={()=>{setProductId(p.id);setSearch("");setShowResults(false);}}
                    style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12,fontWeight:600}}>
                    {p.name}{p.compteNumero?" ("+p.compteNumero+")":""}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
            <div><label style={label}>Période du</label><input type="date" style={input} value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)}/></div>
            <div><label style={label}>au</label><input type="date" style={input} value={periodTo} onChange={e=>setPeriodTo(e.target.value)}/></div>
          </div>
          <div style={{fontSize:10,color:"#94a3b8"}}>Laissez vide pour couvrir tout l'historique disponible.</div>
        </div>

        <button onClick={()=>setShowTotaux(true)} style={{...btn(),background:"#0f766e",color:"white",fontSize:12,width:"100%",marginBottom:12,padding:11}}>💰 Voir les montants totaux (entrées / sorties)</button>
        <button onClick={()=>setShowBalance(true)} style={{...btn(),background:"#1e3a8a",color:"white",fontSize:12,width:"100%",marginBottom:12,padding:11}}>📊 Balance Périodique <span style={{fontWeight:400,fontSize:11}}>(tous les produits, valorisée)</span></button>
        <button onClick={()=>setShowLivreJournal(true)} style={{...btn(),background:"#1e3a8a",color:"white",fontSize:12,width:"100%",marginBottom:12,padding:11}}>📖 Livre-Journal <span style={{fontWeight:400,fontSize:11}}>(tous les mouvements, chronologique)</span></button>

        {product?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>setShowGrandLivre(true)} style={{...btn(),background:"#78350f",color:"white",padding:12,fontSize:13}}>
              📖 Grand Livre des Comptes <span style={{fontWeight:400,fontSize:11}}>(valorisé — P.U. et Montant)</span>
            </button>
            <button onClick={()=>setShowFicheStock(true)} style={{...btn(),background:"#1e293b",color:"white",padding:12,fontSize:13}}>
              📇 Fiche de Stock <span style={{fontWeight:400,fontSize:11}}>(quantités — Entrée/Sortie)</span>
            </button>
          </div>
        ):(
          <div style={{...card,textAlign:"center",padding:30,color:"#94a3b8",fontSize:12}}>Choisissez un produit pour générer un rapport.</div>
        )}

        <div style={{...card,marginTop:16}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>📄 Consommation Matières par service</div>
          <div style={{marginBottom:10}}>
            <label style={label}>Service</label>
            <select style={input} value={serviceId} onChange={e=>setServiceId(e.target.value)}>
              <option value="">— Sélectionner un service —</option>
              {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Utilise la même période que ci-dessus.</div>
          </div>
          <button onClick={()=>setShowConsoMatieres(true)} disabled={!serviceId} style={{...btn(),background:serviceId?"#0f766e":"#e2e8f0",color:serviceId?"white":"#94a3b8",width:"100%",padding:12,fontSize:13}}>
            📄 Générer le document
          </button>
          {serviceId&&(
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button onClick={()=>exportConsommation("excel")} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"5px 10px",flex:1}}>⬇️ Excel</button>
              <button onClick={()=>exportConsommation("pdf")} style={{...btn(),background:"#fef3c7",color:"#92400e",fontSize:11,padding:"5px 10px",flex:1}}>📄 PDF</button>
            </div>
          )}
        </div>
      </div>

      <PrintModal open={showGrandLivre} onClose={()=>setShowGrandLivre(false)} title="Grand Livre des Comptes" onExcel={()=>exportGrandLivre("excel")} onPdf={()=>exportGrandLivre("pdf")}>
        {product&&<GrandLivrePrint product={product} rows={grandLivreRows()} periodFrom={periodFrom} periodTo={periodTo}/>}
      </PrintModal>
      <PrintModal open={showFicheStock} onClose={()=>setShowFicheStock(false)} title="Fiche de Stock" onExcel={()=>exportFicheStock("excel")} onPdf={()=>exportFicheStock("pdf")}>
        {product&&<FicheStockPrint product={product} rows={ficheStockRows()} periodFrom={periodFrom} periodTo={periodTo}/>}
      </PrintModal>
      <PrintModal open={showConsoMatieres} onClose={()=>setShowConsoMatieres(false)} title="Consommation Matières" onExcel={()=>exportConsommation("excel")} onPdf={()=>exportConsommation("pdf")} signatories={["L'Ordonnateur des Matières","Le Comptable des matières","Le réceptionnaire"]}>
        {serviceId&&<ConsommationMatieresPrint serviceName={store.services.find(s=>s.id===serviceId)?.name} rows={consommationMatieresRows()} periodFrom={periodFrom} periodTo={periodTo}/>}
      </PrintModal>

      <Modal open={showTotaux} onClose={()=>setShowTotaux(false)} title="💰 Montants totaux">
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>
          {activeSupplier?activeSupplier.name:"Tous fournisseurs"} · {fmtDate(periodFrom)||"début"} au {fmtDate(periodTo)||"aujourd'hui"}
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,border:"1px solid #f1f5f9",borderRadius:8,overflow:"hidden"}}>
          <tbody>
            <tr>
              <td style={{padding:"11px 14px",borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",color:"#64748b"}}>Total des entrées</td>
              <td style={{padding:"11px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:700,color:"#059669"}}>{totals.totalEntrees.toLocaleString("fr-FR")} FCFA</td>
            </tr>
            <tr>
              <td style={{padding:"11px 14px",borderRight:"1px solid #f1f5f9",color:"#64748b"}}>Total des sorties</td>
              <td style={{padding:"11px 14px",textAlign:"right",fontWeight:700,color:"#dc2626"}}>{totals.totalSorties.toLocaleString("fr-FR")} FCFA</td>
            </tr>
          </tbody>
        </table>
      </Modal>
      <PrintModal open={showBalance} onClose={()=>setShowBalance(false)} title="Balance Périodique" onExcel={()=>exportBalance("excel")} onPdf={()=>exportBalance("pdf")}>
        <BalancePeriodiquePrint rows={balancePeriodiqueRows()} periodFrom={periodFrom} periodTo={periodTo}
          scopeLabel={activeSupplier?activeSupplier.name:"Tous fournisseurs"}/>
      </PrintModal>
      <PrintModal open={showLivreJournal} onClose={()=>setShowLivreJournal(false)} title="Livre-Journal" onExcel={()=>exportLivreJournal("excel")} onPdf={()=>exportLivreJournal("pdf")}>
        <LivreJournalPrint rows={livreJournalRows()} report={livreJournalReport()} periodFrom={periodFrom} periodTo={periodTo}/>
      </PrintModal>
    </div>
  );
}
