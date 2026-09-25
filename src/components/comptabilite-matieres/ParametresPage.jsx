import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { Modal, ConfirmDelete } from "../ui/Modal";
import { getComptaCircuits } from "../../helpers/circuitsConfig";

// Paramètres — regroupe tout ce qui est configurable : circuits (registre,
// admin uniquement), types de produits, fonctions (liste partagée de
// titres), responsables (la commission FIXE de chaque circuit, avec
// intérimaire éventuel), et le seuil qui déclenche automatiquement un PV.
// Chaque comptable principal ne voit/gère que son propre circuit pour les
// responsables/seuil ; l'admin peut basculer entre les deux et gère seul
// les circuits.
export function ParametresPage({store,currentUser}){
  const COMPTA_CIRCUITS = getComptaCircuits(store);
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

  // ── Circuits (registre — admin uniquement) ──
  const [newCircuitKey,setNewCircuitKey] = useState("");
  const [newCircuitLabel,setNewCircuitLabel] = useState("");
  const [newCircuitIcon,setNewCircuitIcon] = useState("📁");
  const [circuitError,setCircuitError] = useState("");
  const [editingCircuitId,setEditingCircuitId] = useState(null);
  const [editingCircuitLabel,setEditingCircuitLabel] = useState("");
  const [deletingCircuit,setDeletingCircuit] = useState(null);

  // ── Types de produits (liste partagée, Comptabilité Matières) ──
  const [newTypeName,setNewTypeName] = useState("");
  const [editingTypeId,setEditingTypeId] = useState(null);
  const [editingTypeName,setEditingTypeName] = useState("");
  const [deletingType,setDeletingType] = useState(null);

  // ── Responsables (commission fixe du circuit affiché) ──
  const [newResp,setNewResp] = useState({fonctionName:"",personName:"",interimName:""});
  const [editingRespId,setEditingRespId] = useState(null);
  const [editingResp,setEditingResp] = useState({fonctionName:"",personName:"",interimName:""});
  const [deletingResp,setDeletingResp] = useState(null);
  const responsables = (store.pvResponsables||[]).filter(r=>r.circuit===circuit);

  // ── Circuit (libellé, icône, seuil, préfixe) ──
  const currentSettings = (store.pvSettings||[]).find(s=>s.id===circuit || s.circuit===circuit);
  const [labelDraft,setLabelDraft] = useState(COMPTA_CIRCUITS[circuit].label);
  const [iconDraft,setIconDraft] = useState(COMPTA_CIRCUITS[circuit].icon);
  const [seuilDraft,setSeuilDraft] = useState(currentSettings?.seuil!=null?String(currentSettings.seuil):"300000");
  const [prefixDraft,setPrefixDraft] = useState(currentSettings?.prefix||(circuit==="fonctionnement"?"PH":"NP"));
  const [savingSettings,setSavingSettings] = useState(false);

  const switchCircuit = (c) => {
    setCircuit(c);
    const s = (store.pvSettings||[]).find(x=>x.id===c || x.circuit===c);
    setLabelDraft(COMPTA_CIRCUITS[c].label);
    setIconDraft(COMPTA_CIRCUITS[c].icon);
    setSeuilDraft(s?.seuil!=null?String(s.seuil):"300000");
    setPrefixDraft(s?.prefix||(c==="fonctionnement"?"PH":"NP"));
  };

  // Chaque section s'affiche comme une simple ligne dans la liste ; cliquer
  // dessus ouvre ses détails dans une modale — même principe que cliquer sur
  // un PV dans sa liste.
  const [openSection,setOpenSection] = useState(null);
  const sectionRow = (key, icon, title, subtitle) => (
    <div onClick={()=>setOpenSection(key)} style={{...card,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{icon} {title}</div>
        <div style={{fontSize:11,color:"#64748b"}}>{subtitle}</div>
      </div>
      <div style={{color:"#cbd5e1",fontSize:18}}>›</div>
    </div>
  );

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="parametres-pv" title="⚙️ Paramètres" subtitle="Circuits, types, fonctions, responsables et seuil de déclenchement"/>
      <div style={{padding:16}}>
        {msg&&<Alert type="success">{msg}</Alert>}

        {isAdmin&&(
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={()=>switchCircuit("fonctionnement")} style={{...btn(),flex:1,background:circuit==="fonctionnement"?"#334155":"white",color:circuit==="fonctionnement"?"white":"#334155",border:"1px solid #cbd5e1",fontSize:12}}>{COMPTA_CIRCUITS.fonctionnement.icon} {COMPTA_CIRCUITS.fonctionnement.label}</button>
            <button onClick={()=>switchCircuit("non_pharmaceutique")} style={{...btn(),flex:1,background:circuit==="non_pharmaceutique"?"#334155":"white",color:circuit==="non_pharmaceutique"?"white":"#334155",border:"1px solid #cbd5e1",fontSize:12}}>{COMPTA_CIRCUITS.non_pharmaceutique.icon} {COMPTA_CIRCUITS.non_pharmaceutique.label}</button>
          </div>
        )}

        {sectionRow("circuit", "🔀", "Circuit — "+COMPTA_CIRCUITS[circuit].label, "Libellé, icône, seuil de déclenchement du PV, préfixe")}
        {isAdmin&&sectionRow("circuits-registre", "🔀", "Circuits supplémentaires", (store.circuitsRegistry||[]).length+" circuit(s) — ajouter, renommer, supprimer")}
        {sectionRow("types", "📦", "Types de produits", (store.productTypesFonct||[]).length+" type(s) créé(s)")}
        {sectionRow("fonctions", "🏷️", "Fonctions", (store.pvFonctions||[]).length+" fonction(s) créée(s)")}
        {sectionRow("responsables", "👥", "Responsables — "+COMPTA_CIRCUITS[circuit].label, responsables.length+" membre(s) de la commission")}
      </div>

      <Modal open={openSection==="circuit"} onClose={()=>setOpenSection(null)} title={"🔀 Circuit — "+COMPTA_CIRCUITS[circuit].label}>
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Le libellé et l'icône sont purement affichés — ils n'affectent ni les données ni les permissions de ce circuit.</div>
        <div style={{display:"grid",gridTemplateColumns:"60px 1fr",gap:8,marginBottom:14}}>
          <div>
            <label style={label}>Icône</label>
            <input style={{...input,textAlign:"center"}} value={iconDraft} onChange={e=>setIconDraft(e.target.value)}/>
          </div>
          <div>
            <label style={label}>Libellé affiché</label>
            <input style={input} value={labelDraft} onChange={e=>setLabelDraft(e.target.value)}/>
          </div>
        </div>

        <div style={{fontWeight:700,fontSize:12,color:"#1e293b",marginBottom:4}}>💰 Seuil de déclenchement du PV</div>
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Tout Bon d'Entrée de ce circuit dont le montant atteint ce seuil génère automatiquement un PV de réception.</div>
        {!currentSettings&&(
          <div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 10px",fontSize:11,marginBottom:10,fontWeight:600}}>
            ⚠️ Aucun réglage enregistré pour ce circuit — la valeur ci-dessous n'est qu'une suggestion, pas encore active. Tant que vous n'avez pas cliqué sur « Enregistrer », <u>aucun PV ne sera généré automatiquement</u>, quel que soit le montant du bon.
          </div>
        )}
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
          try{ await store.setPvSettings(circuit,{seuil:seuilDraft,prefix:prefixDraft,label:labelDraft,icon:iconDraft}); showMsg("✅ Réglages enregistrés."); }
          catch(e){ showMsg("❌ "+e.message); }
          setSavingSettings(false);
        }} style={{...btn(),background:"#334155",color:"white",width:"100%",padding:10}}>{savingSettings?"⏳ Enregistrement...":"💾 Enregistrer"}</button>
      </Modal>

      {isAdmin&&(
        <Modal open={openSection==="circuits-registre"} onClose={()=>setOpenSection(null)} title="🔀 Circuits supplémentaires">
          <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>« Vente » et « Fonctionnement »/« Non-Pharmaceutique » sont les circuits existants (avec leurs propres pages). Ajoutez ici un circuit supplémentaire si une nouvelle comptabilité doit un jour différencier ses propres produits — la case à cocher apparaît immédiatement sur chaque produit.</div>
          {circuitError&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"6px 10px",fontSize:11,marginBottom:10}}>{circuitError}</div>}
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <input style={{...input,width:50,textAlign:"center"}} value={newCircuitIcon} onChange={e=>setNewCircuitIcon(e.target.value)} placeholder="📁"/>
            <input style={input} placeholder="Clé (ex: administratif)" value={newCircuitKey} onChange={e=>setNewCircuitKey(e.target.value)}/>
            <input style={input} placeholder="Libellé affiché" value={newCircuitLabel} onChange={e=>setNewCircuitLabel(e.target.value)}/>
            <button onClick={async()=>{
              setCircuitError("");
              try{ await store.addCircuit(newCircuitKey,newCircuitLabel,newCircuitIcon); setNewCircuitKey("");setNewCircuitLabel("");setNewCircuitIcon("📁"); }
              catch(e){ setCircuitError(e.message); }
            }} style={{...btn(),background:"#374151",color:"white",fontSize:12,padding:"8px 14px",flexShrink:0}}>+ Ajouter</button>
          </div>
          {(store.circuitsRegistry||[]).length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:8}}>Aucun circuit supplémentaire créé.</div>}
          {(store.circuitsRegistry||[]).map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
              {editingCircuitId===c.id?(
                <>
                  <input style={{...input,flex:1,padding:"5px 8px"}} value={editingCircuitLabel} onChange={e=>setEditingCircuitLabel(e.target.value)} autoFocus/>
                  <button onClick={async()=>{ if(editingCircuitLabel.trim()){ await store.renameCircuit(c.id,editingCircuitLabel.trim(),c.icon); } setEditingCircuitId(null); }} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 8px"}}>✓</button>
                  <button onClick={()=>setEditingCircuitId(null)} style={{...btn(),background:"#f1f5f9",color:"#64748b",fontSize:11,padding:"4px 8px"}}>✕</button>
                </>
              ):(
                <>
                  <div style={{flex:1,fontSize:12,fontWeight:600}}>{c.icon} {c.label} <span style={{fontWeight:400,color:"#94a3b8"}}>({c.key})</span></div>
                  <button onClick={()=>{setEditingCircuitId(c.id);setEditingCircuitLabel(c.label);}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                  <button onClick={()=>setDeletingCircuit(c)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
                </>
              )}
            </div>
          ))}
        </Modal>
      )}

      <Modal open={openSection==="types"} onClose={()=>setOpenSection(null)} title="📦 Types de produits">
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Liste libre utilisée pour classer les produits du Fonctionnement/Non-Pharmaceutique — filtrable dans Inventaire et Statistiques.</div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          <input style={input} placeholder="Nouveau type..." value={newTypeName} onChange={e=>setNewTypeName(e.target.value)}
            onKeyDown={async e=>{ if(e.key==="Enter" && newTypeName.trim()){ await store.addProductTypeFonct(newTypeName.trim()); setNewTypeName(""); } }}/>
          <button onClick={async()=>{ if(newTypeName.trim()){ await store.addProductTypeFonct(newTypeName.trim()); setNewTypeName(""); } }}
            style={{...btn(),background:"#374151",color:"white",fontSize:12,padding:"8px 14px"}}>+ Ajouter</button>
        </div>
        {(store.productTypesFonct||[]).length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:8}}>Aucun type créé.</div>}
        {(store.productTypesFonct||[]).map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
            {editingTypeId===t.id?(
              <>
                <input style={{...input,flex:1,padding:"5px 8px"}} value={editingTypeName} onChange={e=>setEditingTypeName(e.target.value)} autoFocus/>
                <button onClick={async()=>{ if(editingTypeName.trim()){ await store.renameProductTypeFonct(t.id,editingTypeName.trim()); } setEditingTypeId(null); }} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 8px"}}>✓</button>
                <button onClick={()=>setEditingTypeId(null)} style={{...btn(),background:"#f1f5f9",color:"#64748b",fontSize:11,padding:"4px 8px"}}>✕</button>
              </>
            ):(
              <>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{t.name}</div>
                <button onClick={()=>{setEditingTypeId(t.id);setEditingTypeName(t.name);}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>setDeletingType(t)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
              </>
            )}
          </div>
        ))}
      </Modal>

      <Modal open={openSection==="fonctions"} onClose={()=>setOpenSection(null)} title="🏷️ Fonctions">
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Liste partagée de titres (ex: "Comptable Matière Principal"), réutilisable pour n'importe quel responsable.</div>
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
      </Modal>

      <Modal open={openSection==="responsables"} onClose={()=>setOpenSection(null)} title={"👥 Responsables — "+COMPTA_CIRCUITS[circuit].label}>
        <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>La commission fixe qui apparaît sur chaque PV de ce circuit, dans l'ordre ci-dessous (1, 2, 3...) — utilisez les flèches pour réordonner. Un intérimaire peut être renseigné pour chacun, à activer au moment d'imprimer en cas d'absence.</div>

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
                <div style={{width:22,height:22,borderRadius:99,background:"#334155",color:"white",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{responsables.findIndex(x=>x.id===r.id)+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700}}>{r.personName}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>{r.fonctionName||"—"}{r.interimName?" · Intérimaire : "+r.interimName:""}</div>
                </div>
                <button onClick={()=>store.movePvResponsable(circuit,r.id,"up")} disabled={responsables.findIndex(x=>x.id===r.id)===0} style={{...btn(),background:"#f1f5f9",color:"#374151",fontSize:11,padding:"4px 7px",opacity:responsables.findIndex(x=>x.id===r.id)===0?0.35:1}}>↑</button>
                <button onClick={()=>store.movePvResponsable(circuit,r.id,"down")} disabled={responsables.findIndex(x=>x.id===r.id)===responsables.length-1} style={{...btn(),background:"#f1f5f9",color:"#374151",fontSize:11,padding:"4px 7px",opacity:responsables.findIndex(x=>x.id===r.id)===responsables.length-1?0.35:1}}>↓</button>
                <button onClick={()=>{setEditingRespId(r.id);setEditingResp({fonctionName:r.fonctionName||"",personName:r.personName||"",interimName:r.interimName||""});}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>setDeletingResp(r)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
              </div>
            )}
          </div>
        ))}
      </Modal>

      <ConfirmDelete open={!!deletingFonction} onClose={()=>setDeletingFonction(null)}
        label={deletingFonction?.name||""}
        onConfirm={async()=>{ await store.deletePvFonction(deletingFonction.id); setDeletingFonction(null); }}/>
      <ConfirmDelete open={!!deletingResp} onClose={()=>setDeletingResp(null)}
        label={deletingResp?.personName||""}
        onConfirm={async()=>{ await store.deletePvResponsable(deletingResp.id); setDeletingResp(null); }}/>
      <ConfirmDelete open={!!deletingCircuit} onClose={()=>setDeletingCircuit(null)}
        label={deletingCircuit?.label||""}
        onConfirm={async()=>{ await store.deleteCircuit(deletingCircuit.id); setDeletingCircuit(null); }}/>
      <ConfirmDelete open={!!deletingType} onClose={()=>setDeletingType(null)}
        label={deletingType?.name||""}
        onConfirm={async()=>{ await store.deleteProductTypeFonct(deletingType.id); setDeletingType(null); }}/>
    </div>
  );
}
