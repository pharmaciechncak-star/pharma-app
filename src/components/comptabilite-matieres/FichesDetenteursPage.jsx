import { useState, useMemo } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { Modal } from "../ui/Modal";
import { can, productVisibleInCircuit } from "../../permissions";
import { getComptaCircuits, availableCircuits } from "../../helpers/circuitsConfig";
import { CircuitSelector } from "../ui/CircuitSelector";
import { PrintModal, FicheDetenteurPrint } from "../print/PrintTemplates";
import { getPrintModel } from "../../helpers/printModels";
import { productGroupe } from "../../helpers/nomenclature";
import { getFonctPharmacyStock2, getNpPharmacyStock2 } from "../../helpers/stock2";
import { fmtDate } from "../../constants";

// Fiches d'inventaire individuel contradictoire (modèle n°6 — Instruction
// générale art. 15 ; doc. de formation diapos 55, 93-95). Suivi du matériel
// du 1er groupe remis à un agent détenteur (ou affecté à un bureau / local) :
// remise et reprise par le comptable des matières, émargées par le détenteur.
// Mouvement interne : n'affecte pas l'existant, mais le matériel remis n'est
// plus « en magasin » — il est « en service » (relevé récapitulatif, compte de gestion).
export function FichesDetenteursPage({ store, currentUser }){
  const COMPTA_CIRCUITS = getComptaCircuits(store);
  const available = availableCircuits(currentUser,"inventaire");
  const [circuit,setCircuit] = useState(available[0]||"fonctionnement");
  const cfg = COMPTA_CIRCUITS[circuit];
  const isF = circuit==="fonctionnement";
  const permSection = isF ? "inventaire-fonct" : "inventaire-np";
  const canW = can(currentUser,permSection,"w");
  const magasinOf = pid => (isF?getFonctPharmacyStock2:getNpPharmacyStock2)(store,pid);
  const entrees = (isF?store.entreesFonct:store.entreesNp)||[];

  const fiches = (store.fichesDetenteur||[]).filter(f=>f.circuit===circuit);
  const mouvementsOf = fid => (store.affectations||[]).filter(a=>a.ficheId===fid);
  const detenusOf = fid => {
    const m={};
    mouvementsOf(fid).forEach(a=>{ if(a.status==="annule") return; m[a.productId]=(m[a.productId]||0)+(a.type==="reprise"?-1:1)*(Number(a.qty)||0); });
    return m;
  };

  const [msg,setMsg] = useState("");
  const say = m => { setMsg(m); setTimeout(()=>setMsg(""),6000); };
  const [search,setSearch] = useState("");
  const [showNew,setShowNew] = useState(false);
  const [newF,setNewF] = useState({ detenteurNom:"", fonction:"", lieu:"", serviceId:"" });
  const [selId,setSelId] = useState(null);
  const sel = fiches.find(f=>f.id===selId) || null;
  const [mvForm,setMvForm] = useState(null); // { type, productId, qty, date, immatriculation, beRef }
  const [prodSearch,setProdSearch] = useState("");
  const [printOpen,setPrintOpen] = useState(false);
  const [busy,setBusy] = useState(false);

  const products = useMemo(()=>(store.products||[]).filter(p=>productVisibleInCircuit(p,circuit,store.suppliers)), [store.products, store.suppliers, circuit]);
  const prodResults = prodSearch.trim()
    ? products.filter(p=>p.name.toLowerCase().includes(prodSearch.toLowerCase())||(p.compteNumero||"").includes(prodSearch))
        .sort((a,b)=>(productGroupe(a)==="1"?0:1)-(productGroupe(b)==="1"?0:1)).slice(0,15)
    : [];

  const createFiche = async () => {
    if (!newF.detenteurNom.trim()) { say("⚠️ Indiquez le nom du détenteur."); return; }
    setBusy(true);
    try{
      const num = await store.allocateNumber("FII", circuit, new Date().toISOString().slice(0,10));
      const svc = (store.services||[]).find(s=>s.id===newF.serviceId);
      const ref = await store.addFicheDetenteur({ circuit, numero:num.reference, detenteurNom:newF.detenteurNom.trim(), fonction:newF.fonction.trim(),
        lieu: newF.lieu.trim() || svc?.name || "", serviceId:newF.serviceId||"" });
      setShowNew(false); setNewF({ detenteurNom:"", fonction:"", lieu:"", serviceId:"" }); setSelId(ref.id);
      say("✅ Fiche "+num.reference+" créée.");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };

  const saveMouvement = async () => {
    const f = mvForm; const p = products.find(x=>x.id===f.productId);
    const qty = Number(f.qty)||0;
    if (!p) { say("⚠️ Choisissez une matière."); return; }
    if (qty<=0) { say("⚠️ Quantité invalide."); return; }
    if (f.type==="remise" && qty>magasinOf(p.id)) { say(`⚠️ ${p.name} : seulement ${magasinOf(p.id)} en magasin.`); return; }
    if (f.type==="reprise" && qty>(detenusOf(sel.id)[p.id]||0)) { say(`⚠️ ${p.name} : le détenteur n'en détient que ${detenusOf(sel.id)[p.id]||0}.`); return; }
    setBusy(true);
    try{
      await store.addAffectation({ circuit, ficheId:sel.id, detenteurNom:sel.detenteurNom, type:f.type, productId:p.id, productName:p.name,
        qty, date:f.date, immatriculation:(f.immatriculation||"").trim(), beRef:(f.beRef||"").trim() });
      setMvForm(null); setProdSearch("");
      say("✅ "+(f.type==="remise"?"Remise":"Reprise")+" enregistrée — à faire émarger sur la fiche imprimée.");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };

  const listed = fiches.filter(f=>!search.trim() || [f.detenteurNom,f.lieu,f.fonction,f.numero].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>(a.status==="close")-(b.status==="close") || (a.detenteurNom||"").localeCompare(b.detenteurNom||""));
  const bS = {...btn(),fontSize:12};

  // ── Détail d'une fiche ──
  if (sel) {
    const det = detenusOf(sel.id);
    const held = Object.entries(det).filter(([,q])=>q>0);
    const mv = mouvementsOf(sel.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const mvProd = mvForm ? products.find(p=>p.id===mvForm.productId) : null;
    return (
      <div style={{padding:0}}>
        <PageHeader pageId="fiches-detenteurs" title={"🪑 "+sel.detenteurNom} subtitle={(sel.numero||"")+" · "+(sel.fonction||"")+" · "+(sel.lieu||"")}>
          <button onClick={()=>{setSelId(null);setMvForm(null);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>← Retour</button>
        </PageHeader>
        <div style={{padding:16,maxWidth:1000,margin:"0 auto"}}>
          {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {canW&&sel.status!=="close"&&<button style={{...bS,background:"#0e7490",color:"white"}} onClick={()=>setMvForm({type:"remise",productId:"",qty:"1",date:new Date().toISOString().slice(0,10),immatriculation:"",beRef:""})}>➕ Remettre du matériel</button>}
            <button style={{...bS,background:"#f1f5f9",color:"#334155",border:"1px solid #e2e8f0"}} onClick={()=>setPrintOpen(true)}>🖨️ Imprimer la fiche</button>
            {canW&&sel.status!=="close"&&held.length===0&&mv.length>0&&<button style={{...bS,background:"#fee2e2",color:"#b91c1c"}} onClick={async()=>{ await store.updateFicheDetenteur(sel.id,{status:"close",closedAt:new Date().toISOString().slice(0,10)}); say("✅ Fiche close (plus aucun matériel détenu)."); }}>Clore la fiche</button>}
            {sel.status==="close"&&<span style={{fontSize:12,color:"#b91c1c",alignSelf:"center",fontWeight:700}}>Fiche close le {fmtDate(sel.closedAt)}</span>}
          </div>

          <div style={{...card,marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>Matériel détenu ({held.length})</div>
            {held.length===0?<div style={{fontSize:12,color:"#94a3b8"}}>Aucun matériel détenu actuellement.</div>:(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>{["N° compte","Matière","Détenu",""].map(h=><th key={h} style={{background:"#f1f5f9",padding:"6px 8px",border:"1px solid #e2e8f0",textAlign:"left"}}>{h}</th>)}</tr></thead>
                <tbody>{held.map(([pid,q])=>{ const p=products.find(x=>x.id===pid)||{}; return (
                  <tr key={pid}>
                    <td style={{padding:"5px 8px",border:"1px solid #e2e8f0"}}>{p.compteNumero||""}</td>
                    <td style={{padding:"5px 8px",border:"1px solid #e2e8f0"}}>{p.name||pid}</td>
                    <td style={{padding:"5px 8px",border:"1px solid #e2e8f0",fontWeight:700}}>{q}</td>
                    <td style={{padding:"3px 8px",border:"1px solid #e2e8f0"}}>{canW&&<button style={{...bS,background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",fontSize:11,padding:"3px 8px"}} onClick={()=>setMvForm({type:"reprise",productId:pid,qty:String(q),date:new Date().toISOString().slice(0,10),immatriculation:"",beRef:""})}>↩ Reprendre</button>}</td>
                  </tr>); })}</tbody>
              </table>
            )}
          </div>

          <div style={card}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>Mouvements ({mv.length})</div>
            {mv.length===0?<div style={{fontSize:12,color:"#94a3b8"}}>Aucun mouvement.</div>:mv.map(a=>(
              <div key={a.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f1f5f9",fontSize:12,opacity:a.status==="annule"?0.5:1}}>
                <span style={{fontWeight:700,color:a.type==="reprise"?"#9a3412":"#0e7490",width:70}}>{a.type==="reprise"?"Reprise":"Remise"}</span>
                <span style={{width:80}}>{fmtDate(a.date)}</span>
                <span style={{flex:1}}>{a.qty} × {a.productName}{a.immatriculation?" — immat. "+a.immatriculation:""}{a.beRef?" — BE "+a.beRef:""}</span>
                <span style={{color:"#94a3b8"}}>{a.createdByName}</span>
                {a.status==="annule"?<span style={{color:"#b91c1c",fontWeight:700}}>annulé</span>
                  :canW&&<button style={{...bS,background:"#fee2e2",color:"#ef4444",fontSize:10,padding:"2px 7px"}} onClick={async()=>{ await store.cancelAffectation(a.id); say("✅ Mouvement annulé."); }}>Annuler</button>}
              </div>
            ))}
          </div>
        </div>

        <Modal open={!!mvForm} onClose={()=>{setMvForm(null);setProdSearch("");}} title={mvForm?.type==="reprise"?"↩ Reprise de matériel":"➕ Remise de matériel au détenteur"}>
          {mvForm&&(
            <div>
              {mvForm.type==="remise"?(
                <div style={{marginBottom:10,position:"relative"}}>
                  <label style={label}>Matière</label>
                  {mvProd ? <div style={{...input,background:"#f0f9ff",display:"flex",justifyContent:"space-between"}}><span>{mvProd.name} <span style={{color:"#64748b"}}>({mvProd.compteNumero||"—"})</span></span><span style={{cursor:"pointer"}} onClick={()=>setMvForm(f=>({...f,productId:""}))}>✕</span></div>
                  : <input style={input} placeholder="🔍 Rechercher une matière (groupe 1 en premier)…" value={prodSearch} onChange={e=>setProdSearch(e.target.value)}/>}
                  {!mvProd&&prodResults.length>0&&(
                    <div style={{border:"1px solid #e2e8f0",borderRadius:8,maxHeight:200,overflowY:"auto",marginTop:4}}>
                      {prodResults.map(p=>(
                        <div key={p.id} onClick={()=>{setMvForm(f=>({...f,productId:p.id}));setProdSearch("");}} style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12,display:"flex",justifyContent:"space-between"}}>
                          <span>{p.name} <span style={{color:"#94a3b8"}}>{p.compteNumero||""}</span></span>
                          <span style={{fontSize:10,color:productGroupe(p)==="1"?"#0e7490":"#b45309",fontWeight:700}}>{productGroupe(p)?"G"+productGroupe(p):"?"} · {magasinOf(p.id)} en magasin</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mvProd&&productGroupe(mvProd)!=="1"&&<div style={{fontSize:11,color:"#b45309",marginTop:4}}>⚠️ Cette matière n'est pas classée au 1er groupe : la fiche d'inventaire individuel concerne le matériel durable. Un consommable remis est normalement une sortie définitive.</div>}
                  {mvProd&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>En magasin : <b>{magasinOf(mvProd.id)}</b></div>}
                </div>
              ):(
                <div style={{fontSize:12.5,marginBottom:10}}>Matière : <b>{mvProd?.name}</b> — détenue : <b>{detenusOf(sel.id)[mvForm.productId]||0}</b></div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div><label style={label}>Nombre d'unités</label><input type="number" min="1" style={input} value={mvForm.qty} onChange={e=>setMvForm(f=>({...f,qty:e.target.value}))}/></div>
                <div><label style={label}>Date</label><input type="date" style={input} value={mvForm.date} onChange={e=>setMvForm(f=>({...f,date:e.target.value}))}/></div>
              </div>
              {mvForm.type==="remise"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div><label style={label}>N° d'immatriculation <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span></label><input style={input} value={mvForm.immatriculation} onChange={e=>setMvForm(f=>({...f,immatriculation:e.target.value}))} placeholder="ex. CHNCAK-MB-0012"/></div>
                  <div><label style={label}>N° du bon d'entrée <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span></label>
                    <input style={input} list="be-refs" value={mvForm.beRef} onChange={e=>setMvForm(f=>({...f,beRef:e.target.value}))}/>
                    <datalist id="be-refs">{entrees.filter(e=>e.status!=="annule"&&(e.items||[]).some(i=>i.productId===mvForm.productId)).map(e=><option key={e.id} value={e.reference}/>)}</datalist>
                  </div>
                </div>
              )}
              <button disabled={busy} onClick={saveMouvement} style={{...btn(),background:mvForm.type==="reprise"?"#9a3412":"#0e7490",color:"white",width:"100%",padding:10}}>{busy?"⏳":"💾"} Enregistrer la {mvForm.type==="reprise"?"reprise":"remise"}</button>
            </div>
          )}
        </Modal>

        <PrintModal open={printOpen} onClose={()=>setPrintOpen(false)} title={"Fiche "+(sel.numero||"")} reference={"FICHE D'INVENTAIRE INDIVIDUEL "+(sel.numero||"")+" — "+sel.detenteurNom} landscape signatories={getPrintModel(store,"fiche_detenteur").signers}>
          <FicheDetenteurPrint fiche={sel} mouvements={mv} products={store.products} circuitLabel={cfg.label} model={getPrintModel(store,"fiche_detenteur")} year={new Date().getFullYear()}/>
        </PrintModal>
      </div>
    );
  }

  // ── Liste ──
  return (
    <div style={{padding:0}}>
      <PageHeader pageId="fiches-detenteurs" title={"🪑 Fiches détenteurs — "+cfg.label} subtitle="Inventaire individuel contradictoire du matériel du 1er groupe">
        {canW&&<button onClick={()=>setShowNew(true)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Nouvelle fiche</button>}
      </PageHeader>
      <div style={{padding:16,maxWidth:1000,margin:"0 auto"}}>
        <CircuitSelector circuit={circuit} setCircuit={c=>{setCircuit(c);setSelId(null);}} available={available} circuits={COMPTA_CIRCUITS}/>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}
        <div style={{fontSize:11.5,color:"#64748b",marginBottom:10}}>Une fiche par agent détenteur (ou par bureau / local). La remise et la reprise de matériel sont des mouvements internes : ils n'affectent pas l'existant, mais le matériel remis passe « en service » et n'est plus disponible en magasin.</div>
        <input style={{...input,marginBottom:10}} placeholder="🔍 Rechercher un détenteur, un lieu…" value={search} onChange={e=>setSearch(e.target.value)}/>
        {listed.length===0&&<div style={{...card,color:"#94a3b8",fontSize:13}}>Aucune fiche{fiches.length?" ne correspond":" pour ce circuit"}.</div>}
        {listed.map(f=>{ const n=Object.values(detenusOf(f.id)).filter(q=>q>0).length; const tot=Object.values(detenusOf(f.id)).reduce((s,q)=>s+Math.max(0,q),0); return (
          <div key={f.id} onClick={()=>setSelId(f.id)} style={{...card,marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:f.status==="close"?0.55:1}}>
            <div>
              <div style={{fontWeight:700,fontSize:13}}>🪑 {f.detenteurNom} <span style={{fontWeight:400,fontSize:11,color:"#94a3b8"}}>({f.numero||"—"})</span></div>
              <div style={{fontSize:11,color:"#64748b"}}>{f.fonction||"—"} · {f.lieu||"—"}{f.status==="close"?" · fiche close":""}</div>
            </div>
            <span style={{background:"#cffafe",color:"#0e7490",fontSize:11,fontWeight:700,borderRadius:99,padding:"3px 9px"}}>{n} matière(s) · {tot} unité(s)</span>
          </div>
        ); })}
      </div>

      <Modal open={showNew} onClose={()=>setShowNew(false)} title="➕ Nouvelle fiche d'inventaire individuel">
        <div>
          <div style={{marginBottom:8}}><label style={label}>Prénom et nom du détenteur</label><input style={input} value={newF.detenteurNom} onChange={e=>setNewF(f=>({...f,detenteurNom:e.target.value}))} placeholder="ex. Moussa NDIAYE — ou « Bureau du Directeur »"/></div>
          <div style={{marginBottom:8}}><label style={label}>Fonction</label><input style={input} value={newF.fonction} onChange={e=>setNewF(f=>({...f,fonction:e.target.value}))}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div><label style={label}>Service</label>
              <select style={input} value={newF.serviceId} onChange={e=>setNewF(f=>({...f,serviceId:e.target.value}))}>
                <option value="">— (facultatif) —</option>
                {(store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label style={label}>Lieu d'affectation (bureau, local)</label><input style={input} value={newF.lieu} onChange={e=>setNewF(f=>({...f,lieu:e.target.value}))} placeholder="ex. Bureau 12, Bloc opératoire"/></div>
          </div>
          <button disabled={busy} onClick={createFiche} style={{...btn(),background:"#0e7490",color:"white",width:"100%",padding:10}}>{busy?"⏳":"💾"} Créer la fiche</button>
        </div>
      </Modal>
    </div>
  );
}
