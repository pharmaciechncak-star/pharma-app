import { useState } from "react";
import { ConfirmDelete, Modal } from "../ui/Modal";
import { label, input, btn, card } from "../../helpers/styles";
import { PageHeader } from "../ui/PageHeader";
import { can } from "../../permissions";

export function ServicesPage({store,currentUser}){
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",description:"",responsable:"",alertThreshold:5});
  const [deletingS,setDeletingS]=useState(null);

  const open=(s=null)=>{
    setEditing(s?.id||null);
    setForm(s?{name:s.name,description:s.description||"",responsable:s.responsable||"",alertThreshold:s.alertThreshold||5}:{name:"",description:"",responsable:"",alertThreshold:5});
    setShow(true);
  };
  const save=()=>{
    if(!form.name.trim()) return;
    if(editing) store.updateService(editing,form); else store.addService(form);
    setShow(false);
  };

  // Calculer le stock total par service
  const getSvcTotal=(sId)=>{
    let total=0;
    Object.entries(store.svcStock||{}).forEach(([k,v])=>{ if(k.startsWith(sId+"_")) total+=v; });
    return total;
  };

  return(
    <div style={{padding:0}}>
      <ConfirmDelete open={!!deletingS} onClose={()=>setDeletingS(null)} label={deletingS?.name||""}
        onConfirm={()=>store.deleteService(deletingS.id)}/>
      <Modal open={show} onClose={()=>setShow(false)} title={editing?"✏️ Modifier Service":"🏥 Nouveau Service"}>
        <div style={{marginBottom:10}}><label style={label}>Nom du service</label><input style={input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Cardiologie"/></div>
        <div style={{marginBottom:10}}><label style={label}>Description</label><input style={input} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
        <div style={{marginBottom:10}}><label style={label}>Responsable</label><input style={input} value={form.responsable} onChange={e=>setForm(f=>({...f,responsable:e.target.value}))}/></div>
        <div style={{marginBottom:14}}><label style={label}>Seuil d'alerte stock (unités)</label><input style={input} type="number" min="0" value={form.alertThreshold} onChange={e=>setForm(f=>({...f,alertThreshold:Number(e.target.value)||0}))}/></div>
        <button onClick={save} disabled={!form.name.trim()} style={{...btn(),background:"#dc2626",color:"white",width:"100%",padding:11}}>
          {editing?"✏️ Enregistrer":"🏥 Créer le service"}
        </button>
      </Modal>
      <PageHeader pageId="services" title="🏥 Services Hospitaliers" subtitle="Gestion des services et stocks">
        {can(currentUser,"services","w")&&<button onClick={()=>open()} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouveau</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {(store.services||[]).length===0&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun service créé.</div>}
        {(store.services||[]).map(s=>{
          const total=getSvcTotal(s.id);
          const prodCount=Object.keys(store.svcStock||{}).filter(k=>k.startsWith(s.id+"_")&&store.svcStock[k]>0).length;
          const isAlert=total<=s.alertThreshold;
          return(
            <div key={s.id} style={{...card,marginBottom:10,border:isAlert?"2px solid #ef4444":"1.5px solid #f1f5f9"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#7f1d1d,#dc2626)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🏥</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,color:"#1e293b"}}>{s.name}</div>
                  {s.description&&<div style={{fontSize:12,color:"#64748b"}}>{s.description}</div>}
                  {s.responsable&&<div style={{fontSize:11,color:"#94a3b8"}}>👤 {s.responsable}</div>}
                  <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
                    <span style={{background:isAlert?"#fee2e2":"#f0fdf4",color:isAlert?"#ef4444":"#059669",padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:700}}>
                      {isAlert?"⚠️":"✅"} Stock : {total} unités
                    </span>
                    <span style={{background:"#f0f9ff",color:"#0891b2",padding:"2px 10px",borderRadius:99,fontSize:11}}>
                      {prodCount} produit(s)
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  {can(currentUser,"services","w")&&<button onClick={()=>open(s)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",padding:"5px 8px",fontSize:11}}>✏️</button>}
                  {can(currentUser,"services","d")&&<button onClick={()=>setDeletingS(s)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"5px 8px",fontSize:11}}>🗑️</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
