import { useState } from "react";
import { can } from "../../permissions";
import { LOGO_CHNCAK_B64 } from "../../images";
import { btn } from "../../helpers/styles";
import { Badge } from "../ui/FormControls";
import { ROLES } from "../../constants";

export function Sidebar({open,onClose,page,onNav,user,unread,activeSupplier,onChangeSupplier}){
  const role=user?.role||"magasinier";
  const go=id=>{ onNav(id); onClose(); };
  const [collapsed, setCollapsed] = useState({});
  const toggleGroup = g => setCollapsed(c=>({...c,[g]:!c[g]}));

  const GROUPS = [
    { id:"pharmacie", label:"Pharmacie",  icon:"💊", items:[
      { id:"dashboard",  label:"Tableau de bord", icon:"📊" },
      { id:"entrees",    label:"Bons d'Entrée",   icon:"📥", perm:"entrees" },
      { id:"retours",    label:"Bons de Retour",  icon:"↩️", perm:"retours" },
      { id:"inventaire", label:"Inventaire",      icon:"🗂️", perm:"inventaire" },
      { id:"factures",   label:"Situations",        icon:"🧾", perm:"factures" },
      { id:"hist-inv",   label:"Hist. Inventaires",icon:"📋", perm:"hist-inv" },
      { id:"hist-fact",  label:"Hist. Situations",  icon:"📁", perm:"hist-fact" },
      { id:"messagerie", label:"Messagerie",      icon:"✉️", perm:"messagerie" },
      { id:"produits",     label:"Produits",     icon:"💊", perm:"produits" },
      { id:"fournisseurs", label:"Fournisseurs", icon:"🏢", perm:"fournisseurs" },
      { id:"depots",       label:"Dépôts",       icon:"🏭", perm:"depots" },
    ]},
    // Rubriques à cheval entre la pharmacie et les services — Stock (2) :
    // la pharmacie envoie/reçoit, un service confirme ou renvoie de l'autre côté.
    { id:"pharmacie-services", label:"Pharmacie ↔ Services", icon:"🔄", items:[
      { id:"transferts",      label:"Transferts",     icon:"🔄", perm:"transferts" },
      { id:"receptions",      label:"Réceptions",      icon:"📦", perm:"receptions" },
      { id:"controle-retour", label:"Contrôle Retour",  icon:"🔍", perm:"controle-retour" },
    ]},
    // Rubriques propres aux services hospitaliers.
    { id:"services", label:"Services",   icon:"🏥", items:[
      { id:"services",        label:"Services",       icon:"🏥", perm:"services" },
      { id:"controle-transfert", label:"Contrôle Transfert", icon:"🔍", perm:"controle-transfert" },
      { id:"consommations",   label:"Consommations",  icon:"💉", perm:"consommations" },
      { id:"retours-service", label:"Retours Service",  icon:"↩️", perm:"retours-service" },
      { id:"seuil",           label:"Seuil",            icon:"🎚️", perm:"seuil" },
    ]},
    // Vue d'ensemble commune à tout le monde (pharmacie ET services).
    { id:"suivi", label:"Suivi",   icon:"📈", items:[
      { id:"stock-service",   label:"Stock Services",  icon:"📊", perm:"stock-service" },
      { id:"statistiques",    label:"Statistiques",    icon:"📈", perm:"statistiques" },
    ]},
    { id:"admin", label:"Administration", icon:"⚙️", items:[
      { id:"utilisateurs", label:"Utilisateurs",      icon:"👥", perm:"utilisateurs" },
      { id:"activites",    label:"Journal d'activité",icon:"📜", adminOnly:true },
      { id:"assistant_ia", label:"Assistant IA",      icon:"🤖", perm:"assistant_ia" },
    ]},
  ];

  // Filtrer les items visibles
  const visibleGroups = GROUPS.map(g=>({
    ...g,
    items: g.items.filter(it=>{
      if(it.adminOnly) return role==="admin" || user?.isSuperuser;
      if(!it.perm) return true;
      return can(user, it.perm, "r");
    })
  })).filter(g=>g.items.length>0);

  // Ouvrir automatiquement le groupe de la page active
  const activeGroup = GROUPS.find(g=>g.items.some(i=>i.id===page))?.id;

  return(
    <>
      {open && <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200}}/>}
      <div style={{
        position:"fixed",top:0,left:0,bottom:0,width:270,
        background:"linear-gradient(180deg,#0f172a,#1e293b)",
        display:"flex",flexDirection:"column",
        zIndex:300,transition:"transform 0.28s ease",
        transform:open?"translateX(0)":"translateX(-100%)",
        boxShadow:"4px 0 20px rgba(0,0,0,0.4)",
      }}>
        {/* Logo */}
        <div style={{padding:"14px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <img src={LOGO_CHNCAK_B64} alt="CHNCAK PharmaStock"
            style={{height:52,width:"auto",maxWidth:200,objectFit:"contain"}}/>
          <button onClick={onClose} style={{...btn(),background:"rgba(255,255,255,0.08)",color:"#94a3b8",padding:"5px 9px",flexShrink:0}}>✕</button>
        </div>

        {/* Fournisseur actif */}
        <div onClick={onChangeSupplier} style={{
          margin:"10px 12px",padding:"10px 14px",borderRadius:10,cursor:"pointer",
          background: activeSupplier ? "rgba(8,145,178,0.15)" : "rgba(255,255,255,0.05)",
          border: activeSupplier ? "1px solid rgba(8,145,178,0.4)" : "1px dashed rgba(255,255,255,0.15)",
        }}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,marginBottom:3}}>FOURNISSEUR ACTIF</div>
          {activeSupplier
            ? <div style={{fontWeight:700,color:"#38bdf8",fontSize:13}}>🏢 {activeSupplier.name}</div>
            : <div style={{color:"#64748b",fontSize:12}}>Aucun — Cliquer pour sélectionner</div>
          }
          <div style={{fontSize:10,color:"#475569",marginTop:3}}>Changer →</div>
        </div>

        {/* Menu groupé */}
        <nav style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
          {visibleGroups.map(g=>{
            const isOpen = collapsed[g.id]===false ? false : (collapsed[g.id]===true ? true : true); // ouvert par défaut
            const hasActive = g.items.some(i=>i.id===page);
            return(
              <div key={g.id}>
                {/* En-tête groupe */}
                <button onClick={()=>toggleGroup(g.id)} style={{
                  display:"flex",alignItems:"center",gap:8,width:"100%",
                  padding:"8px 16px",background:"transparent",border:"none",cursor:"pointer",
                  color:"#475569",fontSize:11,fontWeight:700,textAlign:"left",
                  letterSpacing:1,textTransform:"uppercase",
                }}>
                  <span style={{fontSize:13}}>{g.icon}</span>
                  <span style={{flex:1}}>{g.label}</span>
                  <span style={{fontSize:10,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"none"}}>▶</span>
                </button>
                {/* Items */}
                {isOpen && g.items.map(it=>(
                  <button key={it.id} onClick={()=>go(it.id)} style={{
                    display:"flex",alignItems:"center",gap:10,width:"100%",
                    padding:"9px 16px 9px 32px",
                    background:page===it.id?"linear-gradient(90deg,rgba(56,189,248,0.18),transparent)":"transparent",
                    border:"none",cursor:"pointer",
                    borderLeft:page===it.id?"3px solid #38bdf8":"3px solid transparent",
                    color:page===it.id?"#e2e8f0":"#94a3b8",
                    fontSize:13,fontWeight:page===it.id?700:400,textAlign:"left",transition:"all 0.15s",
                  }}>
                    <span style={{fontSize:14}}>{it.icon}</span>
                    <span style={{flex:1}}>{it.label}</span>
                    {it.id==="messagerie"&&unread>0&&page!=="messagerie"&&<span style={{background:"#ef4444",color:"white",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:700}}>{unread}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontSize:13,color:"#e2e8f0",fontWeight:600}}>{user?.name}</div>
          <div style={{fontSize:11,color:"#475569"}}>{user?.email}</div>
          <div style={{marginTop:5}}><Badge color={ROLES[role]?.color}>{ROLES[role]?.label||role}</Badge></div>
        </div>
      </div>
    </>
  );
}
