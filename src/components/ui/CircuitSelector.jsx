import { useState } from "react";
import { COMPTA_CIRCUITS as DEFAULT_CIRCUITS } from "../../helpers/circuitsConfig";
import { card } from "../../helpers/styles";
import { Modal } from "./Modal";

// Même principe que le sélecteur de fournisseur actif : un label cliquable
// qui ouvre une modale listant les circuits disponibles, en carte, à choisir
// d'un clic. N'affiche rien si l'utilisateur n'a accès qu'à un seul circuit
// — inutile de lui demander de choisir ce qu'il ne peut de toute façon pas
// changer. `circuits` (optionnel) permet au parent de passer la version avec
// les surcharges label/icône de Paramètres déjà fusionnées.
export function CircuitSelector({ circuit, setCircuit, available, circuits }) {
  const [open,setOpen] = useState(false);
  if (!available || available.length <= 1) return null;
  const CIRCUITS = circuits || DEFAULT_CIRCUITS;
  const cfg = CIRCUITS[circuit];
  return (
    <>
      <div onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",marginBottom:12,width:"fit-content"}}>
        <span style={{fontWeight:700,fontSize:12,color:cfg.accentColor}}>{cfg.icon} {cfg.label}</span>
        <span style={{fontSize:10,color:"#94a3b8"}}>▾ changer de circuit</span>
      </div>
      <Modal open={open} onClose={()=>setOpen(false)} title="🔀 Choisir un circuit">
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {available.map(c=>{
            const cc = CIRCUITS[c];
            const active = circuit===c;
            return (
              <div key={c} onClick={()=>{setCircuit(c);setOpen(false);}} style={{
                ...card, cursor:"pointer", padding:16,
                border: active ? "2px solid "+cc.accentColor : "1.5px solid #e2e8f0",
                background: active ? "#f8fafc" : "white",
              }}>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{cc.icon} {cc.label}</div>
                {active && <div style={{marginTop:6,fontSize:11,fontWeight:700,color:cc.accentColor}}>✓ Actif</div>}
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
