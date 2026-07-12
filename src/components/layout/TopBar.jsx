import { can } from "../../permissions";
import { btn } from "../../helpers/styles";
import { ICON_CHNCAK_B64 } from "../../images";

export function TopBar({page,activeSupplier,onMenu,onAI,aiOpen,unread,onLogout,onChangeSupplier,onNav,onProfile,userName,currentUser}){
  const hasAIAccess = can(currentUser,"assistant_ia","r");
  return(
    <div style={{background:"linear-gradient(90deg,#0f172a,#1e293b)",height:56,display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0,position:"sticky",top:0,zIndex:150,boxShadow:"0 2px 8px rgba(0,0,0,0.25)"}}>
      <button onClick={onMenu} style={{...btn(),background:"rgba(255,255,255,0.1)",color:"white",padding:"6px 11px",fontSize:17}}>☰</button>
      <img src={ICON_CHNCAK_B64} alt="CHNCAK" style={{width:36,height:36,borderRadius:8,objectFit:"contain",flexShrink:0,background:"white",padding:2}}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{fontWeight:700,color:"white",fontSize:12,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:0.5}}>CHNCAK · PharmaStock</div>
        <div onClick={activeSupplier?onChangeSupplier:undefined}
          style={{fontSize:11,color:"#38bdf8",cursor:activeSupplier?"pointer":"default",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {activeSupplier ? ("🏢 "+activeSupplier.name) : "Aucun fournisseur sélectionné"}
        </div>
      </div>
      {unread>0&&page!=="messagerie"&&(
        <div onClick={()=>onNav&&onNav("messagerie")} style={{background:"#ef4444",color:"white",borderRadius:99,padding:"2px 7px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>✉ {unread}</div>
      )}
      {hasAIAccess && (
        <button onClick={onAI} style={{...btn(),background:aiOpen?"#7c3aed":"rgba(124,58,237,0.75)",color:"white",padding:"6px 10px",flexShrink:0}}>🤖</button>
      )}
      <button onClick={onProfile} title={"Mon profil : "+(userName||"")}
        style={{...btn(),background:"rgba(255,255,255,0.1)",color:"white",border:"1px solid rgba(255,255,255,0.2)",padding:"6px 10px",flexShrink:0,fontSize:15}}>👤</button>
      <button onClick={onLogout} title="Déconnexion"
        style={{...btn(),background:"rgba(239,68,68,0.15)",color:"#fca5a5",border:"1px solid rgba(239,68,68,0.3)",padding:"6px 10px",flexShrink:0}}>⏻</button>
    </div>
  );
}
