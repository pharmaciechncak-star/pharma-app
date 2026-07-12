import { btn, card } from "../../helpers/styles";
import { LOGO_B64 } from "../../images";
import { Badge } from "./FormControls";

export function Modal({open,onClose,title,children}){
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:16,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>{title}</div>
          <button onClick={onClose} style={{...btn(),background:"#f1f5f9",color:"#64748b",padding:"6px 10px"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDelete({open, onClose, onConfirm, label}) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:14,padding:28,maxWidth:360,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:40,textAlign:"center",marginBottom:12}}>🗑️</div>
        <div style={{fontWeight:700,fontSize:16,color:"#1e293b",textAlign:"center",marginBottom:8}}>Confirmer la suppression</div>
        <div style={{fontSize:13,color:"#64748b",textAlign:"center",marginBottom:24,lineHeight:1.5}}>
          Êtes-vous sûr de vouloir supprimer <b>"{label}"</b> ?<br/>
          <span style={{color:"#ef4444",fontSize:11}}>Cette action est irréversible.</span>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:10,background:"#f1f5f9",color:"#374151",border:"none",borderRadius:8,cursor:"pointer",fontWeight:600}}>Annuler</button>
          <button onClick={()=>{onConfirm();onClose();}} style={{flex:1,padding:10,background:"#ef4444",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700}}>🗑️ Supprimer</button>
        </div>
      </div>
    </div>
  );
}

export function SupplierSelector({open,suppliers,current,onSelect,onClose}){
  return(
    <Modal open={open} onClose={onClose} title="🏢 Sélectionner un Fournisseur">
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f0f9ff",borderRadius:10,marginBottom:14}}>
        <img src={LOGO_B64} alt="CHNCAK" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}}/>
        <div style={{fontSize:12,color:"#0891b2",fontWeight:600}}>CHNCAK PharmaStock — Le fournisseur actif s'applique à toutes les opérations.</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {suppliers.map(s=>(
          <div key={s.id} onClick={()=>onSelect(s)} style={{
            ...card, cursor:"pointer", padding:16,
            border: current?.id===s.id ? "2px solid #0891b2" : "1.5px solid #e2e8f0",
            background: current?.id===s.id ? "#f0f9ff" : "white",
          }}>
            <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>🏢 {s.name}</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{s.email} · {s.phone}</div>
            <div style={{fontSize:12,color:"#94a3b8"}}>{s.address}</div>
            {current?.id===s.id && <div style={{marginTop:6}}><Badge color="#0891b2">✓ Actif</Badge></div>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
