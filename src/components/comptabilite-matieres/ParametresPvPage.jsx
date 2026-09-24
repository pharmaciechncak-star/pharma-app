import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { Modal, ConfirmDelete } from "../ui/Modal";

// Paramètres des Procès-Verbaux de réception (PV) : fonctions (liste
// partagée de titres), responsables (la commission FIXE de chaque circuit,
// avec intérimaire éventuel), et le seuil qui déclenche automatiquement un
// PV. Chaque comptable principal ne voit/gère que son propre circuit ;
// l'admin peut basculer entre les deux.
export function ParametresPvPage({store,currentUser}){
  const isAdmin = currentUser?.role==="admin";
  const defaultCircuit = currentUser?.role==="comptable_non_pharma_principal" ? "non_pharmaceutique" : "fonctionnement";
  const [circuit,setCircuit] = useState(defaultCircuit);

  const [msg,setMsg] = useState("");
  const showMsg = (m) => { setMsg(m); setTimeout(()=>setMsg(""),4000); };

  // ── Fonctions (liste partagée) ──
  const [newFonction,setNewFonction] = useState("");
  const [editingFonctionId,setEditingFonctionId] = useState(null);
  const [editingFonctionName,setEditingFonctionName] = useState("");
  const [deletingFonction,setDeletingFonction] = useState(null);

  // ── Responsables (commission fixe du circuit affiché) ──
  const [newResp,setNewResp] = useState({fonctionName:"",personName:"",interimName:""});
  const [editingRespId,setEditingRespId] = useState(null);
  const [editingResp,setEditingResp] = useState({fonctionName:"",personName:"",interimName:""});
  const [deletingResp,setDeletingResp] = useState(null);
  const responsables = (store.pvResponsables||[]).filter(r=>r.circuit===circuit);

  // ── Seuil ──
  const currentSettings = (store.pvSettings||[]).find(s=>s.id===circuit || s.circuit===circuit);
  const [seuilDraft,setSeuilDraft] = useState(currentSettings?.seuil!=null?String(currentSettings.seuil):"300000");
  const [prefixDraft,setPrefixDraft] = useState(currentSettings?.prefix||(circuit==="fonctionnement"?"PH":"NP"));
  const [savingSettings,setSavingSettings] = useState(false);

  const switchCircuit = (c) => {
    setCircuit(c);
    const s = (store.pvSettings||[]).find(x=>x.id===c || x.circuit===c);
    setSeuilDraft(s?.seuil!=null?String(s.seuil):"300000");
    setPrefixDraft(s?.prefix||(c==="fonctionnement"?"PH":"NP"));
  };

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="parametres-pv" title="⚙️ Paramètres PV" subtitle="Fonctions, responsables et seuil de déclenchement"/>
      <div style={{padding:16}}>
        {msg&&<Alert type="success">{msg}</Alert>}

        {isAdmin&&(
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={()=>switchCircuit("fonctionnement")} style={{...btn(),flex:1,background:circuit==="fonctionnement"?"#334155":"white",color:circuit==="fonctionnement"?"white":"#334155",border:"1px solid #cbd5e1",fontSize:12}}>📦 Fonctionnement</button>
            <button onClick={()=>switchCircuit("non_pharmaceutique")} style={{...btn(),flex:1,background:circuit==="non_pharmaceutique"?"#334155":"white",color:circuit==="non_pharmaceutique"?"white":"#334155",border:"1px solid #cbd5e1",fontSize:12}}>🧰 Non-Pharmaceutique</button>
          </div>
        )}

        {/* ── Seuil de déclenchement ── */}
        <div style={{...card,marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>💰 Seuil de déclenchement du PV — {circuit==="fonctionnement"?"Fonctionnement":"Non-Pharmaceutique"}</div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Tout Bon d'Entrée de ce circuit dont le montant atteint ce seuil génère automatiquement un PV de réception.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <label style={label}>Montant seuil (FCFA)</label>
              <input type="number" style={input} value={seuilDraft} onChange={e=>setSeuilDraft(e.target.value)}/>
            </div>
            <div>
              <label style={label}>Préfixe du n° de PV</label>
              <input style={input} value={prefixDraft} onChange={e=>setPrefixDraft(e.target.value.toUpperCase())} placeholder="Ex: PH"/>
            </div>
          </div>
          <div style={{fontSize:10,color:"#94a3b8",marginBottom:10}}>Exemple de numéro généré : {prefixDraft||"PH"}/1/{new Date().getFullYear()}</div>
          <button disabled={savingSettings} onClick={async()=>{
            setSavingSettings(true);
            try{ await store.setPvSettings(circuit,{seuil:seuilDraft,prefix:prefixDraft}); showMsg("✅ Réglages enregistrés."); }
            catch(e){ showMsg("❌ "+e.message); }
            setSavingSettings(false);
          }} style={{...btn(),background:"#334155",color:"white",width:"100%",padding:10}}>{savingSettings?"⏳ Enregistrement...":"💾 Enregistrer"}</button>
        </div>

        {/* ── Fonctions ── */}
        <div style={{...card,marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:4}}>🏷️ Fonctions</div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Liste partagée de titres (ex: "Comptable Matière Principal"), réutilisable pour n'importe quel responsable ci-dessous.</div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <input style={input} placeholder="Nouvelle fonction..." value={newFonction} onChange={e=>setNewFonction(e.target.value)}
              onKeyDown={async e=>{ if(e.key==="Enter"&&newFonction.trim()){ await store.addPvFonction(newFonction.trim()); setNewFonction(""); } }}/>
            <button onClick={async()=>{ if(newFonction.trim()){ await store.addPvFonction(newFonction.trim()); setNewFonction(""); } }}
              style={{...btn(),background:"#334155",color:"white",fontSize:12,padding:"8px 14px"}}>+ Ajouter</button>
          </div>
          {(store.pvFonctions||[]).length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:8}}>Aucune fonction créée.</div>}
          {(store.pvFonctions||[]).map(f=>(
            <div key={f.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
              {editingFonctionId===f.id?(
                <>
                  <input style={{...input,flex:1,padding:"5px 8px"}} value={editingFonctionName} onChange={e=>setEditingFonctionName(e.target.value)} autoFocus/>
                  <button onClick={async()=>{ if(editingFonctionName.trim()){ await store.renamePvFonction(f.id,editingFonctionName.trim()); } setEditingFonctionId(null); }} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 8px"}}>✓</button>
                  <button onClick={()=>setEditingFonctionId(null)} style={{...btn(),background:"#f1f5f9",color:"#64748b",fontSize:11,padding:"4px 8px"}}>✕</button>
                </>
              ):(
                <>
                  <div style={{flex:1,fontSize:12,fontWeight:600}}>{f.name}</div>
                  <button onClick={()=>{setEditingFonctionId(f.id);setEditingFonctionName(f.name);}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                  <button onClick={()=>setDeletingFonction(f)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* ── Responsables (commission fixe) ── */}
        <div style={{...card,marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:4}}>👥 Responsables — {circuit==="fonctionnement"?"Fonctionnement":"Non-Pharmaceutique"}</div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>La commission fixe qui apparaît sur chaque PV de ce circuit. Un intérimaire peut être renseigné pour chacun, à activer au moment d'imprimer en cas d'absence.</div>

          <div style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <select style={input} value={newResp.fonctionName} onChange={e=>setNewResp(r=>({...r,fonctionName:e.target.value}))}>
                <option value="">— Fonction —</option>
                {(store.pvFonctions||[]).map(f=><option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
              <input style={input} placeholder="Nom du responsable" value={newResp.personName} onChange={e=>setNewResp(r=>({...r,personName:e.target.value}))}/>
            </div>
            <input style={{...input,marginBottom:8}} placeholder="Nom de l'intérimaire (optionnel)" value={newResp.interimName} onChange={e=>setNewResp(r=>({...r,interimName:e.target.value}))}/>
            <button onClick={async()=>{
              if(!newResp.personName.trim()){ showMsg("⚠️ Le nom du responsable est obligatoire."); return; }
              await store.addPvResponsable(circuit,newResp.fonctionName,newResp.personName,newResp.interimName);
              setNewResp({fonctionName:"",personName:"",interimName:""});
            }} style={{...btn(),background:"#334155",color:"white",width:"100%",padding:9,fontSize:12}}>+ Ajouter à la commission</button>
          </div>

          {responsables.length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:8}}>Aucun responsable pour ce circuit.</div>}
          {responsables.map(r=>(
            <div key={r.id} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
              {editingRespId===r.id?(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                    <select style={{...input,padding:"5px 8px"}} value={editingResp.fonctionName} onChange={e=>setEditingResp(x=>({...x,fonctionName:e.target.value}))}>
                      <option value="">— Fonction —</option>
                      {(store.pvFonctions||[]).map(f=><option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>
                    <input style={{...input,padding:"5px 8px"}} value={editingResp.personName} onChange={e=>setEditingResp(x=>({...x,personName:e.target.value}))}/>
                  </div>
                  <input style={{...input,padding:"5px 8px",marginBottom:6}} placeholder="Intérimaire (optionnel)" value={editingResp.interimName} onChange={e=>setEditingResp(x=>({...x,interimName:e.target.value}))}/>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={async()=>{ await store.updatePvResponsable(r.id,editingResp); setEditingRespId(null); }} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 10px",flex:1}}>✓ Enregistrer</button>
                    <button onClick={()=>setEditingRespId(null)} style={{...btn(),background:"#f1f5f9",color:"#64748b",fontSize:11,padding:"4px 10px"}}>✕</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700}}>{r.personName}</div>
                    <div style={{fontSize:10,color:"#64748b"}}>{r.fonctionName||"—"}{r.interimName?" · Intérimaire : "+r.interimName:""}</div>
                  </div>
                  <button onClick={()=>{setEditingRespId(r.id);setEditingResp({fonctionName:r.fonctionName||"",personName:r.personName||"",interimName:r.interimName||""});}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                  <button onClick={()=>setDeletingResp(r)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDelete open={!!deletingFonction} onClose={()=>setDeletingFonction(null)}
        label={deletingFonction?.name||""}
        onConfirm={async()=>{ await store.deletePvFonction(deletingFonction.id); setDeletingFonction(null); }}/>
      <ConfirmDelete open={!!deletingResp} onClose={()=>setDeletingResp(null)}
        label={deletingResp?.personName||""}
        onConfirm={async()=>{ await store.deletePvResponsable(deletingResp.id); setDeletingResp(null); }}/>
    </div>
  );
}
