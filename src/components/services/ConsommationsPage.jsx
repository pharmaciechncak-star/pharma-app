import { useState, useRef } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner } from "../ui/ScanReviewModal";
import { PrintModal, ConsumptionPrint } from "../print/PrintTemplates";
import { Barcode } from "../ui/Barcode";

export function ConsommationsPage({store,currentUser}){
  const [show,setShow]=useState(false);
  const [printSel,setPrintSel]=useState(null);
  const [form,setForm]=useState({serviceId:"",patientName:"",patientId:"",note:"",items:[]});
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [showScanner,setShowScanner]=useState(false);
  const searchRef=useRef(null);
  const lastQtyRef=useRef(null);

  // Un agent_service voit uniquement son service
  const userServiceId=currentUser?.serviceId||"";
  const isServiceAgent=currentUser?.role==="agent_service"||currentUser?.role==="admin_service";
  const visibleServices=isServiceAgent&&userServiceId
    ?(store.services||[]).filter(s=>s.id===userServiceId)
    :(store.services||[]);

  const svcProds=form.serviceId
    ?Object.keys(store.svcStock||{}).filter(k=>k.startsWith(form.serviceId+"_")&&store.svcStock[k]>0).map(k=>{
        const prodId=k.split("_")[1];
        return {...(store.products.find(p=>p.id===prodId)||{}), svcQty:store.svcStock[k]};
      }).filter(p=>p.id)
    :[];

  const filtered=search.trim()
    ?svcProds.filter(p=>
        p.name?.toLowerCase().includes(search.toLowerCase())||
        [p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b.includes(search))
      )
    :svcProds;

  const addItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,barcode:prod.barcode1||prod.barcode2||prod.barcode3||"",qty:"1",svcQty:prod.svcQty}]};
    });
    setSearch(""); setShowResults(false);
    setTimeout(()=>{lastQtyRef.current?.focus();lastQtyRef.current?.select();},80);
  };

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      const svc=store.services?.find(s=>s.id===form.serviceId);
      await store.addConsumption({...form,serviceName:svc?.name||""});
      setMsg("✅ Consommation enregistrée !");
      setForm({serviceId:isServiceAgent?userServiceId:"",patientName:"",patientId:"",note:"",items:[]});
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const consumptions=(store.consumptions||[]).filter(c=>
    !isServiceAgent||!userServiceId||c.serviceId===userServiceId
  );

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="consommations" title="💉 Consommations" subtitle="Traçabilité produits par patient">
        {can(currentUser,"consommations","w")&&<button onClick={()=>{setForm(f=>({...f,serviceId:isServiceAgent?userServiceId:""}));setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Saisir</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #6366f1"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#3730a3"}}>💉 Saisie de consommation</div>
            {!isServiceAgent&&(
              <div style={{marginBottom:10}}>
                <label style={label}>Service</label>
                <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value,items:[]}))}>
                  <option value="">— Choisir —</option>
                  {visibleServices.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div><label style={label}>Patient (optionnel)</label><input style={input} value={form.patientName} onChange={e=>setForm(f=>({...f,patientName:e.target.value}))} placeholder="Nom du patient"/></div>
              <div><label style={label}>N° Dossier (optionnel)</label><input style={input} value={form.patientId} onChange={e=>setForm(f=>({...f,patientId:e.target.value}))} placeholder="Ex: PAT-001"/></div>
            </div>
            {form.serviceId&&(
              <div style={{position:"relative",marginBottom:10}}>
                <label style={label}>Produit consommé</label>
                <div style={{display:"flex",gap:6}}>
                  <div style={{position:"relative",flex:1}}>
                    <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Nom, code barre ou scanner..."
                      value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                      onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                  </div>
                  <button onClick={()=>setShowScanner(true)}
                    title="Scanner un code barre"
                    style={{...btn(),background:"#4f46e5",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>
                    📷
                  </button>
                </div>
                {showScanner&&(
                  <BarcodeScanner
                    onDetected={code=>{
                      setShowScanner(false);
                      const found=svcProds.find(p=>
                        [p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code)||
                        p.name?.toLowerCase().includes(code.toLowerCase())
                      );
                      if(found) addItem(found);
                      else { setSearch(code); setShowResults(true); }
                    }}
                    onClose={()=>setShowScanner(false)}
                  />
                )}
                {showResults&&filtered.length>0&&(
                  <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                    {filtered.map(p=>(
                      <div key={p.id} onMouseDown={()=>addItem(p)}
                        style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                        <div style={{fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#059669",fontWeight:700}}>Stock service : {p.svcQty}</div>
                      </div>
                    ))}
                  </div>
                )}
                {showResults&&search.trim()&&filtered.length===0&&(
                  <div style={{background:"#fef3c7",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",marginTop:4}}>
                    ⚠️ Aucun produit trouvé pour « {search} » dans le stock du service.
                  </div>
                )}
              </div>
            )}
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#eef2ff",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{it.productName}</div>
                  {it.barcode&&<div style={{marginTop:2}}><Barcode value={it.barcode} height={24} width={1.2} fontSize={8} margin={1}/></div>}
                </div>
                <div style={{fontSize:11,color:"#6366f1"}}>Stock:{it.svcQty}</div>
                <input ref={i===form.items.length-1?lastQtyRef:null}
                  type="number" min="1" max={it.svcQty} value={it.qty}
                  onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                  style={{width:60,padding:"4px 6px",border:"1px solid #a5b4fc",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                  style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Note</label><textarea style={{...input,height:50,resize:"none"}} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving}
                style={{...btn(),background:"#4f46e5",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Enregistrement...":"✅ Enregistrer"}
              </button>
              <button onClick={()=>setShow(false)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        {consumptions.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucune consommation enregistrée.</div>}
        {consumptions.map(c=>(
          <div key={c.id} onClick={()=>setPrintSel(c)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(79,70,229,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour l'aperçu imprimable">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>💉 {c.serviceName||"—"}</div>
                {c.patientName&&<div style={{fontSize:12,color:"#4f46e5",fontWeight:600}}>👤 {c.patientName}{c.patientId?" · "+c.patientId:""}</div>}
                <div style={{fontSize:11,color:"#64748b"}}>{c.consumedByName} · {c.createdAt?.seconds?new Date(c.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <span style={{background:"#eef2ff",color:"#4f46e5",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(c.items||[]).length} produit(s)</span>
            </div>
            {(c.items||[]).map((it,i)=>(
              <div key={i} style={{fontSize:11,color:"#64748b",paddingLeft:8}}>• {it.productName} — {it.qty} unité(s)</div>
            ))}
            {c.note&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>{c.note}</div>}
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Consommation">
        <ConsumptionPrint c={printSel}/>
      </PrintModal>
    </div>
  );
}
