import { useRef } from "react";
import { LOGO_B64 } from "../../images";
import { Barcode } from "../ui/Barcode";
import { computeAge } from "../../helpers/age";

export function PrintModal({ open, onClose, title, children }) {
  const contentRef = useRef(null);
  if (!open) return null;

  const handlePrint = () => {
    const content = contentRef.current;
    if (!content) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const css = `body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;line-height:1.5;padding:20px 28px;margin:0;}
table{width:100%;border-collapse:collapse;margin-bottom:14px;}
th,td{padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:left;}
th{background:#f8fafc;font-weight:700;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;}
.total-row td,.tfoot-row td{background:#f0f9ff;font-weight:800;color:#0891b2;}
.ph-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #0891b2;}
.ph-logo{display:flex;align-items:center;gap:10px;}
.ph-logo img{width:55px;height:55px;border-radius:50%;object-fit:cover;}
.ph-org{font-size:14px;font-weight:800;color:#0891b2;}
.ph-sub{font-size:9px;color:#64748b;line-height:1.4;}
.ph-doctitle{font-size:16px;font-weight:800;text-align:right;}
.ph-docref{font-size:11px;color:#64748b;font-family:monospace;text-align:right;}
.footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;}
@page{margin:12mm;}`;
    doc.open();
    doc.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + title + "</title><style>" + css + "</style></head><body>" + content.innerHTML + "</body></html>");
    doc.close();
    setTimeout(()=>{
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(()=>{ try{document.body.removeChild(iframe);}catch{} }, 2000);
    }, 350);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:600, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:16, overflowY:"auto" }}>
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:720, marginTop:10, marginBottom:10, boxShadow:"0 24px 60px rgba(0,0,0,0.35)" }}>
        {/* Barre d'actions */}
        <div style={{ padding:"12px 20px", borderBottom:"1px solid #e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#f8fafc", borderRadius:"16px 16px 0 0" }}>
          <div style={{ fontWeight:700, color:"#1e293b", fontSize:14 }}>🖨️ {title}</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handlePrint} style={{ background:"#0891b2", color:"white", border:"none", borderRadius:8, padding:"7px 16px", cursor:"pointer", fontWeight:600, fontSize:13 }}>
              🖨️ Imprimer
            </button>
            <button onClick={onClose} style={{ background:"#f1f5f9", color:"#374151", border:"none", borderRadius:8, padding:"7px 12px", cursor:"pointer", fontWeight:600 }}>
              ✕ Fermer
            </button>
          </div>
        </div>
        {/* Contenu visible + ref pour impression */}
        <div ref={contentRef} style={{ padding:"28px 32px", fontFamily:"Arial, sans-serif", fontSize:13, color:"#1e293b", lineHeight:1.5 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function InvoicePrint({ inv }) {
  if (!inv) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  return (
    <div>
      {/* En-tête */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={LOGO_B64} alt="CHNCAK" style={{width:60,height:60,borderRadius:"50%",objectFit:"cover"}}/>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#0891b2",lineHeight:1.2}}>CHNCAK</div>
              <div style={{fontSize:10,color:"#64748b",lineHeight:1.4}}>Centre Hospitalier National<br/>Cheikh Ahmadoul Khadim</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>PharmaStock — Gestion Pharmaceutique</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:20, fontWeight:800, color:"#1e293b" }}>FACTURE</div>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b" }}>{inv.reference}</div>
          <div style={{
              background: inv.status==="envoyée"?"#dcfce7": inv.status==="payée"?"#ede9fe":"#fef3c7",
              color:      inv.status==="envoyée"?"#059669": inv.status==="payée"?"#7c3aed":"#d97706",
              display:"inline-block", padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700, marginTop:4
            }}>{inv.status||"en attente"}</div>
        </div>
      </div>
      {/* Méta */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {[["Fournisseur", inv.supplier], ["Période", inv.month], ["Date d'émission", inv.date ? new Date(inv.date).toLocaleDateString("fr-FR") : "—"], ["Établi par", inv.createdByName||"—"], ["Statut", inv.status]].map(([l, v]) => (
          <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:14, fontWeight:600, color:"#1e293b" }}>{v}</div>
          </div>
        ))}
      </div>
      {/* Articles */}
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Référence","Produit","Qté","Prix Unit.","Total"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(inv.items || []).map((it, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, fontFamily:"monospace", color:"#64748b" }}>{it.ref || "—"}</td>
              <td style={{ ...tdStyle, fontWeight:600 }}>{it.productName}</td>
              <td style={tdStyle}>{it.qty}</td>
              <td style={tdStyle}>{Number(it.unitPrice || 0).toLocaleString("fr-FR")} FCFA</td>
              <td style={{ ...tdStyle, fontWeight:700, color:"#0891b2" }}>{Number(it.total || 0).toLocaleString("fr-FR")} FCFA</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background:"#f0f9ff" }}>
            <td colSpan={4} style={{ ...tdStyle, fontWeight:800, color:"#1e293b", fontSize:14 }}>TOTAL GÉNÉRAL</td>
            <td style={{ ...tdStyle, fontWeight:800, color:"#0891b2", fontSize:18 }}>{Number(inv.total || 0).toLocaleString("fr-FR")} FCFA</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function BonPrint({ bon, suppName, depotName, products }) {
  if (!bon) return null;
  const isEntry = bon.type === "entry";
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={LOGO_B64} alt="CHNCAK" style={{width:55,height:55,borderRadius:"50%",objectFit:"cover"}}/>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#0891b2"}}>CHNCAK</div>
              <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>PharmaStock</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>{isEntry ? "BON D'ENTRÉE" : "BON DE RETOUR"}</div>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b" }}>{bon.reference}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {[["Fournisseur", suppName], ["Dépôt", depotName], ["Date", bon.date ? new Date(bon.date).toLocaleDateString("fr-FR") : "—"], ["Saisi par", bon.createdByName||"—"], ["Observations", bon.notes || "—"]].map(([l,v]) => (
          <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{v}</div>
          </div>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Quantité","Prix Unit.","N° Lot","Expiration"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(bon.items || []).map((it, i) => {
            const prod = products?.find(p => p.id === it.productId);
            return (
              <tr key={i}>
                <td style={{ ...tdStyle, fontWeight:600 }}>{prod?.name || it.productName || "—"}</td>
                <td style={tdStyle}>{it.qty}</td>
                <td style={tdStyle}>{Number(it.unitPrice || 0).toLocaleString("fr-FR")} FCFA</td>
                <td style={{ ...tdStyle, fontFamily:"monospace" }}>{it.lot || "—"}</td>
                <td style={tdStyle}>{it.expiry || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ConsumptionPrint({ c }) {
  if (!c) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const dateStr = c.createdAt?.seconds ? new Date(c.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={LOGO_B64} alt="CHNCAK" style={{width:55,height:55,borderRadius:"50%",objectFit:"cover"}}/>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#0891b2"}}>CHNCAK</div>
              <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>PharmaStock</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>BON DE CONSOMMATION</div>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b" }}>{c.id}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {[["Service", c.serviceName||"—"], ["Patient", c.patientName||"—"], ["Patient ID (voir cubix)", c.patientId||"—"], ["Âge", c.patientBirthDate?computeAge(c.patientBirthDate)+" ans":(c.patientAge||"—")], ["Date", dateStr], ["Saisi par", c.consumedByName||"—"], ["Observations", c.note||"—"]].map(([l,v]) => (
          <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{v}</div>
          </div>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Code-barre","Quantité"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(c.items || []).map((it, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{it.productName || "—"}</td>
              <td style={{ ...tdStyle, fontFamily:"monospace", color:"#64748b" }}>
                {it.barcode ? <Barcode value={it.barcode} height={28} fontSize={9} margin={2}/> : "—"}
              </td>
              <td style={tdStyle}>{it.qty} unité(s)</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign:"right", marginTop:40, paddingRight:20 }}>
        <div style={{ display:"inline-block", fontWeight:700, fontSize:12, borderBottom:"1px solid #1e293b", paddingBottom:2 }}>Le Cardiologue</div>
        <div style={{ height:60 }}></div>
      </div>
    </div>
  );
}

export function TransferPrint({ t }) {
  if (!t) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const dateStr = t.createdAt?.seconds ? new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  const statusLabel = t.status==="confirme" ? "✅ Conforme" : t.status==="non_conforme" ? "⚠️ Non conforme" : "⏳ En attente de confirmation";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#0891b2"}}>CHNCAK — PharmaStock</div>
          <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>BON DE TRANSFERT</div>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b" }}>{t.id}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {[["Destination", t.serviceName||"—"], ["Statut", statusLabel], ["Date", dateStr], ["Envoyé par", t.transferredByName||"—"], ["Confirmé par", t.confirmedByName||"—"], ["Observations", t.notes||"—"]].map(([l,v]) => (
          <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{v}</div>
          </div>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Péremption","Qté envoyée","Qté confirmée","Écart"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(t.items || []).map((it, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{it.productName || "—"}</td>
              <td style={tdStyle}>{it.expiry || "—"}</td>
              <td style={tdStyle}>{it.qtyOriginal!=null ? it.qtyOriginal : it.qty}</td>
              <td style={tdStyle}>{it.qtyConfirmed!=null ? it.qtyConfirmed : "—"}</td>
              <td style={{ ...tdStyle, color: it.ecart<0 ? "#b91c1c" : it.ecart>0 ? "#0e7490" : "inherit", fontWeight: it.ecart!==0 ? 700 : 400 }}>{it.ecart ? (it.ecart>0?"+":"")+it.ecart : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:50, paddingTop:10 }}>
        {["Le Pharmacien","Le Gestionnaire de stock","Le Service bénéficiaire"].map(sig => (
          <div key={sig} style={{ textAlign:"center", width:"30%" }}>
            <div style={{ fontWeight:700, fontSize:11, borderBottom:"1px solid #1e293b", paddingBottom:2, marginBottom:2 }}>{sig}</div>
            <div style={{ height:55 }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SvcReturnPrint({ r }) {
  if (!r) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const dateStr = r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  const statusLabel = r.status==="confirme" ? "✅ Conforme" : r.status==="non_conforme" ? "⚠️ Non conforme" : "⏳ En attente de contrôle";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#0891b2"}}>CHNCAK — PharmaStock</div>
          <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>BON DE RETOUR SERVICE</div>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b" }}>{r.id}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {[["Service", r.serviceName||"—"], ["Statut", statusLabel], ["Date", dateStr], ["Retourné par", r.returnedByName||"—"], ["Contrôlé par", r.confirmedByName||"—"], ["Observations", r.notes||"—"]].map(([l,v]) => (
          <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{v}</div>
          </div>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Péremption","Qté annoncée","Qté confirmée","Écart"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(r.items || []).map((it, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{it.productName || "—"}</td>
              <td style={tdStyle}>{it.expiry || "—"}</td>
              <td style={tdStyle}>{it.qtyOriginal!=null ? it.qtyOriginal : it.qty}</td>
              <td style={tdStyle}>{it.qtyConfirmed!=null ? it.qtyConfirmed : "—"}</td>
              <td style={{ ...tdStyle, color: it.ecart<0 ? "#b91c1c" : it.ecart>0 ? "#0e7490" : "inherit", fontWeight: it.ecart!==0 ? 700 : 400 }}>{it.ecart ? (it.ecart>0?"+":"")+it.ecart : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InventoryChecklistPrint({ products, scopeLabel, currentQtyLabel }) {
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#0891b2"}}>CHNCAK — PharmaStock</div>
          <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>LISTE D'INVENTAIRE — STOCK (2)</div>
          <div style={{ fontSize:12, color:"#64748b" }}>{scopeLabel}</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>{new Date().toLocaleDateString("fr-FR")}</div>
        </div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit", currentQtyLabel, "Quantité comptée", "Écart"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(products || []).map((p, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{p.name}</td>
              <td style={tdStyle}>{p.computed}</td>
              <td style={{ ...tdStyle, borderBottom:"1px solid #94a3b8", minWidth:80 }}>&nbsp;</td>
              <td style={{ ...tdStyle, borderBottom:"1px solid #94a3b8", minWidth:80 }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:50, paddingTop:10 }}>
        {["Compté par","Vérifié par"].map(sig => (
          <div key={sig} style={{ textAlign:"center", width:"45%" }}>
            <div style={{ fontWeight:700, fontSize:11, borderBottom:"1px solid #1e293b", paddingBottom:2, marginBottom:2 }}>{sig}</div>
            <div style={{ fontSize:9, color:"#94a3b8" }}>Nom et signature</div>
            <div style={{ height:50 }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Stock2InventoryHistoryPrint({ lines, scopeLabel }) {
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const statusLabel = s => s==="confirme" ? "✅ Confirmé" : s==="rejete" ? "✕ Rejeté" : "⏳ En attente";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#0891b2"}}>CHNCAK — PharmaStock</div>
          <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>HISTORIQUE D'INVENTAIRE — STOCK (2)</div>
          <div style={{ fontSize:12, color:"#64748b" }}>{scopeLabel}</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>{new Date().toLocaleDateString("fr-FR")}</div>
        </div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Date","Produit","Calculé","Compté","Écart","Statut","Par"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(lines || []).map((l, i) => (
            <tr key={i}>
              <td style={tdStyle}>{l.date}</td>
              <td style={{ ...tdStyle, fontWeight:600 }}>{l.productName}</td>
              <td style={tdStyle}>{l.computedQty}</td>
              <td style={tdStyle}>{l.countedQty}</td>
              <td style={{ ...tdStyle, color: l.ecart<0 ? "#b91c1c" : l.ecart>0 ? "#0e7490" : "inherit", fontWeight: l.ecart!==0 ? 700 : 400 }}>{l.ecart>0?"+":""}{l.ecart}</td>
              <td style={tdStyle}>{statusLabel(l.status)}</td>
              <td style={tdStyle}>{l.by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SortieFonctPrint({ s, products }) {
  if (!s) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const statusLabel = s.status==="annule" ? "🚫 Annulé" : "✅ Envoyé";
  const dateStr = s.createdAt?.seconds ? new Date(s.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  const dateForCert = s.createdAt?.seconds ? new Date(s.createdAt.seconds*1000).toLocaleDateString("fr-FR") : "—";
  const totalUnites = (s.items||[]).reduce((sum,it)=>sum+Number(it.qty||0),0);
  const totalMontant = (s.items||[]).reduce((sum,it)=>{
    const p = (products||[]).find(x=>x.id===it.productId);
    return sum + Number(it.qty||0)*Number(p?.price||0);
  },0);
  const fmt = n => n.toLocaleString("fr-FR", { minimumFractionDigits: n%1!==0?2:0, maximumFractionDigits:2 });
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, paddingBottom:16, borderBottom:"2px solid #e2e8f0" }}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#9a3412"}}>CHNCAK — Comptabilité Matières</div>
          <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800 }}>BON DE SORTIE — FONCTIONNEMENT</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>{dateStr}</div>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#374151", marginBottom:16 }}>
        <span>Réf : <b>{s.reference||"—"}</b></span>
        <span>Destination : <b>{s.serviceName||"—"}</b></span>
        <span>Statut : <b>{statusLabel}</b></span>
        <span>Envoyé par : <b>{s.sentByName||"—"}</b></span>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Péremption","Quantité"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(s.items || []).map((it, i) => (
            <tr key={i}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{it.productName || "—"}</td>
              <td style={tdStyle}>{it.expiry || "—"}</td>
              <td style={tdStyle}>{it.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.notes&&<div style={{fontSize:11,color:"#64748b",fontStyle:"italic",marginBottom:16}}>Observations : {s.notes}</div>}
      <table style={{ width:"100%", borderCollapse:"collapse", marginTop:30 }}>
        <tbody>
          <tr>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>CERTIFICATION</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Arrête le présent bon à <b>{fmt(totalUnites)}</b> Unités<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> francs<br/><br/>
                dont je certifie la prise en charge<br/>
                A Dakar &nbsp; le {dateForCert}<br/><br/>
                <u><b>L'Ordonnateur des Matières</b></u>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>DIMINUTION DES PRISES EN CHARGE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                le comptable des matières soussigné, déclare ce jour diminuer ses prises en charge de <b>{fmt(totalUnites)}</b> unités,<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/>
                A Dakar &nbsp; le {dateForCert}<br/><br/>
                <u><b>Le Comptable des matières</b></u>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"34%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>RECEPISSE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Je soussigné ______________________<br/>
                {s.serviceName||"—"}<br/>
                reconnait avoir reçu les matières portées au présent bon<br/>
                à Dakar &nbsp; le {dateForCert}<br/><br/>
                <u><b>Le réceptionnaire</b></u>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Grand Livre des Comptes & Fiche de Stock — circuit fonctionnement ──
// Formats standards de la comptabilité matières publique : suivi ligne à
// ligne des entrées/sorties d'un produit, avec solde ("Existant") couru.
// Le Grand Livre valorise en plus chaque mouvement (P.U. × Existant).

export function GrandLivrePrint({ product, rows, periodFrom, periodTo }) {
  const thStyle = { padding:"7px 8px", textAlign:"center", fontSize:9.5, fontWeight:700, color:"white", background:"#78350f", border:"1px solid #78350f" };
  const tdStyle = { padding:"6px 8px", fontSize:9.5, border:"1px solid #ddd" };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:12, borderBottom:"2px solid #78350f" }}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#9a3412"}}>CHNCAK — Comptabilité Matières</div>
          <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
          <div style={{fontSize:9,color:"#64748b",marginTop:4}}>Période du <b>{periodFrom||"—"}</b> au <b>{periodTo||"—"}</b></div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:17, fontWeight:800 }}>GRAND LIVRE DES COMPTES</div>
          <div style={{ fontSize:9, color:"#94a3b8" }}>Modèle N°7 — Art. 18a</div>
        </div>
      </div>
      <div style={{fontSize:10.5,marginBottom:12,lineHeight:1.9}}>
        <div>NATURE DE L'UNITÉ : <b>{product?.unit||"—"}</b></div>
        <div>COMPTE N° : <b>{product?.compteNumero||"—"}</b></div>
        <div>INTITULÉ : <b>{product?.name||"—"}</b></div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th style={{...thStyle,width:"9%"}}>Date</th>
            <th style={{...thStyle,width:"10%"}}>Bon</th>
            <th style={{...thStyle,width:"22%"}}>Origine des entrées et destination des sorties</th>
            <th style={{...thStyle,width:"7%"}}>Entrées</th>
            <th style={{...thStyle,width:"9%"}}>Sorties définitives</th>
            <th style={{...thStyle,width:"7%"}}>P.U.</th>
            <th style={{...thStyle,width:"8%"}}>Existant</th>
            <th style={{...thStyle,width:"11%"}}>Montant de l'existant</th>
            <th style={{...thStyle,width:"9%"}}>Sorties Provisoires</th>
            <th style={{...thStyle,width:"8%"}}>Date de retour</th>
          </tr>
        </thead>
        <tbody>
          {(rows||[]).map((r,i)=>(
            <tr key={i} style={{background:i%2===0?"white":"#fef9f3"}}>
              <td style={tdStyle}>{r.date}</td>
              <td style={tdStyle}>{r.bon}</td>
              <td style={tdStyle}>{r.origine}</td>
              <td style={{...tdStyle,textAlign:"center",color:"#059669",fontWeight:700}}>{r.entree||""}</td>
              <td style={{...tdStyle,textAlign:"center",color:"#dc2626",fontWeight:700}}>{r.sortie||""}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{r.pu.toLocaleString("fr-FR")}</td>
              <td style={{...tdStyle,textAlign:"center",fontWeight:700}}>{r.existant}</td>
              <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{r.montant.toLocaleString("fr-FR")}</td>
              <td style={tdStyle}></td>
              <td style={tdStyle}></td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={10} style={{...tdStyle,textAlign:"center",color:"#94a3b8"}}>Aucun mouvement sur cette période.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function FicheStockPrint({ product, rows, periodFrom, periodTo }) {
  const thStyle = { padding:"7px 8px", textAlign:"center", fontSize:9.5, fontWeight:700, background:"#f1f5f9", border:"1px solid #cbd5e1" };
  const tdStyle = { padding:"6px 8px", fontSize:9.5, border:"1px solid #ddd", textAlign:"center" };
  return (
    <div>
      <div style={{marginBottom:16,paddingBottom:12,borderBottom:"2px solid #1e293b"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>CHNCAK — Comptabilité Matières</div>
        <div style={{fontSize:9,color:"#64748b",marginBottom:8}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        <div style={{fontSize:16,fontWeight:800}}>FICHE DE STOCK DU <span style={{fontWeight:400}}>{periodFrom||"—"}</span> au <span style={{fontWeight:400}}>{periodTo||"—"}</span></div>
      </div>
      <div style={{fontSize:10.5,marginBottom:12,lineHeight:1.9}}>
        <div>COMPTE N° : <b>{product?.compteNumero||"—"}</b> &nbsp;&nbsp; NATURE DE L'UNITÉ : <b>{product?.unit||"—"}</b></div>
        <div>INTITULÉ : <b>{product?.name||"—"}</b></div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th style={{...thStyle,width:"9%"}} rowSpan={2}>Date des opérations</th>
            <th style={{...thStyle}} colSpan={2}>ENTRÉE</th>
            <th style={{...thStyle}} colSpan={3}>SORTIE</th>
            <th style={{...thStyle,width:"8%"}} rowSpan={2}>Stock à la date</th>
            <th style={{...thStyle,width:"10%"}} rowSpan={2}>Contrôlé par</th>
          </tr>
          <tr>
            <th style={{...thStyle,width:"8%"}}>N° Bon</th>
            <th style={{...thStyle,width:"8%"}}>Quantité</th>
            <th style={{...thStyle,width:"20%"}}>Destinataire</th>
            <th style={{...thStyle,width:"8%"}}>N° Bon</th>
            <th style={{...thStyle,width:"8%"}}>Quantité</th>
          </tr>
        </thead>
        <tbody>
          {(rows||[]).map((r,i)=>(
            <tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>
              <td style={tdStyle}>{r.date}</td>
              <td style={tdStyle}>{r.entreeBon||""}</td>
              <td style={{...tdStyle,color:"#059669",fontWeight:700}}>{r.entreeQty||""}</td>
              <td style={{...tdStyle,textAlign:"left"}}>{r.destinataire||""}</td>
              <td style={tdStyle}>{r.sortieBon||""}</td>
              <td style={{...tdStyle,color:"#dc2626",fontWeight:700}}>{r.sortieQty||""}</td>
              <td style={{...tdStyle,fontWeight:700}}>{r.stock}</td>
              <td style={tdStyle}></td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={8} style={{...tdStyle,color:"#94a3b8"}}>Aucun mouvement sur cette période.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Consommation Matières par service — liste valorisée de tout ce qui a été
// remis à UN service sur une période (reconstruite à partir des Bons de
// Sortie), avec le bloc de certification en trois parties (Ordonnateur des
// Matières / Comptable des Matières / Réceptionnaire) propre à ce document.
export function ConsommationMatieresPrint({ serviceName, rows, periodFrom, periodTo }) {
  const thStyle = { padding:"8px 10px", textAlign:"center", fontSize:10.5, fontWeight:700, border:"1px solid #94a3b8", background:"#f1f5f9" };
  const tdStyle = { padding:"7px 10px", fontSize:10.5, border:"1px solid #ddd" };
  const totalUnites = (rows||[]).reduce((s,r)=>s+Number(r.qty||0),0);
  const totalMontant = (rows||[]).reduce((s,r)=>s+Number(r.montant||0),0);
  const fmt = n => n.toLocaleString("fr-FR", { minimumFractionDigits: n%1!==0?2:0, maximumFractionDigits:2 });
  return (
    <div>
      <div style={{marginBottom:6,fontSize:12,fontWeight:700,textDecoration:"underline"}}>Ministère de la Santé et de l'Hygiène Publique</div>
      <div style={{fontSize:9,color:"#64748b",marginBottom:20}}>CHNCAK — Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
      <div style={{textAlign:"center",fontSize:15,fontWeight:800,textDecoration:"underline",marginBottom:24}}>Consommation Matières par service</div>
      <div style={{fontSize:11,marginBottom:20,lineHeight:2}}>
        <div><u><b>Service :</b></u> &nbsp;{serviceName||"—"}</div>
        <div><u><b>Période du :</b></u> &nbsp;{periodFrom||"—"} &nbsp;&nbsp;<u><b>au :</b></u> &nbsp;{periodTo||"—"}</div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:20 }}>
        <thead>
          <tr>
            <th style={{...thStyle,width:"14%"}}>Nomenclature</th>
            <th style={{...thStyle,width:"40%",textAlign:"left"}}>Nom du produit</th>
            <th style={{...thStyle,width:"12%"}}>Quantité</th>
            <th style={{...thStyle,width:"14%"}}>Prix unitaire</th>
            <th style={{...thStyle,width:"20%"}}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {(rows||[]).map((r,i)=>(
            <tr key={i}>
              <td style={tdStyle}>{r.compteNumero||"—"}</td>
              <td style={{...tdStyle,textAlign:"left"}}>{r.productName}</td>
              <td style={{...tdStyle,textAlign:"center"}}>{r.qty}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{fmt(r.pu)}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{fmt(r.montant)}</td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={5} style={{...tdStyle,textAlign:"center",color:"#94a3b8"}}>Aucune consommation sur cette période.</td></tr>}
        </tbody>
      </table>

      <table style={{ width:"100%", borderCollapse:"collapse", marginTop:30 }}>
        <tbody>
          <tr>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>CERTIFICATION</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Arrête le présent bon à <b>{fmt(totalUnites)}</b> Unités<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> francs<br/><br/>
                dont je certifie la prise en charge<br/>
                A Dakar &nbsp; le {periodTo||"—"}<br/><br/>
                <u><b>L'Ordonnateur des Matières</b></u>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>DIMINUTION DES PRISES EN CHARGE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                le comptable des matières soussigné, déclare ce jour diminuer ses prises en charge de <b>{fmt(totalUnites)}</b> unités,<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/>
                A Dakar &nbsp; le {periodTo||"—"}<br/><br/>
                <u><b>Le Comptable des matières</b></u>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"34%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>RECEPISSE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Je soussigné ______________________<br/>
                {serviceName||"—"}<br/>
                reconnait avoir reçu les matières portées au présent bon<br/>
                à Dakar &nbsp; le {periodTo||"—"}<br/><br/>
                <u><b>Le réceptionnaire</b></u>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
