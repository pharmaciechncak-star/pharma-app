import { useState, useRef } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";

export function TransfertsPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [form,setForm]=useState({serviceId:"",items:[],notes:""});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const searchRef=useRef(null);

  const suppProds=activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id):store.products;
  const filtered=search.trim()?suppProds.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())):suppProds;
  const selectedSvc=store.services?.find(s=>s.id===form.serviceId);

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:"1",stockDispo:store.stock[prod.id]||0}]};
    });
    setSearch(""); setShowResults(false);
  };
  const removeItem=i=>setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      await store.addTransfer({...form,supplierId:activeSupplier?.id,serviceName:selectedSvc?.name});
      setMsg("✅ Transfert effectué avec succès !");
      setForm({serviceId:"",items:[],notes:""});
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const transfers=(store.transfers||[]).filter(t=>!activeSupplier||t.supplierId===activeSupplier?.id);

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="transferts" title="🔄 Transferts" subtitle={"Pharmacie → Services · "+(activeSupplier?.name||"")}>
        {can(currentUser,"transferts","w")&&<button onClick={()=>setShow(true)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {/* Modal nouveau transfert */}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #22c55e"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#166534"}}>🔄 Nouveau Transfert</div>
            <div style={{marginBottom:10}}>
              <label style={label}>Service destinataire</label>
              <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value}))}>
                <option value="">— Choisir un service —</option>
                {(store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {/* Recherche produit */}
            <div style={{position:"relative",marginBottom:10}}>
              <label style={label}>Ajouter un produit</label>
              <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Rechercher..." value={search}
                onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
              <span style={{position:"absolute",left:10,top:32,fontSize:14}}>🔍</span>
              {showResults&&filtered.length>0&&(
                <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                  {filtered.slice(0,15).map(p=>(
                    <div key={p.id} onMouseDown={()=>addItem(p)}
                      style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                      <div style={{fontWeight:600}}>{p.name}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>Stock dispo : {store.stock[p.id]||0}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Liste produits sélectionnés */}
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{it.productName}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Dispo:{it.stockDispo}</div>
                <input type="number" min="1" max={it.stockDispo} value={it.qty}
                  onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                  style={{width:60,padding:"4px 6px",border:"1px solid #86efac",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>removeItem(i)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Notes</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving||!form.serviceId||form.items.length===0}
                style={{...btn(),background:"#16a34a",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Envoi...":"✅ Valider le transfert"}
              </button>
              <button onClick={()=>setShow(false)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        {/* Historique */}
        {transfers.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun transfert.</div>}
        {transfers.map(t=>(
          <div key={t.id} style={{...card,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>🔄 → {t.serviceName||"—"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{t.transferredByName} · {t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Effectué</span>
            </div>
            {(t.items||[]).map((it,i)=>(
              <div key={i} style={{fontSize:11,color:"#64748b",paddingLeft:8}}>• {it.productName} — {it.qty} unité(s)</div>
            ))}
            {t.notes&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>{t.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
