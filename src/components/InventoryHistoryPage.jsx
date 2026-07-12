import { useState } from "react";
import { downloadExcel } from "../helpers/exportUtils";
import { fmtDate, genId } from "../constants";
import { PageHeader } from "./ui/PageHeader";
import { btn, card } from "../helpers/styles";
import { PrintModal } from "./print/PrintTemplates";
import { LOGO_B64 } from "../images";
import { can } from "../permissions";
import { ConfirmDelete } from "./ui/Modal";

export function InventoryHistoryPage({store, activeSupplier, user}) {
  const [selected, setSelected] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [deletingSelectedInv, setDeletingSelectedInv] = useState(false);

  const items = store.inventories.filter(i =>
    !activeSupplier || i.supplierId === activeSupplier?.id
  );

  const exportInvXLS = (inv) => {
    const rows = (inv.data||[]).map(r=>[
      r.product?.name||"", r.old||0, r.ent||0, r.ret||0, r.nw||0, r.sold||0
    ]);
    downloadExcel("inv_"+inv.month+".xlsx", rows,
      ["Produit","Stock Ancien","Entrées","Retours","Stock Nouveau","Vendus"]);
  };

  const exportAllXLS = () => {
    const rows = items.flatMap(inv=>(inv.data||[]).map(r=>[
      inv.month, fmtDate(inv.date), r.product?.name||"",
      r.old||0, r.ent||0, r.ret||0, r.nw||0, r.sold||0
    ]));
    downloadExcel("inventaires_"+Date.now()+".xlsx", rows,
      ["Mois","Date","Produit","Ancien","Entrées","Retours","Nouveau","Vendus"]);
  };

  const thS = {padding:"7px 8px",fontSize:11,fontWeight:700,color:"#64748b",
    background:"#f8fafc",borderBottom:"2px solid #e2e8f0",textAlign:"left"};
  const tdS = {padding:"7px 8px",borderBottom:"1px solid #f1f5f9",fontSize:12};

  // ── Vue détail d'un inventaire ──
  if (selected) {
    const inv = selected;
    const rows = inv.data || [];
    const totalVendus = rows.reduce((s,r)=>s+(r.sold||0),0);
    const totalNvStock = rows.reduce((s,r)=>s+(r.nw||0),0);

    return (
      <div style={{padding:0}}>
        <PageHeader pageId="hist-inv" title={"📋 Inventaire — " + inv.month}
          subtitle={fmtDate(inv.date) + (inv.createdByName ? " · 👤 " + inv.createdByName : "")}>
          <button onClick={()=>setPrinting(true)}
            style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>🖨️</button>
          <button onClick={()=>exportInvXLS(inv)}
            style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>⬇️ Excel</button>
          <button onClick={()=>setSelected(null)}
            style={{...btn(),background:"white",color:"#1e293b",fontWeight:700}}>← Retour</button>
        </PageHeader>

        {/* PrintModal */}
        <PrintModal open={printing} onClose={()=>setPrinting(false)}
          title={"Inventaire " + inv.month}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            marginBottom:16,paddingBottom:12,borderBottom:"2px solid #0891b2"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <img src={LOGO_B64} alt="CHNCAK"
                style={{width:55,height:55,borderRadius:"50%",objectFit:"cover"}}/>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#0891b2"}}>CHNCAK</div>
                <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
                <div style={{fontSize:9,color:"#94a3b8"}}>PharmaStock</div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:800,fontSize:16}}>RAPPORT D'INVENTAIRE</div>
              <div style={{fontSize:11,color:"#64748b"}}>{inv.month}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{fmtDate(inv.date)}</div>
              {inv.createdByName&&<div style={{fontSize:10,color:"#94a3b8"}}>👤 {inv.createdByName}</div>}
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
            <thead>
              <tr>
                {["Produit","Stock Anc.","Entrées","Retours","Stock Nouv.","Vendus"].map(h=>(
                  <th key={h} style={{...thS,border:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>
                  <td style={{...tdS,border:"1px solid #e2e8f0",fontWeight:600}}>{r.product?.name||"—"}</td>
                  <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center"}}>{r.old||0}</td>
                  <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center",color:"#059669"}}>+{r.ent||0}</td>
                  <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center",color:"#d97706"}}>-{r.ret||0}</td>
                  <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center",color:"#0891b2",fontWeight:700}}>{r.nw||0}</td>
                  <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center",
                    fontWeight:700,color:r.sold>0?"#059669":"#94a3b8"}}>{r.sold||0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{background:"#f0f9ff"}}>
                <td style={{...tdS,border:"1px solid #e2e8f0",fontWeight:800,color:"#0891b2"}}>TOTAL</td>
                <td colSpan={3} style={{...tdS,border:"1px solid #e2e8f0"}}></td>
                <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center",fontWeight:800,color:"#0891b2"}}>{totalNvStock}</td>
                <td style={{...tdS,border:"1px solid #e2e8f0",textAlign:"center",fontWeight:800,color:"#059669"}}>{totalVendus}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{fontSize:10,color:"#94a3b8",textAlign:"center",paddingTop:10,borderTop:"1px solid #e2e8f0"}}>
            Document généré par CHNCAK PharmaStock · {new Date().toLocaleDateString("fr-FR")}
          </div>
        </PrintModal>

        <div style={{padding:16}}>
          {/* Résumé */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:16}}>
            {[
              {label:"Produits inventoriés", val:rows.length,       color:"#0891b2"},
              {label:"Total vendu",          val:totalVendus,       color:"#059669"},
              {label:"Stock nouveau total",  val:totalNvStock,      color:"#7c3aed"},
              {label:"Dépôts couverts",      val:Object.keys(inv.depotResults||{}).length, color:"#d97706"},
            ].map(k=>(
              <div key={k.label} style={{background:"white",borderRadius:10,padding:"12px 14px",
                boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.val}</div>
                <div style={{fontSize:10,color:"#64748b",marginTop:3}}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Tableau détail */}
          <div style={{background:"white",borderRadius:12,overflow:"hidden",
            boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9",marginBottom:16}}>
            <div style={{padding:"12px 16px",background:"#f8fafc",borderBottom:"2px solid #e2e8f0",
              fontWeight:700,color:"#1e293b",fontSize:14}}>
              📊 Détail par produit
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["Produit","Stock Ancien","+Entrées","−Retours","Stock Nouveau","VENDUS"].map(h=>(
                      <th key={h} style={thS}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 && (
                    <tr><td colSpan={6} style={{...tdS,textAlign:"center",color:"#94a3b8",padding:24}}>Aucun détail disponible</td></tr>
                  )}
                  {rows.map((r,i)=>(
                    <tr key={i} style={{background:i%2===0?"white":"#fafafa"}}>
                      <td style={{...tdS,fontWeight:600,color:"#1e293b"}}>{r.product?.name||"—"}</td>
                      <td style={{...tdS,color:"#64748b",textAlign:"center"}}>{r.old||0}</td>
                      <td style={{...tdS,color:"#059669",fontWeight:600,textAlign:"center"}}>+{r.ent||0}</td>
                      <td style={{...tdS,color:"#d97706",fontWeight:600,textAlign:"center"}}>−{r.ret||0}</td>
                      <td style={{...tdS,color:"#0891b2",fontWeight:700,textAlign:"center"}}>{r.nw||0}</td>
                      <td style={{...tdS,textAlign:"center"}}>
                        <span style={{
                          background:r.sold>0?"#dcfce7":"#f1f5f9",
                          color:r.sold>0?"#059669":"#94a3b8",
                          padding:"3px 10px",borderRadius:99,fontWeight:700,fontSize:12
                        }}>{r.sold||0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"#f0f9ff"}}>
                    <td style={{...tdS,fontWeight:800,color:"#1e293b"}}>TOTAL</td>
                    <td colSpan={3} style={tdS}></td>
                    <td style={{...tdS,fontWeight:800,color:"#0891b2",textAlign:"center"}}>{totalNvStock}</td>
                    <td style={{...tdS,textAlign:"center"}}>
                      <span style={{background:"#0891b2",color:"white",padding:"3px 12px",
                        borderRadius:99,fontWeight:800,fontSize:13}}>{totalVendus}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Détail par dépôt si disponible */}
          {Object.keys(inv.depotResults||{}).length > 1 && (
            <div style={{background:"white",borderRadius:12,padding:16,
              boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:14,marginBottom:12}}>🏭 Par dépôt</div>
              {Object.entries(inv.depotResults||{}).map(([depotId, depotRows])=>{
                const d = store.depots.find(x=>x.id===depotId);
                const total = (depotRows||[]).reduce((s,r)=>s+(r.sold||0),0);
                return (
                  <div key={depotId} style={{marginBottom:10,padding:"10px 12px",
                    background:"#f8fafc",borderRadius:8}}>
                    <div style={{fontWeight:700,color:"#1e293b",fontSize:13,marginBottom:4}}>
                      🏭 {d?.name||depotId}
                      <span style={{marginLeft:8,fontSize:11,color:"#0891b2",fontWeight:400}}>
                        ({depotRows?.length||0} produits · Vendus : {total})
                      </span>
                    </div>
                    {(depotRows||[]).filter(r=>r.sold>0).map((r,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",
                        fontSize:12,padding:"3px 0",borderBottom:"1px solid #f1f5f9"}}>
                        <span style={{color:"#374151"}}>{r.product?.name||"—"}</span>
                        <span style={{color:"#059669",fontWeight:600}}>{r.sold} vendus (stock: {r.nw})</span>
                      </div>
                    ))}
                    {(depotRows||[]).every(r=>!r.sold)&&(
                      <div style={{fontSize:11,color:"#94a3b8"}}>Aucune vente dans ce dépôt</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions bas de page */}
          <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
            {/* Modifier inventaire */}
            {!inv.validated && can(user,"hist-inv","w") && (
              <button onClick={()=>{
                // Ré-ouvrir l'inventaire pour modification → naviguer vers InventoryPage avec les données
                if(window.confirm("Voulez-vous modifier cet inventaire ? Les quantités seront rechargées dans le formulaire.")){
                  store.updateInventory(inv.id, {...inv, editing:true});
                  alert("Inventaire marqué comme 'en cours de modification'. Allez sur la page Inventaire pour modifier.");
                }
              }} style={{...btn(),background:"#f0f9ff",color:"#0891b2",border:"1px solid #bae6fd"}}>
                ✏️ Modifier
              </button>
            )}
            {/* Valider définitivement */}
            {!inv.validated && can(user,"hist-inv","w") && (
              <button onClick={()=>{
                if(window.confirm("Valider définitivement cet inventaire ? Cette action empêchera toute modification ultérieure (seul l'admin pourra le déverrouiller).")){
                  store.updateInventory(inv.id, {...inv, validated:true, validatedAt:new Date().toISOString(), validatedBy:user?.uid});
                  setSelected(s=>({...s,validated:true,validatedAt:new Date().toISOString()}));
                }
              }} style={{...btn(),background:"#059669",color:"white",fontWeight:700}}>
                ✅ Valider définitivement
              </button>
            )}
            {/* Statut validé */}
            {inv.validated && (
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",flex:1}}>
                <span style={{fontSize:16}}>🔒</span>
                <div>
                  <div style={{fontWeight:700,fontSize:12,color:"#059669"}}>Inventaire validé définitivement</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{inv.validatedAt ? new Date(inv.validatedAt).toLocaleDateString("fr-FR") : ""}</div>
                </div>
                {/* Seul l'admin peut déverrouiller */}
                {user?.role==="admin" || user?.role==="superuser" ? (
                  <button onClick={()=>{
                    if(window.confirm("Déverrouiller cet inventaire pour modification ?")){
                      store.updateInventory(inv.id, {...inv, validated:false, validatedAt:null, validatedBy:null});
                      setSelected(s=>({...s,validated:false}));
                    }
                  }} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",marginLeft:"auto",fontSize:11}}>
                    🔓 Déverrouiller (Admin)
                  </button>
                ) : null}
              </div>
            )}
            {/* Générer facture depuis inventaire */}
            {can(user,"factures","w") && (
              <button onClick={()=>{
                const items = (inv.data||[]).filter(r=>r.sold>0).map(r=>({
                  productId:   r.product?.id||"",
                  productName: r.product?.name||r.productName||"—",
                  qty:         r.sold,
                  unitPrice:   r.product?.price||0,
                  total:       r.sold*(r.product?.price||0),
                }));
                if(items.length===0){ alert("⚠️ Aucun produit vendu dans cet inventaire."); return; }
                store.addInvoice({
                  month:       inv.month,
                  supplierId:  inv.supplierId,
                  supplier:    activeSupplier?.name||"—",
                  reference:   "FACT-"+genId(),
                  inventoryId: inv.id,
                  items,
                  total: items.reduce((s,i)=>s+i.total,0),
                });
                alert("✅ Facture générée depuis l'inventaire !");
              }} style={{...btn(),background:"#7c3aed",color:"white",fontWeight:700}}>
                🧾 Générer Facture
              </button>
            )}
            {/* Supprimer — seulement si non validé */}
            {!inv.validated && can(user,"hist-inv","d") && (
              <button onClick={()=>setDeletingSelectedInv(true)}
                style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5"}}>
                🗑️ Supprimer
              </button>
            )}
            <ConfirmDelete open={deletingSelectedInv} onClose={()=>setDeletingSelectedInv(false)}
              label={inv.month}
              onConfirm={async()=>{
                // Restaurer le stock avant l'inventaire pour chaque produit inventorié
                if(inv.data && Array.isArray(inv.data)){
                  for(const row of inv.data){
                    if(!row.product?.id || !row.wasInventoried) continue;
                    // Stock avant inventaire = old + ent - ret
                    const stockAvant = (row.old||0) + (row.ent||0) - (row.ret||0);
                    try { await store.setStockForProduct(row.product.id, stockAvant); } catch(e){}
                  }
                }
                await store.deleteInventory(inv.id);
                setSelected(null);
                setDeletingSelectedInv(false);
              }}/>
          </div>
        </div>
      </div>
    );
  }

  // ── Vue liste ──
  return (
    <div style={{padding:0}}>
      <PageHeader pageId="hist-inv" title="📋 Historique Inventaires"
        subtitle={(items.length) + " inventaire(s)" + (activeSupplier?" · "+activeSupplier.name:"")}>
        {items.length>0&&(
          <button onClick={exportAllXLS}
            style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",
              border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>⬇️ Tout exporter</button>
        )}
      </PageHeader>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
        {items.length===0&&(
          <div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>
            <div style={{fontSize:40,marginBottom:10}}>📭</div>
            Aucun inventaire enregistré.
          </div>
        )}
        {items.map(inv=>(
          <div key={inv.id} onClick={()=>setSelected(inv)}
            style={{...card,cursor:"pointer",transition:"box-shadow 0.2s",
              ":hover":{boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}}>
            <div style={{display:"flex",justifyContent:"space-between",
              flexWrap:"wrap",gap:8,alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{inv.month}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                  {fmtDate(inv.date)} · {inv.data?.length||0} produit(s)
                  {Object.keys(inv.depotResults||{}).length>0 &&
                    " · " + Object.keys(inv.depotResults).length + " dépôt(s)"}
                </div>
                {inv.createdByName&&(
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>👤 {inv.createdByName}</div>
                )}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,color:"#059669",fontSize:16}}>{inv.totalSold||0}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>unités vendues</div>
                </div>
                {inv.validated
                  ? <span style={{background:"#059669",color:"white",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🔒 Validé</span>
                  : <span style={{background:"#f59e0b",color:"white",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En cours</span>
                }
                <div style={{color:"#0891b2",fontSize:18}}>›</div>
              </div>
            </div>
            {/* Mini barre progression */}
            <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
              {(inv.data||[]).filter(r=>r.sold>0).slice(0,4).map((r,i)=>(
                <span key={i} style={{background:"#f0fdf4",color:"#059669",
                  padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600}}>
                  {r.product?.name?.split(" ")[0]||"—"} : {r.sold}
                </span>
              ))}
              {(inv.data||[]).filter(r=>r.sold>0).length>4&&(
                <span style={{background:"#f1f5f9",color:"#64748b",
                  padding:"2px 8px",borderRadius:99,fontSize:10}}>
                  +{(inv.data||[]).filter(r=>r.sold>0).length-4} autres
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
