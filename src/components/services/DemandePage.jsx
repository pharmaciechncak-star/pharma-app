import { useState } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { productVisibleInCircuit } from "../../permissions";
import { Modal } from "../ui/Modal";
import { getComptaCircuits } from "../../helpers/circuitsConfig";

// Un service crée une demande pour UN circuit précis — jamais "vente" (un
// logiciel dédié existe déjà côté pharmacie), jamais "fonctionnement" (ses
// demandes passent aussi par un circuit externe, exclu volontairement de la
// liste ci-dessous). La liste des circuits proposés reste générique : tout
// circuit ajouté plus tard au registre apparaît automatiquement.
export function DemandePage({store,currentUser}){
  const myServiceId = currentUser?.serviceId||"";
  const myServiceName = store.services?.find(s=>s.id===myServiceId)?.name||"";

  // Circuits éligibles à une demande : "non_pharmaceutique" (toujours) + tout
  // circuit supplémentaire du registre — "fonctionnement" et "vente" ne
  // figurent jamais ici.
  const CIRCUITS = getComptaCircuits(store);
  const eligibleCircuits = [
    { key:"non_pharmaceutique", label:CIRCUITS.non_pharmaceutique.icon+" "+CIRCUITS.non_pharmaceutique.label },
    ...(store.circuitsRegistry||[]).map(c=>({ key:c.key, label:(c.icon||"📁")+" "+c.label })),
  ];

  const [circuit,setCircuit] = useState(eligibleCircuits[0]?.key||"");
  const [showCircuitPicker,setShowCircuitPicker] = useState(false);
  const [search,setSearch] = useState("");
  const [showResults,setShowResults] = useState(false);
  const [items,setItems] = useState([]);
  const [notes,setNotes] = useState("");
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState("");
  const [detail,setDetail] = useState(null);

  const circuitProducts = circuit
    ? store.products.filter(p=>productVisibleInCircuit(p,circuit,store.suppliers))
    : [];
  const searchResults = search.trim()
    ? circuitProducts.filter(p=>!items.some(it=>it.productId===p.id) && p.name.toLowerCase().includes(search.toLowerCase()))
    : circuitProducts.filter(p=>!items.some(it=>it.productId===p.id));

  const addItem = (p) => {
    setItems(l=>[...l,{productId:p.id,productName:p.name,qty:"1"}]);
    setSearch(""); setShowResults(false);
  };
  const removeItem = (i) => setItems(l=>l.filter((_,idx)=>idx!==i));

  const submit = async () => {
    if (!circuit) { setMsg("⚠️ Choisissez un destinataire."); return; }
    if (items.length===0) { setMsg("⚠️ Ajoutez au moins un produit."); return; }
    setSaving(true);
    try {
      await store.addDemande(circuit, myServiceId, myServiceName, items, notes);
      setMsg("✅ Demande envoyée.");
      setItems([]); setNotes("");
      setTimeout(()=>setMsg(""),4000);
    } catch(e) { setMsg("❌ "+e.message); }
    setSaving(false);
  };

  const myDemandes = (store.demandes||[]).filter(d=>d.serviceId===myServiceId);

  const statusBadge = (s) => {
    if (s==="traite") return <span style={{background:"#dcfce7",color:"#166534",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✅ Traitée</span>;
    if (s==="rejete") return <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>✕ Rejetée</span>;
    if (s==="annulee") return <span style={{background:"#f1f5f9",color:"#64748b",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>🚫 Annulée</span>;
    return <span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>⏳ En attente</span>;
  };

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="demandes" title="📝 Demandes" subtitle={myServiceName||"Mon service"}/>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{...card,marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📝 Nouvelle demande</div>
          <div style={{marginBottom:10}}>
            <label style={label}>Destinataire</label>
            {eligibleCircuits.length===0?(
              <div style={{fontSize:12,color:"#94a3b8"}}>— Aucun circuit disponible —</div>
            ):(
              <div onClick={()=>setShowCircuitPicker(true)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",background:"white",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px"}}>
                <span style={{fontWeight:600,fontSize:13}}>{eligibleCircuits.find(c=>c.key===circuit)?.label||"— Choisir —"}</span>
                <span style={{fontSize:11,color:"#94a3b8"}}>▾ changer</span>
              </div>
            )}
          </div>

          <div style={{position:"relative",marginBottom:10}}>
            <label style={label}>Ajouter un produit</label>
            <input style={input} placeholder="🔍 Rechercher un produit..." value={search}
              onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
              onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
            {showResults&&searchResults.length>0&&(
              <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                {searchResults.slice(0,15).map(p=>(
                  <div key={p.id} onMouseDown={()=>addItem(p)} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12,fontWeight:600}}>{p.name}</div>
                ))}
              </div>
            )}
          </div>

          {items.map((it,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
              <div style={{flex:1,fontSize:12,fontWeight:600}}>{it.productName}</div>
              <input type="number" min="1" value={it.qty} onChange={e=>setItems(l=>l.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}
                style={{width:65,padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"center"}}/>
              <button onClick={()=>removeItem(i)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
            </div>
          ))}

          <div style={{marginBottom:10}}><label style={label}>Observations</label><textarea style={{...input,height:50,resize:"none"}} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
          <button onClick={submit} disabled={saving||!circuit} style={{...btn(),background:"#6d28d9",color:"white",width:"100%",padding:11}}>{saving?"⏳ Envoi...":"📤 Envoyer la demande"}</button>
        </div>

        <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:10}}>📋 Historique</div>
        {myDemandes.length===0&&<div style={{...card,textAlign:"center",padding:30,color:"#94a3b8"}}>Aucune demande envoyée.</div>}
        {myDemandes.map(d=>(
          <div key={d.id} onClick={()=>setDetail(d)} style={{...card,marginBottom:8,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:12}}>{(d.items||[]).length} produit(s)</div>
                <div style={{fontSize:11,color:"#64748b"}}>{d.createdAt?.seconds?new Date(d.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"—"}</div>
              </div>
              {statusBadge(d.status)}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!detail} onClose={()=>setDetail(null)} title="📋 Détail de la demande">
        {detail&&(
          <div>
            <div style={{marginBottom:10}}>{statusBadge(detail.status)}</div>
            {(detail.items||[]).map((it,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                <span style={{fontWeight:600}}>{it.productName}</span>
                <span>
                  Demandé : <b>{it.qtyDemandee}</b>
                  {it.qtyEnvoyee!=null&&<> · Envoyé : <b style={{color:it.fourni?"#166534":"#b91c1c"}}>{it.qtyEnvoyee}</b></>}
                </span>
              </div>
            ))}
            {detail.status==="attente"&&(
              <button onClick={async()=>{ try{ await store.cancelDemande(detail.id); setDetail(null); } catch(e){ setMsg("❌ "+e.message); } }}
                style={{...btn(),background:"#fee2e2",color:"#ef4444",width:"100%",padding:10,marginTop:12}}>🚫 Annuler cette demande</button>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showCircuitPicker} onClose={()=>setShowCircuitPicker(false)} title="🔀 Choisir un destinataire">
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {eligibleCircuits.map(c=>{
            const active = circuit===c.key;
            return (
              <div key={c.key} onClick={()=>{setCircuit(c.key);setItems([]);setShowCircuitPicker(false);}} style={{
                ...card, cursor:"pointer", padding:16,
                border: active ? "2px solid #6d28d9" : "1.5px solid #e2e8f0",
                background: active ? "#faf5ff" : "white",
              }}>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{c.label}</div>
                {active && <div style={{marginTop:6,fontSize:11,fontWeight:700,color:"#6d28d9"}}>✓ Actif</div>}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
