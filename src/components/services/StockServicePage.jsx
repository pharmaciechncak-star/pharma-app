import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { getPharmacyStock2, getServiceStock2, sumItemsQty, sumConfirmedQty } from "../../helpers/stock2";
import { visibleServices } from "../../permissions";

export function StockServicePage({store,currentUser}){
  const [filterSuppliers,setFilterSuppliers]=useState([]);
  const [filterService,setFilterService]=useState("pharmacie"); // "pharmacie" | serviceId
  const [search,setSearch]=useState("");

  // Produits filtrés
  const allProds = filterSuppliers.length>0
    ? store.products.filter(p=>filterSuppliers.includes(p.supplierId))
    : store.products;
  const filteredProds = search.trim()
    ? allProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
    : allProds;

  const isPharmacieView = filterService==="pharmacie";

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="stock-service" title="📊 Stock Services" subtitle="Vue temps réel par fournisseur et service"/>
      <div style={{padding:16}}>
        {/* Filtres */}
        <div style={{...card,marginBottom:12,padding:12}}>
          <div style={{fontWeight:700,fontSize:12,color:"#1e293b",marginBottom:8}}>🔍 Filtres</div>
          <div style={{marginBottom:8}}>
            <label style={label}>Vue</label>
            <select style={input} value={filterService} onChange={e=>setFilterService(e.target.value)}>
              <option value="pharmacie">📦 Stock Pharmacie (réceptions − transferts)</option>
              {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>🏥 {s.name} (transferts − consommations)</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <label style={label}>Fournisseur(s)</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {store.suppliers.map(s=>(
                <button key={s.id} onClick={()=>setFilterSuppliers(f=>f.includes(s.id)?f.filter(x=>x!==s.id):[...f,s.id])}
                  style={{...btn(),background:filterSuppliers.includes(s.id)?"#0891b2":"#f0f9ff",color:filterSuppliers.includes(s.id)?"white":"#0891b2",border:"1px solid #bae6fd",fontSize:11,padding:"4px 10px"}}>
                  {filterSuppliers.includes(s.id)?"✓ ":""}{s.name}
                </button>
              ))}
              {filterSuppliers.length>0&&<button onClick={()=>setFilterSuppliers([])} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 10px"}}>✕ Tout</button>}
            </div>
          </div>
          <input style={{...input}} placeholder="🔍 Rechercher un produit..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {/* Tableau stock */}
        <div style={{...card,overflowX:"auto"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>
            {isPharmacieView?"📦 Stock Pharmacie":"🏥 Stock "+((store.services||[]).find(s=>s.id===filterService)?.name||"")}
            <span style={{fontSize:11,color:"#64748b",fontWeight:400,marginLeft:8}}>— {filteredProds.length} produit(s)</span>
          </div>
          {filteredProds.length===0?<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>Aucun produit.</div>:(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr>
                  <th style={{background:"#1e3a5f",color:"white",padding:"7px 10px",textAlign:"left",border:"1px solid #1e3a5f"}}>Produit</th>
                  <th style={{background:"#1e3a5f",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #1e3a5f"}}>Fournisseur</th>
                  {isPharmacieView?<>
                    <th style={{background:"#065f46",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #065f46"}}>Réceptionné</th>
                    <th style={{background:"#7f1d1d",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #7f1d1d"}}>Transféré</th>
                  </>:<>
                    <th style={{background:"#065f46",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #065f46"}}>Transféré</th>
                    <th style={{background:"#7f1d1d",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #7f1d1d"}}>Consommé</th>
                  </>}
                  <th style={{background:"#1d4ed8",color:"white",padding:"7px 10px",textAlign:"center",border:"1px solid #1d4ed8"}}>STOCK</th>
                </tr>
              </thead>
              <tbody>
                {filteredProds.map((p,i)=>{
                  let stockVal,col1,col2;
                  if(isPharmacieView){
                    const recu  = sumItemsQty(store.receptions, p.id);
                    const transf= sumItemsQty(store.transfers, p.id);
                    stockVal=getPharmacyStock2(store,p.id); col1=recu; col2=transf;
                  } else {
                    const transf = sumConfirmedQty((store.transfers||[]).filter(t=>t.serviceId===filterService), p.id);
                    const conso  = sumItemsQty((store.consumptions||[]).filter(c=>c.serviceId===filterService), p.id);
                    const retour = sumItemsQty((store.svcReturns||[]).filter(r=>r.serviceId===filterService), p.id);
                    stockVal=getServiceStock2(store,p.id,filterService); col1=transf; col2=conso+retour;
                  }
                  const isAlert=stockVal<=0;
                  return(
                    <tr key={p.id} style={{background:i%2===0?"white":"#f8fafc"}}>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",fontWeight:500}}>{p.name}</td>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",fontSize:10,color:"#64748b"}}>{store.suppliers.find(s=>s.id===p.supplierId)?.name||"—"}</td>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",color:"#059669",fontWeight:600}}>{col1}</td>
                      <td style={{padding:"6px 10px",border:"1px solid #e2e8f0",textAlign:"center",color:"#dc2626",fontWeight:600}}>{col2}</td>
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
