import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { can } from "../../permissions";
import { PrintModal, PvPrint } from "../print/PrintTemplates";
import { Modal } from "../ui/Modal";
import { Alert } from "../ui/FormControls";
import { getComptaCircuits } from "../../helpers/circuitsConfig";

// Consultation des PV de réception générés automatiquement — un PV par Bon
// d'Entrée ayant atteint le seuil configuré. Workflow : le PV naît "en
// attente" ; au moment de l'imprimer pour signature, on renseigne les pièces
// justificatives (N° BC/BL/Facture) et on fige le choix des intérimaires
// éventuels ; une fois imprimé et signé physiquement, on valide — le PV
// devient alors définitif (plus aucune modification possible).
export function PvPage({store,currentUser}){
  const CIRCUITS = getComptaCircuits(store);
  const canFonct = can(currentUser,"entrees-fonct","r");
  const canNp = can(currentUser,"entrees-np","r");

  const [filters,setFilters] = useState({dateFrom:"",dateTo:"",numero:"",status:"",entreeRef:"",createdBy:"",supplier:"",circuit:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);
  const [showFilters,setShowFilters] = useState(false);

  const [selected,setSelected] = useState(null);
  const [bcDraft,setBcDraft] = useState("");
  const [blDraft,setBlDraft] = useState("");
  const [factureDraft,setFactureDraft] = useState("");
  const [interimToggles,setInterimToggles] = useState({}); // index -> bool
  const [editedNames,setEditedNames] = useState({}); // index -> nom saisi librement
  const [editedFonctions,setEditedFonctions] = useState({}); // index -> qualité saisie librement
  const [editingNameIdx,setEditingNameIdx] = useState(null);
  const [showPrint,setShowPrint] = useState(false);
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState("");
  const showMsg = (m) => { setMsg(m); setTimeout(()=>setMsg(""),4000); };

  const pvs = (store.procesVerbaux||[])
    .filter(pv => (pv.circuit==="fonctionnement" ? canFonct : canNp))
    .filter(pv=>{
      if (filters.dateFrom || filters.dateTo) {
        const d = pv.createdAt?.seconds ? new Date(pv.createdAt.seconds*1000).toISOString().slice(0,10) : "";
        if (!d) return false;
        if (filters.dateFrom && d < filters.dateFrom) return false;
        if (filters.dateTo && d > filters.dateTo) return false;
      }
      if (filters.numero && !(pv.numero||"").toLowerCase().includes(filters.numero.toLowerCase())) return false;
      if (filters.status && pv.status!==filters.status) return false;
      if (filters.entreeRef && !(pv.entreeRef||"").toLowerCase().includes(filters.entreeRef.toLowerCase())) return false;
      if (filters.createdBy && pv.createdBy!==filters.createdBy) return false;
      if (filters.supplier && pv.supplierId!==filters.supplier) return false;
      if (filters.circuit && pv.circuit!==filters.circuit) return false;
      return true;
    });

  const openPv = (pv) => {
    setSelected(pv);
    setBcDraft(pv.bcNumero||"");
    setBlDraft(pv.blNumero||"");
    setFactureDraft(pv.factureNumero||"");
    const baseCommission = effectiveCommission(pv);
    const toggles = {};
    baseCommission.forEach((m,i)=>{ if(m.isInterim) toggles[i]=true; });
    setInterimToggles(toggles);
    setEditedNames({});
    setEditedFonctions({});
    setEditingNameIdx(null);
    setShowPrint(false);
  };

  // La commission est normalement figée à la création du PV (pour garder la
  // composition telle qu'elle était lors de la réception). Mais si elle est
  // vide — le plus souvent parce que le PV a été créé avant que la commission
  // ne soit configurée dans Paramètres — et que le PV n'est pas encore
  // validé, on retombe sur la commission ACTUELLE de Paramètres : mieux vaut
  // un PV à jour qu'un PV définitivement vide.
  function effectiveCommission(pv) {
    if (pv.commission && pv.commission.length > 0) return pv.commission;
    if (pv.status === "valide") return [];
    return (store.pvResponsables||[]).filter(r=>r.circuit===pv.circuit).map(r=>({
      fonctionName:r.fonctionName||"", personName:r.personName||"", interimName:r.interimName||"",
    }));
  }

  // Le nom affiché suit cette priorité : correction libre tapée juste avant
  // l'impression (bouton "✏️ Modifier"), sinon l'intérimaire si activé, sinon
  // le responsable habituel. La correction libre ne porte jamais la mention
  // "(intérimaire)" — ce n'est pas forcément la même personne. La qualité
  // (fonction) suit la même logique de correction libre, indépendamment.
  const resolvedCommission = selected ? effectiveCommission(selected).map((m,i) => {
    const useInterim = !!interimToggles[i] && m.interimName;
    const edited = editedNames[i]?.trim();
    const displayName = edited || (useInterim?m.interimName:m.personName);
    const editedFonction = editedFonctions[i]?.trim();
    const displayFonction = editedFonction || m.fonctionName;
    return { fonctionName:displayFonction, personName:m.personName, interimName:m.interimName, displayName, isInterim: !edited && !!useInterim };
  }) : [];

  const isFinal = selected?.status === "valide";

  const suppliersForCircuit = (store.suppliers||[]).filter(s=>(store.procesVerbaux||[]).some(pv=>pv.supplierId===s.id));

  const prepareAndPrint = async () => {
    setSaving(true);
    try {
      await store.preparePvForPrint(selected.id, {
        bcNumero:bcDraft, blNumero:blDraft, factureNumero:factureDraft,
        commission: resolvedCommission.map(m=>({ fonctionName:m.fonctionName, personName:m.displayName, interimName:m.interimName, isInterim:m.isInterim })),
      });
      setShowPrint(true);
    } catch(e) { showMsg("❌ "+e.message); }
    setSaving(false);
  };

  const doValidate = async () => {
    setSaving(true);
    try { await store.validatePv(selected.id); showMsg("✅ PV validé."); setSelected(null); }
    catch(e){ showMsg("❌ "+e.message); }
    setSaving(false);
  };

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="pv" title="🗂️ Procès-Verbaux de Réception" subtitle="Générés automatiquement au-delà du seuil configuré"/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#1e3a8a":"#eef2ff",color:hasActiveFilters?"white":"#1e3a8a",fontSize:12}}>
            🔍 Filtres{hasActiveFilters?" (actifs)":""}
          </button>
          {hasActiveFilters&&<button onClick={()=>setFilters({dateFrom:"",dateTo:"",numero:"",status:"",entreeRef:"",createdBy:"",supplier:"",circuit:""})} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Réinitialiser</button>}
        </div>
        {showFilters&&(
          <div style={{...card,marginBottom:12,padding:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Du</label><input type="date" style={input} value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></div>
              <div><label style={label}>Au</label><input type="date" style={input} value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></div>
            </div>
            {(canFonct&&canNp)&&(
              <div style={{marginBottom:8}}><label style={label}>Circuit</label>
                <select style={input} value={filters.circuit} onChange={e=>setFilters(f=>({...f,circuit:e.target.value}))}>
                  <option value="">— Tous —</option>
                  <option value="fonctionnement">{CIRCUITS.fonctionnement.icon} {CIRCUITS.fonctionnement.label}</option>
                  <option value="non_pharmaceutique">{CIRCUITS.non_pharmaceutique.icon} {CIRCUITS.non_pharmaceutique.label}</option>
                </select>
              </div>
            )}
            <div style={{marginBottom:8}}><label style={label}>N° PV</label><input style={input} value={filters.numero} onChange={e=>setFilters(f=>({...f,numero:e.target.value}))} placeholder="Ex: PH/136/2026"/></div>
            <div style={{marginBottom:8}}><label style={label}>N° Bon d'Entrée correspondant</label><input style={input} value={filters.entreeRef} onChange={e=>setFilters(f=>({...f,entreeRef:e.target.value}))}/></div>
            <div style={{marginBottom:8}}><label style={label}>Statut</label>
              <select style={input} value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}>
                <option value="">— Tous —</option>
                <option value="attente">⏳ En attente</option>
                <option value="valide">✅ Validé</option>
              </select>
            </div>
            <div style={{marginBottom:8}}><label style={label}>Créé par</label>
              <select style={input} value={filters.createdBy} onChange={e=>setFilters(f=>({...f,createdBy:e.target.value}))}>
                <option value="">— Tous —</option>
                {(store.users||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={label}>Fournisseur</label>
              <select style={input} value={filters.supplier} onChange={e=>setFilters(f=>({...f,supplier:e.target.value}))}>
                <option value="">— Tous —</option>
                {suppliersForCircuit.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {pvs.length===0&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucun PV ne correspond à ce filtre.":"Aucun PV généré pour l'instant — un PV apparaît automatiquement dès qu'un Bon d'Entrée atteint le seuil configuré dans Paramètres PV."}</div>}
        {pvs.map(pv=>(
          <div key={pv.id} onClick={()=>openPv(pv)} style={{...card,marginBottom:8,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{pv.numero}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{pv.supplierName} · {pv.createdAt?.seconds?new Date(pv.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"—"} · {pv.createdByName}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#1e3a8a"}}>{Number(pv.totalMontant||0).toLocaleString("fr-FR")} FCFA</div>
                <div style={{display:"flex",gap:4,justifyContent:"flex-end",marginTop:2}}>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#eef2ff",color:CIRCUITS[pv.circuit]?.accentColor||"#334155"}}>
                    {CIRCUITS[pv.circuit]?.icon} {CIRCUITS[pv.circuit]?.label||pv.circuit}
                  </span>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:pv.status==="valide"?"#dcfce7":"#fef3c7",color:pv.status==="valide"?"#166534":"#92400e"}}>
                    {pv.status==="valide"?"✅ Validé":"⏳ En attente"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!selected&&!showPrint} onClose={()=>setSelected(null)} title={"🗂️ "+(selected?.numero||"")}>
        {selected&&(
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>
              {selected.supplierName} · {Number(selected.totalMontant||0).toLocaleString("fr-FR")} FCFA · {(selected.items||[]).length} produit(s)
            </div>
            <div style={{marginBottom:14,display:"flex",gap:6}}>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#eef2ff",color:CIRCUITS[selected.circuit]?.accentColor||"#334155"}}>
                {CIRCUITS[selected.circuit]?.icon} {CIRCUITS[selected.circuit]?.label||selected.circuit}
              </span>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:isFinal?"#dcfce7":"#fef3c7",color:isFinal?"#166534":"#92400e"}}>
                {isFinal?"✅ Validé":"⏳ En attente de signature"}
              </span>
            </div>
            {!isFinal&&(!selected.commission||selected.commission.length===0)&&effectiveCommission(selected).length>0&&(
              <div style={{background:"#eff6ff",color:"#1e40af",borderRadius:8,padding:"8px 10px",fontSize:11,marginBottom:14}}>
                ℹ️ Ce PV a été créé avant que la commission ne soit configurée dans Paramètres — la commission actuelle est utilisée ci-dessous et sera enregistrée sur ce PV dès l'impression.
              </div>
            )}
            {!isFinal&&effectiveCommission(selected).length===0&&(
              <div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 10px",fontSize:11,marginBottom:14,fontWeight:600}}>
                ⚠️ Aucune commission configurée pour ce circuit — allez dans Paramètres pour ajouter des responsables avant d'imprimer.
              </div>
            )}

            <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>📎 Pièces justificatives</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
              <div><label style={label}>N° BC</label><input style={input} value={bcDraft} onChange={e=>setBcDraft(e.target.value)} disabled={isFinal}/></div>
              <div><label style={label}>N° BL</label><input style={input} value={blDraft} onChange={e=>setBlDraft(e.target.value)} disabled={isFinal}/></div>
              <div><label style={label}>N° Facture</label><input style={input} value={factureDraft} onChange={e=>setFactureDraft(e.target.value)} disabled={isFinal}/></div>
            </div>

            {effectiveCommission(selected).length>0&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#1e293b",marginBottom:8}}>✍️ Signataires</div>
                {effectiveCommission(selected).map((m,i)=>(
                  <div key={i} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                    {editingNameIdx===i?(
                      <div>
                        <label style={{...label,fontSize:9,marginBottom:2}}>Nom</label>
                        <input autoFocus style={{...input,padding:"5px 8px",marginBottom:6}} placeholder={m.personName}
                          value={editedNames[i]??""} onChange={e=>setEditedNames(n=>({...n,[i]:e.target.value}))}
                          onKeyDown={e=>{ if(e.key==="Enter") setEditingNameIdx(null); }}/>
                        <label style={{...label,fontSize:9,marginBottom:2}}>Qualité</label>
                        <div style={{display:"flex",gap:6}}>
                          <input style={{...input,padding:"5px 8px",flex:1}} placeholder={m.fonctionName||"Qualité"}
                            value={editedFonctions[i]??""} onChange={e=>setEditedFonctions(n=>({...n,[i]:e.target.value}))}
                            onKeyDown={e=>{ if(e.key==="Enter") setEditingNameIdx(null); }}/>
                          <button onClick={()=>setEditingNameIdx(null)} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 10px"}}>✓</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:700}}>
                            {editedNames[i]?.trim() ? editedNames[i] : (interimToggles[i]&&m.interimName ? m.interimName : m.personName)}
                            {editedNames[i]?.trim() && <span style={{color:"#6d28d9",fontWeight:600}}> (modifié)</span>}
                          </div>
                          <div style={{fontSize:10,color:"#64748b"}}>
                            {editedFonctions[i]?.trim() ? editedFonctions[i] : (m.fonctionName||"—")}
                            {editedFonctions[i]?.trim() && <span style={{color:"#6d28d9",fontWeight:600}}> (modifié)</span>}
                          </div>
                        </div>
                        {!isFinal&&<button onClick={()=>setEditingNameIdx(i)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️ Modifier</button>}
                      </div>
                    )}
                    {!isFinal&&!editedNames[i]?.trim()&&m.interimName&&(
                      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:11,padding:"5px 0 0",cursor:"pointer",color:"#92400e"}}>
                        <input type="checkbox" checked={!!interimToggles[i]} onChange={e=>setInterimToggles(t=>({...t,[i]:e.target.checked}))}/>
                        Remplacer par l'intérimaire <b>{m.interimName}</b>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isFinal?(
              <button onClick={()=>setShowPrint(true)} style={{...btn(),background:"#1e3a8a",color:"white",width:"100%",padding:11}}>🖨️ Imprimer</button>
            ):(
              <>
                <button disabled={saving} onClick={prepareAndPrint} style={{...btn(),background:"#1e3a8a",color:"white",width:"100%",padding:11,marginBottom:8}}>{saving?"⏳...":"🖨️ Aperçu et impression"}</button>
                <button disabled={saving} onClick={doValidate} style={{...btn(),background:"#16a34a",color:"white",width:"100%",padding:11}}>{saving?"⏳...":"✅ Valider (une fois imprimé et signé)"}</button>
              </>
            )}
          </div>
        )}
      </Modal>

      <PrintModal open={showPrint} onClose={()=>setShowPrint(false)} title={"PV "+(selected?.numero||"")}>
        {selected&&<PvPrint pv={{...selected,bcNumero:bcDraft,blNumero:blDraft,factureNumero:factureDraft}} resolvedCommission={resolvedCommission} circuitLabel={CIRCUITS[selected.circuit]?.icon+" "+CIRCUITS[selected.circuit]?.label}/>}
      </PrintModal>
    </div>
  );
}
