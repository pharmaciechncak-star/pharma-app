import { useState } from "react";
import { ConfirmDelete, Modal } from "./ui/Modal";
import { PageHeader } from "./ui/PageHeader";
import { can, visibleSuppliers } from "../permissions";
import { btn, label, input, card } from "../helpers/styles";
import { Badge } from "./ui/FormControls";

export function FournisseursPage({store,activeSupplier,onActivate,currentUser}){
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",email:"",phone:"",address:"",allowedServices:[]});
  const [deletingFour,setDeletingFour]=useState(null);

  const open=(s=null)=>{
    setEditing(s?.id||null);
    setForm(s?{name:s.name,email:s.email,phone:s.phone,address:s.address,allowedServices:s.allowedServices||[]}:{name:"",email:"",phone:"",address:"",allowedServices:[]});
    setShow(true);
  };
  const toggleAllowedService = (sid) => {
    setForm(f=>{
      const cur=f.allowedServices||[];
      return {...f, allowedServices: cur.includes(sid)?cur.filter(x=>x!==sid):[...cur,sid]};
    });
  };
  const save=async()=>{
    if(editing){
      store.updateSupplier(editing,form);
    } else {
      // Créer le fournisseur et son dépôt principal automatiquement
      const ref = await store.addSupplier(form);
      const supplierId = ref?.id;
      if(supplierId){
        await store.addDepot({
          name: "Dépôt principal — " + form.name,
          location: "Dépôt principal",
          supplierId,
          isPrincipal: true,
          isAutoCreated: true, // marqueur pour ne pas afficher dans la liste
        });
      }
    }
    setShow(false);
  };

  return(
    <div style={{padding:16}}>
      <ConfirmDelete open={!!deletingFour} onClose={()=>setDeletingFour(null)}
        label={deletingFour?.name||""} onConfirm={()=>store.deleteSupplier(deletingFour.id)}/>
      <PageHeader pageId="fournisseurs" title="🏢 Fournisseurs" subtitle="Gestion des fournisseurs">
        {can(currentUser,"fournisseurs","w")&&<button onClick={()=>open()} style={{...btn(),background:"white",color:"#0f172a",fontWeight:700}}>+ Nouveau</button>}
      </PageHeader>

      <Modal open={show} onClose={()=>setShow(false)} title={editing?"✏️ Modifier Fournisseur":"🏢 Nouveau Fournisseur"}>
        {[["Nom","name","Ex: PharmaCorp"],["Email","email","contact@..."],["Téléphone","phone","01 23..."],["Adresse","address","12 rue..."]].map(([lb,field,ph])=>(
          <div key={field} style={{marginBottom:12}}><label style={label}>{lb}</label><input style={input} value={form[field]||""} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder={ph}/></div>
        ))}
        <div style={{marginBottom:12}}>
          <label style={label}>Services autorisés <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(cochez chaque service qui doit voir ces produits)</span></label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,background:"#f8fafc",borderRadius:8,padding:10,maxHeight:120,overflowY:"auto"}}>
            {(store.services||[]).length===0&&<div style={{fontSize:11,color:"#94a3b8"}}>Aucun service créé.</div>}
            {(store.services||[]).map(s=>(
              <label key={s.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,background:form.allowedServices.includes(s.id)?"#eef2ff":"white",border:"1px solid "+(form.allowedServices.includes(s.id)?"#818cf8":"#e2e8f0"),borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>
                <input type="checkbox" checked={form.allowedServices.includes(s.id)} onChange={()=>toggleAllowedService(s.id)}/>
                {s.name}
              </label>
            ))}
          </div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Les services non cochés ne verront pas les produits de ce fournisseur (Consommations, Retours, Seuil).</div>
        </div>
        <button onClick={save} disabled={!form.name||!form.email} style={{...btn(),background:"#0891b2",color:"white",width:"100%",padding:11}}>
          {editing?"✏️ Modifier":"💾 Enregistrer"}
        </button>
      </Modal>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {visibleSuppliers(currentUser,store.suppliers).map(s=>{
          const isActive=activeSupplier?.id===s.id;
          const depots=store.depots.filter(d=>d.supplierId===s.id);
          const prods=store.products.filter(p=>p.supplierId===s.id);
          return(
            <div key={s.id} style={{...card,padding:16,border:isActive?"2px solid #0891b2":"1.5px solid #f1f5f9",background:isActive?"#f0f9ff":"white"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>🏢 {s.name}</div>
                  {isActive&&<Badge color="#0891b2">✓ Actif</Badge>}
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {can(currentUser,"fournisseurs","w")&&<button onClick={()=>open(s)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",padding:"5px 8px",fontSize:11}}>✏️</button>}
                  <button onClick={()=>onActivate(s)} style={{...btn(),background:isActive?"#dcfce7":"#0891b2",color:isActive?"#059669":"white",padding:"5px 8px",fontSize:11}}>
                    {isActive?"✓ Actif":"Activer"}
                  </button>
                  {can(currentUser,"fournisseurs","d")&&!isActive&&<button onClick={()=>setDeletingFour(s)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"5px 8px",fontSize:11}}>🗑️</button>}
                </div>
              </div>
              <div style={{fontSize:12,color:"#64748b"}}>{s.email}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{s.phone} · {s.address}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{depots.length} dépôt(s) · {prods.length} produit(s)</div>
              <div style={{fontSize:11,color:"#7c3aed",marginTop:4}}>
                🏥 {(s.allowedServices&&s.allowedServices.length>0) ? s.allowedServices.map(sid=>store.services.find(sv=>sv.id===sid)?.name).filter(Boolean).join(", ") : "Aucun service (invisible pour les services)"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
