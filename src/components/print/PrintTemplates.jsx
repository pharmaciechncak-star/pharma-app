import { useRef, useState, cloneElement } from "react";
import { LOGO_B64, IMG_CARDIO_SRC, IMG_LABEL_SRC, IMG_CHNCAK_SRC } from "../../images";
import { Barcode } from "../ui/Barcode";
import { computeAge } from "../../helpers/age";
import { fmtDate } from "../../constants";
import { numberToWords } from "../../helpers/exportUtils";

// En-tête officiel — République du Sénégal / Ministère / CHNCAK, avec les
// trois logos — partagé par tous les documents imprimables pour rester
// cohérent avec celui déjà utilisé sur les Bons d'Entrée.
function OfficialHeader() {
  const eln = { display:"inline-block", borderBottom:"1px solid #999", paddingBottom:1 };
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", borderBottom:"2px solid #065f46", paddingBottom:8, marginBottom:10 }}>
      <div style={{ flexShrink:0, width:70 }}>
        <img src={IMG_CARDIO_SRC} alt="" style={{width:65,height:80,objectFit:"contain"}}/>
      </div>
      <div style={{ flex:1, textAlign:"center", fontSize:9.5, lineHeight:1.8, color:"#111", padding:"0 8px" }}>
        <div style={{ fontSize:12, fontWeight:800 }}>République du Sénégal</div>
        <div><span style={eln}>Un peuple - un but - une foi</span></div>
        <div><span style={eln}>Ministère de la Santé et de l'Hygiène Publique</span></div>
        <div><span style={eln}>Direction Générale des Établissements de Santé</span></div>
        <div><span style={eln}>Direction des Établissements Publics de Santé</span></div>
        <div style={{ fontWeight:800 }}><span style={eln}>Centre Hospitalier National Cheikh Ahmadoul Khadim</span></div>
      </div>
      <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:130 }}>
        <img src={IMG_LABEL_SRC} alt="" style={{width:55,height:55,objectFit:"contain"}}/>
        <img src={IMG_CHNCAK_SRC} alt="" style={{width:55,height:42,objectFit:"contain"}}/>
      </div>
    </div>
  );
}

// Espace signature — le nom/titre du signataire d'abord, puis une zone
// encadrée EN DESSOUS, assez grande pour recevoir une signature et un cachet.
function SignatureBox({ label, name }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontWeight:700, fontSize:11, color:"#065f46", textDecoration:"underline", marginBottom:6 }}>{label}</div>
      {name&&<div style={{ fontSize:11, fontWeight:600, color:"#1e293b", marginBottom:6 }}>{name}</div>}
      <div style={{ border:"1px dashed #94a3b8", borderRadius:4, height:70 }}></div>
    </div>
  );
}

export function PrintModal({ open, onClose, title, children, signatories, onExcel, onPdf }) {
  const contentRef = useRef(null);
  const [names, setNames] = useState({});
  if (!open) return null;

  const printableChildren = signatories && signatories.length>0
    ? cloneElement(children, { signatoryNames: names })
    : children;

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
            {onExcel&&<button onClick={onExcel} style={{ background:"#dcfce7", color:"#166534", border:"none", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontWeight:600, fontSize:13 }}>
              ⬇️ Excel
            </button>}
            {onPdf&&<button onClick={onPdf} style={{ background:"#fef3c7", color:"#92400e", border:"none", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontWeight:600, fontSize:13 }}>
              📄 PDF
            </button>}
            <button onClick={onClose} style={{ background:"#f1f5f9", color:"#374151", border:"none", borderRadius:8, padding:"7px 12px", cursor:"pointer", fontWeight:600 }}>
              ✕ Fermer
            </button>
          </div>
        </div>
        {signatories && signatories.length>0 && (
          <div style={{ padding:"14px 20px", borderBottom:"1px solid #e2e8f0", background:"#fffbeb" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#92400e", marginBottom:8 }}>✍️ Noms des signataires <span style={{fontWeight:400}}>(optionnel — apparaîtront sur le document imprimé)</span></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {signatories.map(role=>(
                <div key={role}>
                  <div style={{ fontSize:10, color:"#78350f", marginBottom:2 }}>{role}</div>
                  <input value={names[role]||""} onChange={e=>setNames(n=>({...n,[role]:e.target.value}))}
                    placeholder="Nom du signataire"
                    style={{ width:"100%", padding:"6px 8px", border:"1px solid #fde68a", borderRadius:6, fontSize:12, boxSizing:"border-box" }}/>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Contenu visible + ref pour impression */}
        <div ref={contentRef} style={{ padding:"28px 32px", fontFamily:"Arial, sans-serif", fontSize:13, color:"#1e293b", lineHeight:1.5 }}>
          {printableChildren}
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
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:10 }}>FACTURE</div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b" }}>{inv.reference}</div>
        <div style={{
            background: inv.status==="envoyée"?"#dcfce7": inv.status==="payée"?"#ede9fe":"#fef3c7",
            color:      inv.status==="envoyée"?"#059669": inv.status==="payée"?"#7c3aed":"#d97706",
            display:"inline-block", padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700
          }}>{inv.status||"en attente"}</div>
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

export function BonPrint({ bon, suppName, depotName, products, signatoryNames }) {
  if (!bon) return null;
  const isEntry = bon.type === "entry";
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:10 }}>{isEntry ? "BON D'ENTRÉE" : "BON DE RETOUR"}</div>
      <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b", textAlign:"right", marginBottom:10 }}>{bon.reference}</div>
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
                <td style={tdStyle}>{fmtDate(it.expiry) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginTop:30 }}>
        <SignatureBox label={isEntry?"Le Fournisseur":"Le Service"} name={signatoryNames?.[isEntry?"Le Fournisseur":"Le Service"]}/>
        <SignatureBox label="Le Comptable Matière CHNCAK" name={signatoryNames?.["Le Comptable Matière CHNCAK"]}/>
      </div>
    </div>
  );
}

export function ConsumptionPrint({ c, signatoryNames }) {
  if (!c) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const dateStr = c.createdAt?.seconds ? new Date(c.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:10 }}>BON DE CONSOMMATION</div>
      <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b", textAlign:"right", marginBottom:10 }}>{c.id}</div>
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
      <div style={{ width:"45%", marginLeft:"auto", marginTop:30 }}>
        <SignatureBox label="Le Cardiologue" name={signatoryNames?.["Le Cardiologue"]}/>
      </div>
    </div>
  );
}

export function TransferPrint({ t, signatoryNames }) {
  if (!t) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const dateStr = t.createdAt?.seconds ? new Date(t.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  const statusLabel = t.status==="confirme" ? "✅ Conforme" : t.status==="non_conforme" ? "⚠️ Non conforme" : "⏳ En attente de confirmation";
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:10 }}>BON DE TRANSFERT</div>
      <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b", textAlign:"right", marginBottom:10 }}>{t.id}</div>
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
              <td style={tdStyle}>{fmtDate(it.expiry) || "—"}</td>
              <td style={tdStyle}>{it.qtyOriginal!=null ? it.qtyOriginal : it.qty}</td>
              <td style={tdStyle}>{it.qtyConfirmed!=null ? it.qtyConfirmed : "—"}</td>
              <td style={{ ...tdStyle, color: it.ecart<0 ? "#b91c1c" : it.ecart>0 ? "#0e7490" : "inherit", fontWeight: it.ecart!==0 ? 700 : 400 }}>{it.ecart ? (it.ecart>0?"+":"")+it.ecart : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginTop:30 }}>
        {["Le Pharmacien","Le Gestionnaire de stock","Le Service bénéficiaire"].map(sig => <SignatureBox key={sig} label={sig} name={signatoryNames?.[sig]}/>)}
      </div>
    </div>
  );
}

export function SvcReturnPrint({ r, signatoryNames }) {
  if (!r) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const dateStr = r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000).toLocaleString("fr-FR") : "—";
  const statusLabel = r.status==="confirme" ? "✅ Conforme" : r.status==="non_conforme" ? "⚠️ Non conforme" : "⏳ En attente de contrôle";
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:10 }}>BON DE RETOUR SERVICE</div>
      <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b", textAlign:"right", marginBottom:10 }}>{r.id}</div>
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
              <td style={tdStyle}>{fmtDate(it.expiry) || "—"}</td>
              <td style={tdStyle}>{it.qtyOriginal!=null ? it.qtyOriginal : it.qty}</td>
              <td style={tdStyle}>{it.qtyConfirmed!=null ? it.qtyConfirmed : "—"}</td>
              <td style={{ ...tdStyle, color: it.ecart<0 ? "#b91c1c" : it.ecart>0 ? "#0e7490" : "inherit", fontWeight: it.ecart!==0 ? 700 : 400 }}>{it.ecart ? (it.ecart>0?"+":"")+it.ecart : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginTop:30 }}>
        <SignatureBox label="Le Service" name={signatoryNames?.["Le Service"]}/>
        <SignatureBox label="Le Gestionnaire de stock" name={signatoryNames?.["Le Gestionnaire de stock"]}/>
      </div>
    </div>
  );
}

export function InventoryChecklistPrint({ products, scopeLabel, currentQtyLabel, signatoryNames }) {
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:6 }}>LISTE D'INVENTAIRE — STOCK (2)</div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748b", marginBottom:12 }}>
        <span>{scopeLabel}</span>
        <span>{new Date().toLocaleDateString("fr-FR")}</span>
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
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginTop:30 }}>
        <SignatureBox label="Compté par" name={signatoryNames?.["Compté par"]}/>
        <SignatureBox label="Vérifié par" name={signatoryNames?.["Vérifié par"]}/>
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
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:6 }}>HISTORIQUE D'INVENTAIRE — STOCK (2)</div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748b", marginBottom:12 }}>
        <span>{scopeLabel}</span>
        <span>{new Date().toLocaleDateString("fr-FR")}</span>
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

export function SortieComptaPrint({ s, products, signatoryNames, circuitLabel }) {
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
      <OfficialHeader/>
      <div style={{ background:"#065f46", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:6 }}>BON DE SORTIE{circuitLabel?(" — "+circuitLabel.toUpperCase()):""}</div>
      <div style={{ fontSize:11, color:"#94a3b8", textAlign:"right", marginBottom:8 }}>{dateStr}</div>
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
              <td style={tdStyle}>{fmtDate(it.expiry) || "—"}</td>
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
                A Touba &nbsp; le {dateForCert}<br/><br/>
                <u><b>L'Ordonnateur des Matières</b></u><br/>
                {signatoryNames?.["L'Ordonnateur des Matières"]&&<b>{signatoryNames["L'Ordonnateur des Matières"]}</b>}
                <div style={{border:"1px dashed #94a3b8",borderRadius:4,height:70,marginTop:6}}></div>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>DIMINUTION DES PRISES EN CHARGE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                le comptable des matières soussigné, déclare ce jour diminuer ses prises en charge de <b>{fmt(totalUnites)}</b> unités,<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/>
                A Touba &nbsp; le {dateForCert}<br/><br/>
                <u><b>Le Comptable des matières</b></u><br/>
                {signatoryNames?.["Le Comptable des matières"]&&<b>{signatoryNames["Le Comptable des matières"]}</b>}
                <div style={{border:"1px dashed #94a3b8",borderRadius:4,height:70,marginTop:6}}></div>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"34%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>RECEPISSE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Je soussigné {signatoryNames?.["Le réceptionnaire"]||"______________________"}<br/>
                {s.serviceName||"—"}<br/>
                reconnait avoir reçu les matières portées au présent bon<br/>
                à Touba &nbsp; le {dateForCert}<br/><br/>
                <u><b>Le réceptionnaire</b></u><br/>
                {signatoryNames?.["Le réceptionnaire"]&&<b>{signatoryNames["Le réceptionnaire"]}</b>}
                <div style={{border:"1px dashed #94a3b8",borderRadius:4,height:70,marginTop:6}}></div>
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
      <OfficialHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{fontSize:9,color:"#64748b"}}>Période du <b>{fmtDate(periodFrom)||"—"}</b> au <b>{fmtDate(periodTo)||"—"}</b></div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:15, fontWeight:800 }}>GRAND LIVRE DES COMPTES</div>
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
              <td style={tdStyle}>{fmtDate(r.date)}</td>
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
      <OfficialHeader/>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:800}}>FICHE DE STOCK DU <span style={{fontWeight:400}}>{fmtDate(periodFrom)||"—"}</span> au <span style={{fontWeight:400}}>{fmtDate(periodTo)||"—"}</span></div>
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
              <td style={tdStyle}>{fmtDate(r.date)}</td>
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
export function ConsommationMatieresPrint({ serviceName, rows, periodFrom, periodTo, signatoryNames }) {
  const thStyle = { padding:"8px 10px", textAlign:"center", fontSize:10.5, fontWeight:700, border:"1px solid #94a3b8", background:"#f1f5f9" };
  const tdStyle = { padding:"7px 10px", fontSize:10.5, border:"1px solid #ddd" };
  const totalUnites = (rows||[]).reduce((s,r)=>s+Number(r.qty||0),0);
  const totalMontant = (rows||[]).reduce((s,r)=>s+Number(r.montant||0),0);
  const fmt = n => n.toLocaleString("fr-FR", { minimumFractionDigits: n%1!==0?2:0, maximumFractionDigits:2 });
  return (
    <div>
      <OfficialHeader/>
      <div style={{textAlign:"center",fontSize:14,fontWeight:800,textDecoration:"underline",marginBottom:20}}>Consommation Matières par service</div>
      <div style={{fontSize:11,marginBottom:20,lineHeight:2}}>
        <div><u><b>Service :</b></u> &nbsp;{serviceName||"—"}</div>
        <div><u><b>Période du :</b></u> &nbsp;{fmtDate(periodFrom)||"—"} &nbsp;&nbsp;<u><b>au :</b></u> &nbsp;{fmtDate(periodTo)||"—"}</div>
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
                A Touba &nbsp; le {fmtDate(periodTo)||"—"}<br/><br/>
                <u><b>L'Ordonnateur des Matières</b></u><br/>
                {signatoryNames?.["L'Ordonnateur des Matières"]&&<b>{signatoryNames["L'Ordonnateur des Matières"]}</b>}
                <div style={{border:"1px dashed #94a3b8",borderRadius:4,height:70,marginTop:6}}></div>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>DIMINUTION DES PRISES EN CHARGE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                le comptable des matières soussigné, déclare ce jour diminuer ses prises en charge de <b>{fmt(totalUnites)}</b> unités,<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/>
                A Touba &nbsp; le {fmtDate(periodTo)||"—"}<br/><br/>
                <u><b>Le Comptable des matières</b></u><br/>
                {signatoryNames?.["Le Comptable des matières"]&&<b>{signatoryNames["Le Comptable des matières"]}</b>}
                <div style={{border:"1px dashed #94a3b8",borderRadius:4,height:70,marginTop:6}}></div>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"34%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>RECEPISSE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Je soussigné {signatoryNames?.["Le réceptionnaire"]||"______________________"}<br/>
                {serviceName||"—"}<br/>
                reconnait avoir reçu les matières portées au présent bon<br/>
                à Touba &nbsp; le {fmtDate(periodTo)||"—"}<br/><br/>
                <u><b>Le réceptionnaire</b></u><br/>
                {signatoryNames?.["Le réceptionnaire"]&&<b>{signatoryNames["Le réceptionnaire"]}</b>}
                <div style={{border:"1px dashed #94a3b8",borderRadius:4,height:70,marginTop:6}}></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Balance Périodique — une ligne par produit (tout le catalogue du périmètre,
// pas un seul produit comme le Grand Livre), avec solde de début et de fin de
// période, mouvements et valorisation. Total général en bas.
export function BalancePeriodiquePrint({ rows, periodFrom, periodTo, scopeLabel }) {
  const thStyle = { padding:"6px 7px", textAlign:"center", fontSize:9, fontWeight:700, color:"white", background:"#1e3a8a", border:"1px solid #1e3a8a" };
  const tdStyle = { padding:"5px 7px", fontSize:9, border:"1px solid #ddd" };
  const totalGeneral = (rows||[]).reduce((s,r)=>s+r.montant,0);
  return (
    <div>
      <OfficialHeader/>
      {scopeLabel&&<div style={{fontSize:9,color:"#64748b",marginBottom:8}}>{scopeLabel}</div>}
      <div style={{textAlign:"center",fontSize:14,fontWeight:800,marginBottom:16}}>
        BALANCE PÉRIODIQUE DU <span style={{fontWeight:400}}>{fmtDate(periodFrom)||"—"}</span> AU <span style={{fontWeight:400}}>{fmtDate(periodTo)||"—"}</span>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>
            <th style={{...thStyle,width:"11%"}}>Nomenclature</th>
            <th style={{...thStyle,width:"23%",textAlign:"left"}}>Désignation</th>
            <th style={{...thStyle,width:"11%"}}>Existant Début Période</th>
            <th style={{...thStyle,width:"9%"}}>Entrée Période</th>
            <th style={{...thStyle,width:"9%"}}>Total Entrée</th>
            <th style={{...thStyle,width:"9%"}}>Sortie Période</th>
            <th style={{...thStyle,width:"9%"}}>Existant Fin Période</th>
            <th style={{...thStyle,width:"9%"}}>Prix Unitaire</th>
            <th style={{...thStyle,width:"10%"}}>Montant Existant</th>
          </tr>
        </thead>
        <tbody>
          {(rows||[]).map((r,i)=>(
            <tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>
              <td style={tdStyle}>{r.compteNumero||"—"}</td>
              <td style={{...tdStyle,textAlign:"left",fontWeight:600}}>{r.productName}</td>
              <td style={{...tdStyle,textAlign:"center"}}>{r.existantDebut}</td>
              <td style={{...tdStyle,textAlign:"center",color:"#059669"}}>{r.entreePeriode}</td>
              <td style={{...tdStyle,textAlign:"center"}}>{r.totalEntree}</td>
              <td style={{...tdStyle,textAlign:"center",color:"#dc2626"}}>{r.sortiePeriode}</td>
              <td style={{...tdStyle,textAlign:"center",fontWeight:700}}>{r.existantFin}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{r.pu.toLocaleString("fr-FR")}</td>
              <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{r.montant.toLocaleString("fr-FR")}</td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={9} style={{...tdStyle,textAlign:"center",color:"#94a3b8"}}>Aucun produit.</td></tr>}
        </tbody>
      </table>
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <table style={{borderCollapse:"collapse"}}>
          <tbody>
            <tr>
              <td style={{border:"2px solid #1e293b",padding:"8px 16px",fontWeight:800,fontSize:12}}>TOTAL</td>
              <td style={{border:"2px solid #1e293b",padding:"8px 16px",fontWeight:800,fontSize:14,textAlign:"right"}}>{totalGeneral.toLocaleString("fr-FR")}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Procès-Verbal de Réception — généré automatiquement quand un Bon d'Entrée
// (Fonctionnement/Non-Pharmaceutique) atteint le seuil configuré. La
// commission est injectée déjà résolue (nom habituel ou intérimaire) par
// l'appelant — ce composant ne gère pas lui-même la bascule intérimaire.
export function PvPrint({ pv, resolvedCommission, circuitLabel }) {
  if (!pv) return null;
  const thStyle = { padding:"6px 7px", textAlign:"center", fontSize:9.5, fontWeight:700, color:"white", background:"#1e3a8a", border:"1px solid #1e3a8a" };
  const tdStyle = { padding:"6px 7px", fontSize:9.5, border:"1px solid #ddd" };
  const dateStr = pv.dateReception ? fmtDate(pv.dateReception) : (pv.createdAt?.seconds ? fmtDate(new Date(pv.createdAt.seconds*1000).toISOString().slice(0,10)) : "—");
  return (
    <div>
      <OfficialHeader/>
      <div style={{ textAlign:"center", marginBottom:16 }}>
        {circuitLabel&&<div style={{ fontSize:10, color:"#64748b", marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>{circuitLabel}</div>}
        <div style={{ fontSize:17, fontWeight:800 }}>PROCÈS-VERBAL</div>
        <div style={{ fontSize:15, fontWeight:800 }}>DE RÉCEPTION N° {pv.numero}</div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:16 }}>
        <span>Date de Réception : <b>{dateStr}</b></span>
        <span>Nom du fournisseur : <b>{pv.supplierName||"—"}</b></span>
      </div>
      {pv.entreeRef&&<div style={{ fontSize:10, color:"#64748b", marginBottom:6 }}>Référence du Bon d'Entrée : {pv.entreeRef}</div>}
      {(pv.bcNumero||pv.blNumero||pv.factureNumero)&&(
        <div style={{ fontSize:10, color:"#374151", marginBottom:14, lineHeight:1.8 }}>
          <div style={{fontWeight:700,marginBottom:2}}>Énumération des pièces justificatives jointes :</div>
          {pv.bcNumero&&<div>BC N° {pv.bcNumero}</div>}
          {pv.blNumero&&<div>BL N° {pv.blNumero}</div>}
          {pv.factureNumero&&<div>Facture N° {pv.factureNumero}</div>}
        </div>
      )}

      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:12 }}>
        <thead>
          <tr>
            <th style={{...thStyle,width:"32%",textAlign:"left"}}>Désignation</th>
            <th style={{...thStyle,width:"10%"}}>Unité</th>
            <th style={{...thStyle,width:"12%"}}>Cdt</th>
            <th style={{...thStyle,width:"15%"}}>Prix Unitaire</th>
            <th style={{...thStyle,width:"16%"}}>Montant</th>
            <th style={{...thStyle,width:"15%"}}>Observation</th>
          </tr>
        </thead>
        <tbody>
          {(pv.items||[]).map((it,i)=>(
            <tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>
              <td style={{...tdStyle,textAlign:"left",fontWeight:600}}>{it.productName}</td>
              <td style={{...tdStyle,textAlign:"center"}}>{it.qty}</td>
              <td style={{...tdStyle,textAlign:"center"}}>{it.conditionnement||"—"}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{Number(it.unitPrice||0).toLocaleString("fr-FR")}</td>
              <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{(Number(it.qty||0)*Number(it.unitPrice||0)).toLocaleString("fr-FR")}</td>
              <td style={tdStyle}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ border:"1px solid #1e293b", borderRadius:6, padding:12, fontSize:11, lineHeight:1.9, marginBottom:20 }}>
        Arrêté le présent P.V. à <b>{Number(pv.totalUnites||0).toLocaleString("fr-FR")}</b> Unités que nous certifions avoir réceptionnées pour un montant de :<br/>
        <b>{numberToWords(pv.totalMontant||0)} francs CFA</b> ({Number(pv.totalMontant||0).toLocaleString("fr-FR")} FCFA)
      </div>

      <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>Noms, Qualités et Signatures des Membres de la Commission :</div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th style={{...thStyle,width:"8%"}}>N°</th>
            <th style={{...thStyle,width:"37%",textAlign:"left"}}>Noms</th>
            <th style={{...thStyle,width:"25%",textAlign:"left"}}>Qualité</th>
            <th style={{...thStyle,width:"30%"}}>Signature</th>
          </tr>
        </thead>
        <tbody>
          {(resolvedCommission||[]).map((m,i)=>(
            <tr key={i}>
              <td style={{...tdStyle,textAlign:"center",fontWeight:700}}>{i+1}</td>
              <td style={{...tdStyle,textAlign:"left"}}>
                <b>{m.displayName}</b>{m.isInterim&&<span style={{color:"#b45309",fontWeight:600}}> (intérimaire)</span>}
              </td>
              <td style={{...tdStyle,textAlign:"left"}}>{m.fonctionName||"—"}</td>
              <td style={{...tdStyle,height:50}}></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Bon de Retour — Comptabilité Matières (Fonctionnement/Non-Pharmaceutique) :
// retour vers le fournisseur, l'inverse d'un Bon d'Entrée (diminution des
// prises en charge plutôt qu'augmentation).
export function RetourComptaPrint({ r, products, signatoryNames, circuitLabel }) {
  if (!r) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const statusLabel = r.status==="annule" ? "🚫 Annulé" : "✅ Envoyé";
  const dateStr = r.date ? fmtDate(r.date) : (r.createdAt?.seconds ? fmtDate(new Date(r.createdAt.seconds*1000).toISOString().slice(0,10)) : "—");
  const total = (r.items||[]).reduce((s,it)=>s+Number(it.qty||0)*Number(it.unitPrice||0),0);
  const totalUnites = (r.items||[]).reduce((s,it)=>s+Number(it.qty||0),0);
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#7f1d1d", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:6 }}>BON DE RETOUR{circuitLabel?(" — "+circuitLabel.toUpperCase()):""}</div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#374151", marginBottom:16 }}>
        <span>Réf : <b>{r.reference||"—"}</b></span>
        <span>Fournisseur : <b>{r.supplierName||"—"}</b></span>
        <span>Date : <b>{dateStr}</b></span>
        <span>Statut : <b>{statusLabel}</b></span>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Quantité","Prix Unit.","Total"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(r.items||[]).map((it,i)=>(
            <tr key={i}>
              <td style={{ ...tdStyle, fontWeight:600 }}>{it.productName || "—"}</td>
              <td style={tdStyle}>{it.qty}</td>
              <td style={tdStyle}>{Number(it.unitPrice||0).toLocaleString("fr-FR")} FCFA</td>
              <td style={{ ...tdStyle, fontWeight:700 }}>{(Number(it.qty||0)*Number(it.unitPrice||0)).toLocaleString("fr-FR")} FCFA</td>
            </tr>
          ))}
          <tr style={{background:"#7f1d1d"}}>
            <td colSpan={3} style={{...tdStyle,color:"white",textAlign:"center",fontWeight:800,border:"none"}}>TOTAL — {totalUnites} unité(s)</td>
            <td style={{...tdStyle,color:"white",fontWeight:800,border:"none"}}>{total.toLocaleString("fr-FR")} FCFA</td>
          </tr>
        </tbody>
      </table>
      {r.notes&&<div style={{ fontSize:10, color:"#64748b", fontStyle:"italic", marginBottom:16 }}>Observations : {r.notes}</div>}

      <div style={{ border:"1px solid #333", padding:10, fontSize:10, lineHeight:1.9, marginBottom:20 }}>
        Diminue les prises en charge de <b>{totalUnites}</b> unité(s), représentant une valeur de <b>{total.toLocaleString("fr-FR")} francs CFA</b>, retournée(s) au fournisseur ci-dessus.<br/>
        A Touba, le {dateStr}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <SignatureBox label="L'Ordonnateur des Matières" name={signatoryNames?.["L'Ordonnateur des Matières"]}/>
        <SignatureBox label="Le Comptable des Matières" name={signatoryNames?.["Le Comptable des Matières"]}/>
      </div>
    </div>
  );
}

// Bon de Sortie (Dépôt Vente) — sortie directe, sans contrôle/confirmation
// (perte, casse, usage interne...), coexiste avec les Transferts.
export function SortieDepotPrint({ s, products, signatoryNames }) {
  if (!s) return null;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const statusLabel = s.status==="annule" ? "🚫 Annulé" : "✅ Sorti";
  const total = (s.items||[]).reduce((sum,it)=>sum+Number(it.qty||0)*Number(it.unitPrice||0),0);
  const motifLabels = { perte:"Perte", casse:"Casse", usage_interne:"Usage interne", autre:"Autre" };
  return (
    <div>
      <OfficialHeader/>
      <div style={{ background:"#7f1d1d", color:"white", padding:6, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:1, marginBottom:10 }}>BON DE SORTIE — DÉPÔT VENTE</div>
      <div style={{ fontFamily:"monospace", fontSize:12, color:"#64748b", textAlign:"right", marginBottom:10 }}>{s.reference}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
        {[["Motif", motifLabels[s.motif]||s.motif||"—"], ["Date", s.date ? new Date(s.date).toLocaleDateString("fr-FR") : "—"], ["Statut", statusLabel], ["Saisi par", s.createdByName||"—"], ["Observations", s.notes || "—"]].map(([l,v]) => (
          <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{v}</div>
          </div>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16 }}>
        <thead>
          <tr>{["Produit","Quantité","Prix Unit.","Total"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(s.items || []).map((it, i) => {
            const prod = products?.find(p => p.id === it.productId);
            return (
              <tr key={i}>
                <td style={{ ...tdStyle, fontWeight:600 }}>{prod?.name || it.productName || "—"}</td>
                <td style={tdStyle}>{it.qty}</td>
                <td style={tdStyle}>{Number(it.unitPrice || 0).toLocaleString("fr-FR")} FCFA</td>
                <td style={{ ...tdStyle, fontWeight:700 }}>{(Number(it.qty||0)*Number(it.unitPrice||0)).toLocaleString("fr-FR")} FCFA</td>
              </tr>
            );
          })}
          <tr style={{background:"#7f1d1d"}}>
            <td colSpan={3} style={{...tdStyle,color:"white",textAlign:"center",fontWeight:800,border:"none"}}>TOTAL</td>
            <td style={{...tdStyle,color:"white",fontWeight:800,border:"none"}}>{total.toLocaleString("fr-FR")} FCFA</td>
          </tr>
        </tbody>
      </table>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginTop:30 }}>
        <SignatureBox label="Le Responsable" name={signatoryNames?.["Le Responsable"]}/>
        <SignatureBox label="Le Gestionnaire de stock" name={signatoryNames?.["Le Gestionnaire de stock"]}/>
      </div>
    </div>
  );
}

// Livre-Journal des mouvements des matières affectant l'existant — une
// ligne par mouvement (entrée OU sortie), tous produits confondus, dans
// l'ordre chronologique, avec un report des soldes antérieurs en tête et un
// total à reporter en pied (cumul report + page, comme le modèle officiel).
export function LivreJournalPrint({ rows, report, periodFrom, periodTo }) {
  const thStyle = { padding:"5px 6px", textAlign:"center", fontSize:8.5, fontWeight:700, background:"#f1f5f9", border:"1px solid #cbd5e1" };
  const tdStyle = { padding:"4px 6px", fontSize:8.5, border:"1px solid #ddd" };
  const totalQtyEntree = (rows||[]).filter(r=>r.type==="entree").reduce((s,r)=>s+r.qty,0) + (report?.qtyEntree||0);
  const totalQtySortie = (rows||[]).filter(r=>r.type==="sortie").reduce((s,r)=>s+r.qty,0) + (report?.qtySortie||0);
  const totalMontantEntree = (rows||[]).filter(r=>r.type==="entree").reduce((s,r)=>s+r.qty*r.pu,0) + (report?.montantEntree||0);
  const totalMontantSortie = (rows||[]).filter(r=>r.type==="sortie").reduce((s,r)=>s+r.qty*r.pu,0) + (report?.montantSortie||0);
  return (
    <div>
      <OfficialHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{fontSize:9,color:"#64748b"}}>Période du <b>{fmtDate(periodFrom)||"—"}</b> au <b>{fmtDate(periodTo)||"—"}</b></div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:13, fontWeight:800 }}>LE LIVRE-JOURNAL DES MOUVEMENTS DES MATIÈRES AFFECTANT L'EXISTANT</div>
          <div style={{ fontSize:9, color:"#94a3b8" }}>Modèle N°2 — Art. 18a</div>
        </div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{...thStyle,width:"6%"}}>Date</th>
            <th rowSpan={2} style={{...thStyle,width:"7%"}}>Nomenclature</th>
            <th rowSpan={2} style={{...thStyle,width:"14%"}}>Désignation des matières</th>
            <th colSpan={3} style={thStyle}>Entrées</th>
            <th colSpan={3} style={thStyle}>Sorties</th>
            <th rowSpan={2} style={{...thStyle,width:"6%"}}>P.U.</th>
            <th colSpan={2} style={thStyle}>Montant</th>
            <th rowSpan={2} style={{...thStyle,width:"12%"}}>Observations</th>
          </tr>
          <tr>
            <th style={{...thStyle,width:"5%"}}>N° Bon</th>
            <th style={{...thStyle,width:"5%"}}>Nbre</th>
            <th style={{...thStyle,width:"5%"}}>Unité</th>
            <th style={{...thStyle,width:"5%"}}>N° Bon</th>
            <th style={{...thStyle,width:"5%"}}>Nbre</th>
            <th style={{...thStyle,width:"5%"}}>Unité</th>
            <th style={{...thStyle,width:"8%"}}>Entrées</th>
            <th style={{...thStyle,width:"8%"}}>Sorties</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{background:"#fffbeb",fontStyle:"italic"}}>
            <td colSpan={3} style={{...tdStyle,fontWeight:700}}>Reports</td>
            <td style={tdStyle}></td>
            <td style={{...tdStyle,textAlign:"center",fontWeight:700}}>{(report?.qtyEntree||0).toLocaleString("fr-FR")}</td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={{...tdStyle,textAlign:"center",fontWeight:700}}>{(report?.qtySortie||0).toLocaleString("fr-FR")}</td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{(report?.montantEntree||0).toLocaleString("fr-FR")}</td>
            <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{(report?.montantSortie||0).toLocaleString("fr-FR")}</td>
            <td style={tdStyle}></td>
          </tr>
          {(rows||[]).map((r,i)=>(
            <tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>
              <td style={tdStyle}>{fmtDate(r.date)}</td>
              <td style={tdStyle}>{r.compteNumero}</td>
              <td style={{...tdStyle,fontWeight:600}}>{r.productName}</td>
              <td style={tdStyle}>{r.type==="entree"?r.bon:""}</td>
              <td style={{...tdStyle,textAlign:"center",color:"#059669",fontWeight:700}}>{r.type==="entree"?r.qty:""}</td>
              <td style={tdStyle}>{r.type==="entree"?r.unite:""}</td>
              <td style={tdStyle}>{r.type==="sortie"?r.bon:""}</td>
              <td style={{...tdStyle,textAlign:"center",color:"#dc2626",fontWeight:700}}>{r.type==="sortie"?r.qty:""}</td>
              <td style={tdStyle}>{r.type==="sortie"?r.unite:""}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{r.pu.toLocaleString("fr-FR")}</td>
              <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{r.type==="entree"?(r.qty*r.pu).toLocaleString("fr-FR"):""}</td>
              <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{r.type==="sortie"?(r.qty*r.pu).toLocaleString("fr-FR"):""}</td>
              <td style={{...tdStyle,fontStyle:"italic",color:"#64748b"}}>{r.observations}</td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={13} style={{...tdStyle,textAlign:"center",color:"#94a3b8"}}>Aucun mouvement sur cette période.</td></tr>}
          <tr style={{background:"#1e3a8a"}}>
            <td colSpan={3} style={{...tdStyle,color:"white",fontWeight:800,border:"none"}}>Totaux à reporter</td>
            <td style={{...tdStyle,color:"white",border:"none"}}></td>
            <td style={{...tdStyle,color:"white",textAlign:"center",fontWeight:800,border:"none"}}>{totalQtyEntree.toLocaleString("fr-FR")}</td>
            <td style={{...tdStyle,color:"white",border:"none"}}></td>
            <td style={{...tdStyle,color:"white",border:"none"}}></td>
            <td style={{...tdStyle,color:"white",textAlign:"center",fontWeight:800,border:"none"}}>{totalQtySortie.toLocaleString("fr-FR")}</td>
            <td style={{...tdStyle,color:"white",border:"none"}}></td>
            <td style={{...tdStyle,color:"white",border:"none"}}></td>
            <td style={{...tdStyle,color:"white",textAlign:"right",fontWeight:800,border:"none"}}>{totalMontantEntree.toLocaleString("fr-FR")}</td>
            <td style={{...tdStyle,color:"white",textAlign:"right",fontWeight:800,border:"none"}}>{totalMontantSortie.toLocaleString("fr-FR")}</td>
            <td style={{...tdStyle,color:"white",border:"none"}}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
