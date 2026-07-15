import { useState } from "react";
import { ConfirmDelete, Modal } from "./ui/Modal";
import { PageHeader } from "./ui/PageHeader";
import { can, visibleSuppliers, hasSupplierAccess } from "../permissions";
import { btn, label, input, card } from "../helpers/styles";

export function DepotsPage({store,activeSupplier,currentUser}){
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",location:"",supplierId:"",isPrincipal:false});
  const [deletingDepot,setDeletingDepot]=useState(null);
  const depots=(activeSupplier ? store.depots.filter(d=>d.supplierId===activeSupplier.id) : store.depots.filter(d=>hasSupplierAccess(currentUser,d.supplierId))).filter(d=>!d.isPrincipal && !d.isAutoCreated);
  const getSupplierName=id=>store.suppliers.find(s=>s.id===id)?.name||"—";

  const open=(d=null)=>{
    setEditing(d?.id||null);
    if(d){
      setForm({name:d.name||"",location:d.location||"",supplierId:d.supplierId||activeSupplier?.id||"",isPrincipal:d.isPrincipal||false});
    } else {
      setForm({name:"",location:"",supplierId:activeSupplier?.id||"",isPrincipal:false});
    }
    setShow(true);
  };

  const save=()=>{
    const suppId = form.supplierId || activeSupplier?.id || "";
    if(!form.name.trim()||!form.location.trim()||!suppId){
      alert("Veuillez remplir le nom, la localisation et sélectionner un fournisseur.");
      return;
    }
    const data = { name:form.name.trim(), location:form.location.trim(), supplierId:suppId, isPrincipal:form.isPrincipal };
    // Si on marque comme principal, retirer le flag des autres dépôts du même fournisseur
    if(form.isPrincipal){
      store.depots.filter(d=>d.supplierId===suppId && d.id!==(editing||"")).forEach(d=>{
        if(d.isPrincipal) store.updateDepot(d.id,{...d,isPrincipal:false});
      });
    }
    if(editing) store.updateDepot(editing,data); else store.addDepot(data);
    setShow(false);
    setForm({name:"",location:"",supplierId:activeSupplier?.id||"",isPrincipal:false});
  };

  const setPrincipal=(d)=>{
    const suppId=d.supplierId;
    // Retirer principal des autres
    store.depots.filter(dep=>dep.supplierId===suppId).forEach(dep=>{
      store.updateDepot(dep.id,{...dep,isPrincipal:dep.id===d.id});
    });
  };

  const suppProdsCount=activeSupplier?store.products.filter(p=>p.supplierId===activeSupplier.id).length:0;

  return(
    <div style={{padding:16}}>
      <ConfirmDelete open={!!deletingDepot} onClose={()=>setDeletingDepot(null)}
        label={deletingDepot?.name||""} onConfirm={()=>store.deleteDepot(deletingDepot.id)}/>
      <PageHeader pageId="depots" title="🏭 Dépôts"
        subtitle={activeSupplier ? "Chaque dépôt contient tous les " + suppProdsCount + " produit(s) de " + activeSupplier.name : "Tous fournisseurs"}>
        {can(currentUser,"depots","w")&&<button onClick={()=>open()} style={{...btn(),background:"white",color:"#1c1917",fontWeight:700}}>+ Nouveau</button>}
      </PageHeader>

      <Modal open={show} onClose={()=>setShow(false)} title={editing?"✏️ Modifier Dépôt":"🏭 Nouveau Dépôt"}>
        <div style={{marginBottom:12}}>
          <label style={label}>Nom du dépôt</label>
          <input style={input} value={form.name}
            onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            placeholder="Ex: Dépôt A — Bâtiment Nord"/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={label}>Localisation / Description</label>
          <input style={input} value={form.location}
            onChange={e=>setForm(f=>({...f,location:e.target.value}))}
            placeholder="Ex: Rez-de-chaussée, salle 12"/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={label}>Fournisseur associé</label>
          {activeSupplier && !editing ? (
            <div style={{...input,background:"#f0f9ff",color:"#0891b2",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              🏢 {activeSupplier.name}
              <span style={{fontSize:10,color:"#64748b",fontWeight:400,marginLeft:4}}>(fournisseur actif)</span>
            </div>
          ) : (
            <select style={input} value={form.supplierId}
              onChange={e=>setForm(f=>({...f,supplierId:e.target.value}))}>
              <option value="">— Sélectionner un fournisseur —</option>
              {visibleSuppliers(currentUser,store.suppliers).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {store.suppliers.length===0&&(
            <div style={{fontSize:11,color:"#f59e0b",marginTop:4}}>
              ⚠️ Aucun fournisseur. Créez d'abord un fournisseur dans la section Fournisseurs.
            </div>
          )}
        </div>
        {/* Dépôt principal */}
        <div style={{marginBottom:16,background:"#f0f9ff",borderRadius:8,padding:"10px 12px",border:"1px solid #bae6fd"}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
            <input type="checkbox" checked={form.isPrincipal}
              onChange={e=>setForm(f=>({...f,isPrincipal:e.target.checked}))}
              style={{width:16,height:16,cursor:"pointer"}}/>
            <div>
              <div style={{fontWeight:700,fontSize:12,color:"#0c4a6e"}}>⭐ Dépôt principal</div>
              <div style={{fontSize:11,color:"#64748b"}}>Le stock global du fournisseur sera mis à jour depuis ce dépôt après inventaire</div>
            </div>
          </label>
        </div>
        <button onClick={save}
          disabled={!form.name.trim()||!form.location.trim()||(!form.supplierId&&!activeSupplier?.id)}
          style={{...btn(),background:(!form.name.trim()||!form.location.trim()||(!form.supplierId&&!activeSupplier?.id))?"#cbd5e1":"#0891b2",color:"white",width:"100%",padding:11}}>
          {editing?"✏️ Enregistrer les modifications":"🏭 Créer le Dépôt"}
        </button>
      </Modal>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {depots.map(d=>{
          const totalQty=store.products.filter(p=>p.supplierId===d.supplierId).reduce((s,p)=>s+(store.stock[p.id]||0),0);
          return(
            <div key={d.id} style={{...card,padding:16,border:d.isPrincipal?"2px solid #0891b2":"1.5px solid #f1f5f9"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>🏭 {d.name}</div>
                    {d.isPrincipal&&<span style={{background:"#0891b2",color:"white",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⭐ Principal</span>}
                  </div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{d.location}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>Fournisseur : {getSupplierName(d.supplierId)}</div>
                  <div style={{fontSize:11,color:"#0891b2",marginTop:4}}>
                    {store.products.filter(p=>p.supplierId===d.supplierId).length} produits · stock : {totalQty}
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {can(currentUser,"depots","w")&&!d.isPrincipal&&(
                    <button onClick={()=>setPrincipal(d)}
                      style={{...btn(),background:"#f0f9ff",color:"#0891b2",padding:"5px 8px",fontSize:11}}>⭐ Principal</button>
                  )}
                  {can(currentUser,"depots","w")&&<button onClick={()=>open(d)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",padding:"5px 8px",fontSize:11}}>✏️</button>}
                  {can(currentUser,"depots","d")&&<button onClick={()=>setDeletingDepot(d)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"5px 8px",fontSize:11}}>🗑️</button>}
                </div>
              </div>
            </div>
          );
        })}
        {depots.length===0&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun dépôt. Créez votre premier dépôt.</div>}
      </div>
    </div>
  );
}
