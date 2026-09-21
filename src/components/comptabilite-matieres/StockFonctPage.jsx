import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { getFonctPharmacyStock2, getFonctServiceStock2, sumItemsQty } from "../../helpers/stock2";
import { visibleServices, productAllowedForService, productVisibleInCircuit } from "../../permissions";
import { BarcodeScanner } from "../ui/ScanReviewModal";

// Stock du circuit fonctionnement (Comptabilité Matières) — même principe que
// Stock Services (circuit vente), mais formules et colonnes propres : pas de
// consommation trackée ici, juste entrées/sorties.
export function StockFonctPage({store,currentUser}){
  const [filterSuppliers,setFilterSuppliers]=useState([]);
  const [filterService,setFilterService]=useState("pharmacie");
  const [search,setSearch]=useState("");
  const [showScanner,setShowScanner]=useState(false);

  const allProds = (filterSuppliers.length>0
    ? store.products.filter(p=>filterSuppliers.includes(p.supplierId))
    : store.products
  ).filter(p=>productVisibleInCircuit(p,"fonctionnement",store.suppliers))
   .filter(p=>filterService==="pharmacie"||productAllowedForService(p,filterService,store.suppliers));
  const filteredProds = search.trim()
    ? allProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b.includes(search)))
    : allProds;

  const isPharmacieView = filterService==="pharmacie";

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="stock-fonct" title="📊 Stock Fonctionnement" subtitle="Vue temps réel — circuit fonctionnement"/>
      <div style={{padding:16}}>
        <div style={{...card,marginBottom:12,padding:12}}>
          <div style={{fontWeight:700,fontSize:12,color:"#1e293b",marginBottom:8}}>🔍 Filtres</div>
          <div style={{marginBottom:8}}>
            <label style={label}>Vue</label>
            <select style={input} value={filterService} onChange={e=>setFilterService(e.target.value)}>
              <option value="pharmacie">📦 Stock Pharmacie (entrées − sorties)</option>
              {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>🏥 {s.name} (reçu)</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <label style={label}>Fournisseur(s)</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {store.suppliers.map(s=>(
                <button key={s.id} onClick={()=>setFilterSuppliers(f=>f.includes(s.id)?f.filter(x=>x!==s.id):[...f,s.id])}
                  style={{...btn(),background:filterSuppliers.includes(s.id)?"#9a3412":"#fff7ed",color:filterSuppliers.includes(s.id)?"white":"#9a3412",border:"1px solid #fdba74",fontSize:11,padding:"4px 10px"}}>
                  {filterSuppliers.includes(s.id)?"✓ ":""}{s.name}
                </button>
              ))}
              {filterSuppliers.length>0&&<button onClick={()=>setFilterSuppliers([])} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 10px"}}>✕ Tout</button>}
            </div>
          </div>
          <div style={{display:"flex",gap:6,position:"relative"}}>
            <input style={{...input,flex:1}} placeholder="🔍 Rechercher un produit ou scanner..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <button onClick={()=>setShowScanner(true)} title="Scanner un code barre"
              style={{...btn(),background:"#9a3412",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>📷</button>
            {showScanner&&(
              <BarcodeScanner
                onDetected={code=>{ setShowScanner(false); setSearch(code); }}
                onClose={()=>setShowScanner(false)}
              />
            )}
          </div>
        </div>

        <div style={{...card,overflowX:"auto"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>
            {isPharmacieView?"📦 Stock Pharmacie":"🏥 Stock "+((store.services||[]).find(s=>s.id===filterService)?.name||"")}
            <span style={{fontSize:11,color:"#64748b",fontWeight:400,marginLeft:8}}>— {filteredProds.length} produit(s)</span>
          </div>
          {filteredProds.length===0?<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>Aucun produit.</div>:(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr>
                  <th style={{background:"#78350f",color:"white",padding:"7px 10px",textAlign:"left",border:"1px solid #78350f"}}>Produit</th>
                  <th style={{background:"#78350f",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #78350f"}}>Fournisseur</th>
                  {isPharmacieView?<>
                    <th style={{background:"#065f46",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #065f46"}}>Entré</th>
                    <th style={{background:"#7f1d1d",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #7f1d1d"}}>Sorti</th>
                  </>:<>
                    <th style={{background:"#065f46",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #065f46"}}>Reçu</th>
                  </>}
                  <th style={{background:"#9a3412",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #9a3412"}}>STOCK</th>
                </tr>
              </thead>
              <tbody>
                {filteredProds.map((p,i)=>{
                  let stockVal,col1,col2;
                  if(isPharmacieView){
                    const entre = sumItemsQty(store.entreesFonct, p.id);
                    const sorti = sumItemsQty(store.sortiesFonct, p.id);
                    stockVal=getFonctPharmacyStock2(store,p.id); col1=entre; col2=sorti;
                  } else {
                    stockVal=getFonctServiceStock2(store,p.id,filterService); col1=stockVal;
                  }
                  const isAlert=stockVal<=0;
                  return(
                    <tr key={p.id} style={{background:i%2===0?"white":"#f8fafc"}}>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",fontWeight:500}}>{p.name}</td>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",fontSize:10,color:"#64748b"}}>{store.suppliers.find(s=>s.id===p.supplierId)?.name||"—"}</td>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",color:"#059669",fontWeight:600}}>{col1}</td>
                      {isPharmacieView&&<td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",color:"#dc2626",fontWeight:600}}>{col2}</td>}
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",fontWeight:800,
                        background:isAlert?"#fee2e2":"#f0fdf4",color:isAlert?"#dc2626":"#059669",fontSize:13}}>
                        {stockVal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
