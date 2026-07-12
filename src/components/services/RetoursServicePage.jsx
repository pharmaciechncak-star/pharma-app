import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";

export function RetoursServicePage({store,currentUser}){
  const [show,setShow]=useState(false);
  const [form,setForm]=useState({serviceId:"",items:[],notes:""});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");

  const userServiceId=currentUser?.serviceId||"";
  const isServiceAgent=currentUser?.role==="agent_service"||currentUser?.role==="admin_service";

  const svcProds=form.serviceId
    ?Object.keys(store.svcStock||{}).filter(k=>k.startsWith(form.serviceId+"_")&&store.svcStock[k]>0).map(k=>{
        const prodId=k.split("_")[1];
        return {...(store.products.find(p=>p.id===prodId)||{}),svcQty:store.svcStock[k]};
      }).filter(p=>p.id)
    :[];
  const filtered=search.trim()?svcProds.filter(p=>p.name?.toLowerCase().includes(search.toLowerCase())):svcProds;

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,qty:"1",svcQty:prod.svcQty}]};
    });
    setSearch(""); setShowResults(false);
  };

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      const svc=store.services?.find(s=>s.id===form.serviceId);
      await store.addSvcReturn({...form,serviceName:svc?.name||""});
      setMsg("✅ Retour enregistré — stock pharmacie mis à jour !");
      setForm({serviceId:isServiceAgent?userServiceId:"",items:[],notes:""});
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const returns=(store.svcReturns||[]).filter(r=>!isServiceAgent||!userServiceId||r.serviceId===userServiceId);

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="retours-service" title="↩️ Retours Service" subtitle="Service → Pharmacie">
        {can(currentUser,"retours-service","w")&&<button onClick={()=>setShow(true)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau retour</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}
        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #d97706"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#92400e"}}>↩️ Retour vers la pharmacie</div>
            {!isServiceAgent&&(
              <div style={{marginBottom:10}}>
                <label style={label}>Service</label>
                <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value,items:[]}))}>
                  <option value="">— Choisir —</option>
                  {(store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {form.serviceId&&(
              <div style={{position:"relative",marginBottom:10}}>
                <label style={label}>Produit à retourner</label>
                <input style={{...input,paddingLeft:32}} placeholder="Rechercher dans stock service..."
                  value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                  onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                <span style={{position:"absolute",left:10,top:32,fontSize:14}}>🔍</span>
                {showResults&&filtered.length>0&&(
                  <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:160,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                    {filtered.map(p=>(
                      <div key={p.id} onMouseDown={()=>addItem(p)} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                        <div style={{fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#d97706",fontWeight:700}}>Stock service : {p.svcQty}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#fffbeb",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{it.productName}</div>
                <div style={{fontSize:11,color:"#d97706"}}>Stock:{it.svcQty}</div>
                <input type="number" min="1" max={it.svcQty} value={it.qty}
                  onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                  style={{width:60,padding:"4px 6px",border:"1px solid #fcd34d",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                  style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Notes</label><textarea style={{...input,height:50,resize:"none"}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving}
                style={{...btn(),background:"#d97706",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Traitement...":"✅ Valider le retour"}
              </button>
              <button onClick={()=>setShow(false)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}
        {returns.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun retour enregistré.</div>}
        {returns.map(r=>(
          <div key={r.id} style={{...card,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>↩️ {r.serviceName||"—"} → Pharmacie</div>
                <div style={{fontSize:11,color:"#64748b"}}>{r.returnedByName} · {r.createdAt?.seconds?new Date(r.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
            </div>
            {(r.items||[]).map((it,i)=>(
              <div key={i} style={{fontSize:11,color:"#64748b",paddingLeft:8}}>• {it.productName} — {it.qty} unité(s)</div>
            ))}
            {r.notes&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>{r.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
