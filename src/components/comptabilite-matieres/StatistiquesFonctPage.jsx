import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { productVisibleInCircuit, hasSupplierAccess, visibleServices } from "../../permissions";
import { PrintModal, GrandLivrePrint, FicheStockPrint, ConsommationMatieresPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";

// Rapports comptables standards (comptabilité matières publique) pour le
// circuit fonctionnement : Grand Livre des Comptes (valorisé, P.U./Montant)
// et Fiche de Stock (quantités, suivi Entrée/Sortie). Les deux suivent, pour
// un produit donné, tous ses mouvements avec un solde ("Existant"/"Stock")
// couru — reconstruits à partir des Bons d'Entrée et de Sortie déjà en place,
// jamais une donnée séparée à ressaisir.
export function StatistiquesFonctPage({store,activeSupplier,currentUser}){
  const [productId,setProductId] = useState("");
  const [search,setSearch] = useState("");
  const [periodFrom,setPeriodFrom] = useState("");
  const [periodTo,setPeriodTo] = useState("");
  const [showGrandLivre,setShowGrandLivre] = useState(false);
  const [showFicheStock,setShowFicheStock] = useState(false);
  const [serviceId,setServiceId] = useState("");
  const [showConsoMatieres,setShowConsoMatieres] = useState(false);
  const [showTotaux,setShowTotaux] = useState(false);
  const [filterType,setFilterType] = useState("");

  const products = store.products
    .filter(p=>productVisibleInCircuit(p,"fonctionnement",store.suppliers))
    .filter(p=>!filterType||p.typeFonct===filterType)
    .filter(p=>activeSupplier?p.supplierId===activeSupplier.id:hasSupplierAccess(currentUser,p.supplierId))
    .filter(p=>!search.trim()||p.name.toLowerCase().includes(search.toLowerCase()));
  const product = store.products.find(p=>p.id===productId);

  // Montant total des entrées et des sorties sur la période — tous produits
  // confondus (scopé au fournisseur actif si un fournisseur est sélectionné,
  // comme le reste de la page), pour une vue d'ensemble rapide sans avoir à
  // choisir un produit précis.
  const globalTotals = () => {
    let totalEntrees = 0, totalSorties = 0;
    (store.entreesFonct||[]).forEach(e=>{
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
    (store.sortiesFonct||[]).forEach(s=>{
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

  // Reconstruit, pour le produit choisi, la liste chronologique de tous ses
  // mouvements (entrées et sorties confondues, hors documents annulés), avec
  // le solde couru — la même donnée alimente les deux rapports.
  const buildMovements = () => {
    if (!product) return [];
    const moves = [];
    (store.entreesFonct||[]).forEach(e=>{
      if (e.status==="annule") return;
      const it = (e.items||[]).find(i=>i.productId===productId);
      if (!it) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      moves.push({ type:"entree", date:d, ts:e.createdAt?.seconds||0, bon:e.reference, qty:Number(it.qty)||0, tiers:e.supplierName||"—" });
    });
    (store.sortiesFonct||[]).forEach(s=>{
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
    (store.entreesFonct||[]).forEach(e=>{
      if (e.status==="annule") return;
      const it=(e.items||[]).find(i=>i.productId===productId); if(!it) return;
      const d = e.date || (e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,10):"");
      all.push({d, qty:Number(it.qty)||0, sign:1});
    });
    (store.sortiesFonct||[]).forEach(s=>{
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
    (store.sortiesFonct||[]).forEach(s=>{
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

  const totals = globalTotals();

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="statistiques-fonct" title="📚 Statistiques" subtitle="Grand Livre des Comptes & Fiche de Stock — circuit fonctionnement"/>
      <div style={{padding:16}}>
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
          <div style={{marginBottom:10}}>
            <label style={label}>Produit</label>
            <input style={{...input,marginBottom:6}} placeholder="🔍 Rechercher un produit..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <select style={input} value={productId} onChange={e=>setProductId(e.target.value)}>
              <option value="">— Sélectionner un produit —</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.name}{p.compteNumero?" ("+p.compteNumero+")":""}</option>)}
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
            <div><label style={label}>Période du</label><input type="date" style={input} value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)}/></div>
            <div><label style={label}>au</label><input type="date" style={input} value={periodTo} onChange={e=>setPeriodTo(e.target.value)}/></div>
          </div>
          <div style={{fontSize:10,color:"#94a3b8"}}>Laissez vide pour couvrir tout l'historique disponible.</div>
        </div>

        <button onClick={()=>setShowTotaux(true)} style={{...btn(),background:"#0f766e",color:"white",fontSize:12,width:"100%",marginBottom:12,padding:11}}>💰 Voir les montants totaux (entrées / sorties)</button>

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
        </div>
      </div>

      <PrintModal open={showGrandLivre} onClose={()=>setShowGrandLivre(false)} title="Grand Livre des Comptes">
        {product&&<GrandLivrePrint product={product} rows={grandLivreRows()} periodFrom={periodFrom} periodTo={periodTo}/>}
      </PrintModal>
      <PrintModal open={showFicheStock} onClose={()=>setShowFicheStock(false)} title="Fiche de Stock">
        {product&&<FicheStockPrint product={product} rows={ficheStockRows()} periodFrom={periodFrom} periodTo={periodTo}/>}
      </PrintModal>
      <PrintModal open={showConsoMatieres} onClose={()=>setShowConsoMatieres(false)} title="Consommation Matières">
        {serviceId&&<ConsommationMatieresPrint serviceName={store.services.find(s=>s.id===serviceId)?.name} rows={consommationMatieresRows()} periodFrom={periodFrom} periodTo={periodTo}/>}
      </PrintModal>

      <Modal open={showTotaux} onClose={()=>setShowTotaux(false)} title="💰 Montants totaux">
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>
          {activeSupplier?activeSupplier.name:"Tous fournisseurs"} · {periodFrom||"début"} au {periodTo||"aujourd'hui"}
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
    </div>
  );
}
