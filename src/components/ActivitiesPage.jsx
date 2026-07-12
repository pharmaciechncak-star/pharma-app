import { useState } from "react";
import { ROLES } from "../constants";
import { Modal } from "./ui/Modal";
import { PageHeader } from "./ui/PageHeader";
import { card, input, btn } from "../helpers/styles";

export function ActivitiesPage({store, currentUser}){
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState(null); // activité sélectionnée pour détails

  const ENTITY_LABELS = {
    entry:"Bon d'entrée", return:"Bon de retour", inventory:"Inventaire",
    invoice:"Facture", product:"Produit", supplier:"Fournisseur",
    depot:"Dépôt", user:"Utilisateur", other:"Autre",
  };
  const ENTITY_ICONS = {
    entry:"📥", return:"↩️", inventory:"🗂️", invoice:"📊",
    product:"💊", supplier:"🏢", depot:"🏭", user:"👤", other:"📌",
  };
  const ACTION_COLORS = {
    create:{ bg:"#dcfce7", color:"#059669", label:"Création",   icon:"➕" },
    update:{ bg:"#fef3c7", color:"#d97706", label:"Modification", icon:"✏️" },
    delete:{ bg:"#fee2e2", color:"#ef4444", label:"Suppression", icon:"🗑️" },
  };

  // Retrouver les données liées à l'activité
  const getRelatedData = (a) => {
    if(!a?.entity || !a?.entityId) return null;
    switch(a.entity){
      case "entry":     return store.entries.find(x=>x.id===a.entityId);
      case "return":    return store.returns.find(x=>x.id===a.entityId);
      case "inventory": return store.inventories.find(x=>x.id===a.entityId);
      case "invoice":   return store.invoices.find(x=>x.id===a.entityId);
      case "product":   return store.products.find(x=>x.id===a.entityId);
      case "supplier":  return store.suppliers.find(x=>x.id===a.entityId);
      case "depot":     return store.depots.find(x=>x.id===a.entityId);
      case "user":      return store.users.find(x=>x.id===a.entityId);
      default: return null;
    }
  };

  const activities = (store.activities||[]).filter(a=>{
    if(filter!=="all" && a.action!==filter) return false;
    if(search && !a.details?.toLowerCase().includes(search.toLowerCase()) &&
       !a.userName?.toLowerCase().includes(search.toLowerCase())) return false;
    if(dateFrom && a.createdAt?.seconds){
      if(new Date(a.createdAt.seconds*1000) < new Date(dateFrom)) return false;
    }
    if(dateTo && a.createdAt?.seconds){
      if(new Date(a.createdAt.seconds*1000) > new Date(dateTo+"T23:59:59")) return false;
    }
    return true;
  });

  const stats = {
    create: (store.activities||[]).filter(a=>a.action==="create").length,
    update: (store.activities||[]).filter(a=>a.action==="update").length,
    delete: (store.activities||[]).filter(a=>a.action==="delete").length,
  };

  const fmtDate = (ts) => ts?.seconds
    ? new Date(ts.seconds*1000).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})
    : "—";

  // Rendu des détails selon le type d'entité
  const renderDetails = (a) => {
    const rel = getRelatedData(a);
    const ac = ACTION_COLORS[a.action]||ACTION_COLORS.update;
    return(
      <div>
        {/* En-tête */}
        <div style={{background:ac.bg,borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:28}}>{ac.icon}</span>
          <div>
            <div style={{fontWeight:800,color:ac.color,fontSize:15}}>{ac.label}</div>
            <div style={{fontSize:12,color:"#64748b"}}>{ENTITY_ICONS[a.entity]||"📌"} {ENTITY_LABELS[a.entity]||a.entity}</div>
          </div>
        </div>

        {/* Infos principales */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          {[
            ["👤 Utilisateur",  a.userName||"—"],
            ["🕐 Date & heure", fmtDate(a.createdAt)],
            ["📝 Description",  a.details||"—"],
            ["🔑 ID entité",    a.entityId||"—"],
          ].map(([label,value])=>(
            <div key={label} style={{background:"#f8fafc",borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:600,marginBottom:2}}>{label}</div>
              <div style={{fontSize:13,color:"#1e293b",wordBreak:"break-all"}}>{value}</div>
            </div>
          ))}
          {/* Ancien → Nouveau nom si disponible */}
          {(a.oldName||a.newName)&&a.oldName!==a.newName&&(
            <div style={{background:"#fef3c7",borderRadius:8,padding:"10px 12px",border:"1px solid #fcd34d"}}>
              <div style={{fontSize:10,color:"#92400e",fontWeight:600,marginBottom:6}}>✏️ CHANGEMENT DE NOM</div>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                <span style={{background:"#fee2e2",color:"#b91c1c",padding:"3px 10px",borderRadius:6,fontWeight:600}}>{a.oldName||"—"}</span>
                <span style={{color:"#92400e",fontWeight:700}}>→</span>
                <span style={{background:"#dcfce7",color:"#15803d",padding:"3px 10px",borderRadius:6,fontWeight:600}}>{a.newName||"—"}</span>
              </div>
            </div>
          )}
          {/* Ancien → Nouveau rôle si disponible */}
          {(a.oldRole||a.newRole)&&a.oldRole!==a.newRole&&(
            <div style={{background:"#f0f9ff",borderRadius:8,padding:"10px 12px",border:"1px solid #bae6fd"}}>
              <div style={{fontSize:10,color:"#0369a1",fontWeight:600,marginBottom:6}}>🛡️ CHANGEMENT DE RÔLE</div>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                <span style={{background:"#fee2e2",color:"#b91c1c",padding:"3px 10px",borderRadius:6,fontWeight:600}}>{a.oldRole||"—"}</span>
                <span style={{color:"#0369a1",fontWeight:700}}>→</span>
                <span style={{background:"#dcfce7",color:"#15803d",padding:"3px 10px",borderRadius:6,fontWeight:600}}>{a.newRole||"—"}</span>
              </div>
            </div>
          )}
          {/* Ancien nom supprimé */}
          {a.action==="delete"&&a.oldName&&(
            <div style={{background:"#fee2e2",borderRadius:8,padding:"10px 12px",border:"1px solid #fca5a5"}}>
              <div style={{fontSize:10,color:"#b91c1c",fontWeight:600,marginBottom:4}}>🗑️ ÉLÉMENT SUPPRIMÉ</div>
              <div style={{fontSize:13,color:"#7f1d1d",fontWeight:700}}>{a.oldName}{a.oldRole?` (${a.oldRole})`:""}</div>
            </div>
          )}
        </div>

        {/* Données liées si disponibles */}
        {rel && (
          <div style={{marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:8}}>
              📋 Données associées {a.action==="delete"?"(avant suppression)":"(actuelles)"}
            </div>
            <div style={{background:"#f1f5f9",borderRadius:8,padding:12,fontSize:11,fontFamily:"monospace",color:"#334155",maxHeight:220,overflowY:"auto",wordBreak:"break-all"}}>
              {a.entity==="entry"||a.entity==="return" ? (
                <div style={{fontFamily:"sans-serif",fontSize:12}}>
                  <div style={{marginBottom:6}}><b>Référence :</b> {rel.reference||"—"}</div>
                  <div style={{marginBottom:6}}><b>Date :</b> {rel.date||"—"}</div>
                  <div style={{marginBottom:6}}><b>Dépôt :</b> {store.depots.find(d=>d.id===rel.depotId)?.name||rel.depotId||"—"}</div>
                  <div style={{marginBottom:6}}><b>Articles ({rel.items?.length||0}) :</b></div>
                  {(rel.items||[]).map((it,i)=>{
                    const prod = store.products.find(p=>p.id===it.productId);
                    return <div key={i} style={{paddingLeft:12,color:"#475569",marginBottom:3}}>
                      • {prod?.name||it.productId} — Qté : {it.qty} — Prix : {Number(it.unitPrice||0).toLocaleString("fr-FR")} FCFA{it.lot?` — Lot : ${it.lot}`:""}
                    </div>;
                  })}
                </div>
              ) : a.entity==="inventory" ? (
                <div style={{fontFamily:"sans-serif",fontSize:12}}>
                  <div style={{marginBottom:6}}><b>Mois :</b> {rel.month||"—"}</div>
                  <div style={{marginBottom:6}}><b>Total vendu :</b> {rel.totalSold||0} unités</div>
                  <div style={{marginBottom:6}}><b>Statut :</b> {rel.validated?"🔒 Validé":"⏳ En cours"}</div>
                  <div style={{marginBottom:6}}><b>Produits ({rel.data?.length||0}) :</b></div>
                  {(rel.data||[]).filter(r=>r.sold>0).slice(0,10).map((r,i)=>(
                    <div key={i} style={{paddingLeft:12,color:"#475569",marginBottom:3}}>
                      • {r.product?.name||"—"} — Vendus : {r.sold} — Stock : {r.nw}
                    </div>
                  ))}
                  {(rel.data||[]).filter(r=>r.sold>0).length>10&&<div style={{color:"#94a3b8",paddingLeft:12}}>...et {(rel.data||[]).filter(r=>r.sold>0).length-10} autres</div>}
                </div>
              ) : a.entity==="invoice" ? (
                <div style={{fontFamily:"sans-serif",fontSize:12}}>
                  <div style={{marginBottom:6}}><b>Référence :</b> {rel.reference||"—"}</div>
                  <div style={{marginBottom:6}}><b>Total :</b> {Number(rel.total||0).toLocaleString("fr-FR")} FCFA</div>
                  <div style={{marginBottom:6}}><b>Statut :</b> {rel.status||"—"}</div>
                </div>
              ) : a.entity==="product" ? (
                <div style={{fontFamily:"sans-serif",fontSize:12}}>
                  <div style={{marginBottom:6}}><b>Nom :</b> {rel.name||"—"}</div>
                  <div style={{marginBottom:6}}><b>Prix :</b> {Number(rel.price||0).toLocaleString("fr-FR")} FCFA</div>
                  <div style={{marginBottom:6}}><b>Unité :</b> {rel.unit||"—"}</div>
                  <div style={{marginBottom:6}}><b>Stock :</b> {store.stock[rel.id]||0}</div>
                </div>
              ) : a.entity==="user" ? (
                <div style={{fontFamily:"sans-serif",fontSize:12}}>
                  <div style={{marginBottom:6}}><b>Nom :</b> {rel.name||"—"}</div>
                  <div style={{marginBottom:6}}><b>Email :</b> {rel.email||"—"}</div>
                  <div style={{marginBottom:6}}><b>Rôle :</b> {ROLES[rel.role]?.label||rel.role||"—"}</div>
                </div>
              ) : (
                <pre style={{fontSize:11,whiteSpace:"pre-wrap"}}>{JSON.stringify(rel,null,2)}</pre>
              )}
            </div>
          </div>
        )}
        {!rel && a.action==="delete" && (
          <div style={{background:"#fef3c7",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#92400e"}}>
            ⚠️ Les données ont été supprimées et ne sont plus disponibles.
          </div>
        )}
      </div>
    );
  };

  return(
    <div style={{padding:0}}>
      {/* Modal détail activité */}
      <Modal open={!!selected} onClose={()=>setSelected(null)}
        title={"📜 Détail de l'activité"}>
        {selected && renderDetails(selected)}
      </Modal>

      <PageHeader pageId="activites" title="📜 Journal d'activité" subtitle="Historique complet des actions utilisateurs"/>
      <div style={{padding:16}}>

        {/* Stats rapides */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          {[["create","Créations","#dcfce7","#059669"],["update","Modifications","#fef3c7","#d97706"],["delete","Suppressions","#fee2e2","#ef4444"]].map(([k,l,bg,c])=>(
            <div key={k} onClick={()=>setFilter(filter===k?"all":k)}
              style={{...card,padding:10,textAlign:"center",cursor:"pointer",border:`2px solid ${filter===k?c:"transparent"}`,background:filter===k?bg:"white"}}>
              <div style={{fontWeight:800,fontSize:18,color:c}}>{stats[k]}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div style={{...card,marginBottom:12,padding:12}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{position:"relative",flex:1,minWidth:160}}>
              <input style={{...input,paddingLeft:30,fontSize:12}} placeholder="Rechercher..."
                value={search} onChange={e=>setSearch(e.target.value)}/>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:14}}>🔍</span>
            </div>
            <input type="date" style={{...input,width:130,fontSize:11}} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
            <input type="date" style={{...input,width:130,fontSize:11}} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
            {(search||dateFrom||dateTo||filter!=="all")&&(
              <button onClick={()=>{setSearch("");setDateFrom("");setDateTo("");setFilter("all");}}
                style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"5px 10px"}}>✕ Réinitialiser</button>
            )}
          </div>
        </div>

        {/* Liste */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {activities.length===0&&(
            <div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>
              Aucune activité trouvée.
            </div>
          )}
          {activities.map((a,i)=>{
            const ac = ACTION_COLORS[a.action]||ACTION_COLORS.update;
            const date = fmtDate(a.createdAt);
            return(
              <div key={a.id||i} onClick={()=>setSelected(a)}
                style={{...card,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",transition:"box-shadow 0.15s, transform 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.10)";e.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="";e.currentTarget.style.transform="";}}>
                <div style={{flexShrink:0,marginTop:2}}>
                  <span style={{background:ac.bg,color:ac.color,fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px",whiteSpace:"nowrap"}}>
                    {ac.icon} {ac.label}
                  </span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:"#1e293b",fontWeight:500,marginBottom:2}}>{a.details||"—"}</div>
                  <div style={{display:"flex",gap:10,fontSize:11,color:"#94a3b8",flexWrap:"wrap"}}>
                    <span>👤 {a.userName||"—"}</span>
                    <span>🕐 {date}</span>
                    {a.entity&&<span style={{color:"#7c3aed"}}>{ENTITY_ICONS[a.entity]||"📌"} {ENTITY_LABELS[a.entity]||a.entity}</span>}
                  </div>
                </div>
                <div style={{color:"#cbd5e1",fontSize:16,flexShrink:0}}>›</div>
              </div>
            );
          })}
        </div>

        {activities.length>0&&(
          <div style={{textAlign:"center",fontSize:12,color:"#94a3b8",marginTop:10}}>
            {activities.length} activité(s) · cliquez sur une ligne pour voir les détails
          </div>
        )}
      </div>
    </div>
  );
}
