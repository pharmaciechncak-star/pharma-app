import { useRef, useState, cloneElement } from "react";
import { LOGO_B64, IMG_CARDIO_SRC, IMG_LABEL_SRC, IMG_CHNCAK_SRC } from "../../images";
import { Barcode } from "../ui/Barcode";
import { computeAge } from "../../helpers/age";
import { fmtDate } from "../../constants";
import { numberToWords } from "../../helpers/exportUtils";
import { PRESET_FANN } from "../../helpers/printModels";

// Bloc « Modèle n° / Instruction / Articles » d'un imprimé — réglé dans
// Paramètres › Modèles des imprimés ; rien n'est affiché si tout est vide.
function ModelLines({ m, style }) {
  if (!m || (!m.modele && !m.articles && !m.instruction)) return null;
  return (
    <div style={{ fontSize:10, lineHeight:1.8, ...style }}>
      {m.modele&&<div>{m.modele}</div>}
      {m.instruction&&<div>{m.instruction}</div>}
      {m.articles&&<div>{m.articles}</div>}
    </div>
  );
}

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
    <div className="nb" style={{ textAlign:"center", breakInside:"avoid" }}>
      <div style={{ fontWeight:700, fontSize:11, color:"#065f46", textDecoration:"underline", marginBottom:6 }}>{label}</div>
      {name&&<div style={{ fontSize:11, fontWeight:600, color:"#1e293b", marginBottom:6 }}>{name}</div>}
      <div style={{ height:70 }}></div>
    </div>
  );
}

export function PrintModal({ open, onClose, title, children, signatories, onExcel, onPdf, landscape, reference }) {
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
    const clean = s => String(s||"").replace(/[\\"\n\r]/g," ");
    const refTxt = clean(reference||title);
    const printedOn = new Date().toLocaleDateString("fr-FR");
    const css = `body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;line-height:1.5;padding:0;margin:0;}
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
thead{display:table-header-group;}
tr,.nb,div[style*="grid-template-columns"]{break-inside:avoid;page-break-inside:avoid;}
@page{margin:14mm 10mm 14mm 10mm;${landscape?"size:A4 landscape;":"size:A4;"}
@top-right{content:"${refTxt}";font:bold 9px Arial;color:#374151;}
@top-left{content:"CHNCAK";font:9px Arial;color:#94a3b8;}
@bottom-center{content:"Page " counter(page) "/" counter(pages);font:bold 10px Arial;color:#374151;}
@bottom-right{content:"Imprimé le ${printedOn}";font:8px Arial;color:#94a3b8;}}`;
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
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:landscape?1080:720, marginTop:10, marginBottom:10, boxShadow:"0 24px 60px rgba(0,0,0,0.35)" }}>
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

export function EntreeComptaPrint({ r, products, signatoryNames, circuitLabel, model }) {
  if (!r) return null;
  const M = model || PRESET_FANN.entree;
  const [S1,S2] = M.signers;
  const dStr = r.date ? new Date(r.date) : (r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000) : null);
  const dateForCert = dStr ? dStr.toLocaleDateString("fr-FR") : "—";
  const fmt = n => Number(n||0).toLocaleString("fr-FR", { minimumFractionDigits:2, maximumFractionDigits:2 });
  const rows = (r.items||[]).map(it=>{
    const p = (products||[]).find(x=>x.id===it.productId)||{};
    const qty = Number(it.qty||0), pu = Number(it.unitPrice||0);
    return { compte:p.compteNumero||"", nom:it.productName||p.name||"—", spec:p.conditionnement||"Néant",
      qty, unit:p.unit||"", pu, montant:qty*pu,
      obs: it.observation || ("Réf. "+(r.reference||"")+(r.supplierName?" — "+r.supplierName:"")) };
  });
  const totalUnites = rows.reduce((a,x)=>a+x.qty,0);
  const totalMontant = rows.reduce((a,x)=>a+x.montant,0);
  const B = "1px solid #111";
  const th = { border:B, padding:"5px 6px", fontSize:10, fontWeight:700, textAlign:"center", verticalAlign:"middle" };
  const td = { borderLeft:B, borderRight:B, padding:"4px 6px", fontSize:10, verticalAlign:"top" };
  const cell = { border:B, padding:"8px 10px", verticalAlign:"top", fontSize:10, lineHeight:1.7 };
  const ttl = { textAlign:"center", fontWeight:700, fontSize:11, textDecoration:"underline", marginBottom:6 };
  const stamp = <div style={{height:70,marginTop:6}}></div>;
  const nSign = k=>signatoryNames?.[k];
  const blank = 0;
  return (
    <div style={{ color:"#111" }}>
      <OfficialHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{ width:"28%", fontSize:10, lineHeight:1.8 }}>
          {circuitLabel&&<div style={{fontSize:9,color:"#64748b"}}>Circuit : {circuitLabel}</div>}
          <div style={{marginTop:4}}><b>Fournisseur :</b> {r.supplierName||"—"}</div>
          {r.status==="annule"?<div style={{color:"#b91c1c",fontWeight:800}}>BON ANNULÉ</div>:null}
        </div>
        <div style={{ flex:1, textAlign:"center" }}>
          <div style={{ fontSize:16, fontWeight:800, lineHeight:1.35 }}>BON D'ENTREE DANS L'EXISTANT</div>
          <div style={{ marginTop:10, fontSize:13 }}><u><b>N°</b></u> <b style={{borderBottom:"1px dashed #111",padding:"0 14px"}}>{r.reference||"—"}</b></div>
        </div>
        <div style={{ width:"28%", fontSize:10, lineHeight:1.8 }}>
          <ModelLines m={M} style={{fontSize:undefined,lineHeight:undefined}}/>
          <div style={{marginTop:8}}><u><b>Année budgétaire :</b></u> {dStr?dStr.getFullYear():""}</div>
          <div><u><b>Section :</b></u></div>
          <div><u><b>Chapitre :</b></u></div>
        </div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup>
          <col style={{width:"10%"}}/><col style={{width:"25%"}}/><col style={{width:"9%"}}/>
          <col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"11%"}}/><col style={{width:"12%"}}/><col style={{width:"17%"}}/>
        </colgroup>
        <thead>
          <tr>
            <th style={th} colSpan={3}>DESIGNATION DES MATIERES</th>
            <th style={th} colSpan={4}>CHIFFRES A COMPTABILISER</th>
            <th style={th} rowSpan={3}>Observations</th>
          </tr>
          <tr>
            <th style={th} rowSpan={2}>N°.Compte<br/>Nomenclature</th>
            <th style={th} rowSpan={2}>Nature des matières</th>
            <th style={th} rowSpan={2}>Spécification</th>
            <th style={th} colSpan={2}>Quantités</th>
            <th style={th} rowSpan={2}>Prix<br/>Unitaire</th>
            <th style={th} rowSpan={2}>Montant</th>
          </tr>
          <tr>
            <th style={th}>Nombre<br/>d'Unités</th>
            <th style={th}>Nature des<br/>Unités</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x,i)=>(
            <tr key={i}>
              <td style={{...td,textAlign:"center"}}>{x.compte}</td>
              <td style={td}>{x.nom}</td>
              <td style={{...td,textAlign:"center"}}>{x.spec}</td>
              <td style={{...td,textAlign:"right",fontWeight:700}}>{fmt(x.qty)}</td>
              <td style={{...td,textAlign:"center"}}>{x.unit}</td>
              <td style={{...td,textAlign:"right",fontWeight:700}}>{fmt(x.pu)}</td>
              <td style={{...td,textAlign:"right",fontWeight:700}}>{fmt(x.montant)}</td>
              <td style={td}>{x.obs}</td>
            </tr>
          ))}
          {Array.from({length:blank}).map((_,i)=>(
            <tr key={"b"+i}>{Array.from({length:8}).map((__,j)=><td key={j} style={{...td,height:16}}></td>)}</tr>
          ))}
          <tr>
            <td style={{...td,borderTop:B,borderBottom:B}} colSpan={3}><b>TOTAUX</b></td>
            <td style={{...td,borderTop:B,borderBottom:B,textAlign:"right",fontWeight:800}}>{fmt(totalUnites)}</td>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
            <td style={{...td,borderTop:B,borderBottom:B,textAlign:"right",fontWeight:800}}>{fmt(totalMontant)}</td>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
          </tr>
        </tbody>
      </table>
      {r.notes&&<div style={{fontSize:10,fontStyle:"italic",margin:"6px 0"}}>Observations : {r.notes}</div>}
      <table style={{ width:"100%", borderCollapse:"collapse", marginTop:12, tableLayout:"fixed" }}>
        <tbody>
          <tr>
            <td style={{...cell,width:"33%"}}>
              <div style={ttl}>CERTIFICATION</div>
              Arrête le présent bon à <b>{fmt(totalUnites)}</b> Unités représentant une valeur de <b>{fmt(totalMontant)}</b> francs<br/>
              dont je certifie la prise en charge<br/>
              A Touba &nbsp; le {dateForCert}<br/>
              <u><b><i>{S1}<sup>(4)</sup></i></b></u><br/>
              {nSign(S1)&&<b>{nSign(S1)}</b>}
              {stamp}
            </td>
            <td style={{...cell,width:"37%"}}>
              <div style={ttl}>AUGMENTATION DES PRISES EN CHARGE</div>
              Le comptable des matières soussigné, déclare ce jour augmenter ses prises en charge de <b>{fmt(totalUnites)}</b> unités, représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/>
              A Touba &nbsp; le {dateForCert}<br/>
              <u><b><i>{S2}<sup>(4)</sup></i></b></u><br/>
              {nSign(S2)&&<b>{nSign(S2)}</b>}
              {stamp}
            </td>
            <td style={{...cell,width:"30%",fontSize:9}}>
              <div style={{...ttl,fontWeight:400}}>EMPLOI DE L'IMPRIME</div>
              (1) Numérotation ininterrompue pour la gestion<br/>
              (2) Dans l'ordre des articles décrits sur les pièces justificatives ou dans l'ordre des comptes de la nomenclature<br/>
              (3) Litre, Kg, mètre, Nombre etc<br/>
              (4) Timbre et signature<br/>
              (5) Marque, code etc<br/>
              <span style={{fontSize:8}}>NB: Bon à établir en 3 exemplaires dont 1 destiné aux archives du service</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function SortieComptaPrint({ s, products, signatoryNames, circuitLabel, model }) {
  if (!s) return null;
  const provisoire = s.nature==="provisoire";
  const modele = provisoire
    ? { titre:["BON DE SORTIE PROVISOIRE","DANS L'EXISTANT"] }
    : { titre:["BON DE SORTIE DEFINITIVE","DANS L'EXISTANT"] };
  const M = model || (provisoire ? PRESET_FANN.sortie_prov : PRESET_FANN.sortie_def);
  const [S1,S2,S3] = M.signers;
  const dt = s.dateOperation ? new Date(s.dateOperation+"T12:00:00") : (s.createdAt?.seconds ? new Date(s.createdAt.seconds*1000) : null);
  const dateForCert = dt ? dt.toLocaleDateString("fr-FR") : "—";
  const fmt = n => Number(n||0).toLocaleString("fr-FR", { minimumFractionDigits:2, maximumFractionDigits:2 });
  const rows = (s.items||[]).map(it=>{
    const p = (products||[]).find(x=>x.id===it.productId)||{};
    const qty = Number(it.qty||0), pu = Number(p.price||0);
    return { compte:p.compteNumero||"", nom:it.productName||p.name||"—", spec:p.conditionnement||"",
      qty, unit:p.unit||"", pu, montant:qty*pu, expiry:it.expiry };
  });
  const totalUnites = rows.reduce((a,r)=>a+r.qty,0);
  const totalMontant = rows.reduce((a,r)=>a+r.montant,0);
  const B = "1px solid #111";
  const th = { border:B, padding:"5px 6px", fontSize:10, fontWeight:700, textAlign:"center", verticalAlign:"middle" };
  const td = { borderLeft:B, borderRight:B, padding:"4px 6px", fontSize:10, verticalAlign:"top" };
  const nSign = (k)=>signatoryNames?.[k];
  const dest = s.serviceName||"—";
  const blank = 0;
  const cell = { border:B, padding:"8px 10px", verticalAlign:"top", fontSize:10, lineHeight:1.7 };
  const ttl = { textAlign:"center", fontWeight:700, fontSize:11, textDecoration:"underline", marginBottom:6 };
  const stamp = <div style={{height:70,marginTop:6}}></div>;
  return (
    <div style={{ color:"#111" }}>
      <OfficialHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{ width:"28%", fontSize:10, lineHeight:1.8 }}>
          {circuitLabel&&<div style={{fontSize:9,color:"#64748b"}}>Circuit : {circuitLabel}</div>}
          {["reforme","peremption","perte"].includes(s.motif)
            ? <div style={{marginTop:4}}><b>Motif :</b> {dest}</div>
            : <div style={{marginTop:4}}><b>Destinataire :</b> {dest}</div>}
          {s.piecesJustificatives&&<div><b>Pièces justificatives :</b> {s.piecesJustificatives}</div>}
          {s.statut==="annule"||s.status==="annule"?<div style={{color:"#b91c1c",fontWeight:800}}>BON ANNULÉ</div>:null}
        </div>
        <div style={{ flex:1, textAlign:"center" }}>
          <div style={{ fontSize:16, fontWeight:800, lineHeight:1.35 }}>{modele.titre[0]}<br/>{modele.titre[1]}</div>
          <div style={{ marginTop:10, fontSize:13 }}><u><b>N°</b></u> <b style={{borderBottom:"1px dashed #111",padding:"0 14px"}}>{s.reference||"—"}</b> <sup>(1)</sup></div>
        </div>
        <div style={{ width:"28%", fontSize:10, lineHeight:1.8 }}>
          <ModelLines m={M} style={{fontSize:undefined,lineHeight:undefined}}/>
          <div style={{marginTop:8}}><u><b>Année budgétaire :</b></u> {dt?dt.getFullYear():""}</div>
          <div><u><b>Section :</b></u></div>
          <div><u><b>Chapitre :</b></u></div>
        </div>
      </div>

      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup>
          <col style={{width:"11%"}}/><col style={{width:"26%"}}/><col style={{width:"11%"}}/>
          <col style={{width:"9%"}}/><col style={{width:"9%"}}/><col style={{width:"10%"}}/><col style={{width:"11%"}}/><col style={{width:"13%"}}/>
        </colgroup>
        <thead>
          <tr>
            <th style={th} rowSpan={2}>N°.Compte <sup>(2)</sup><br/>Nomenclature</th>
            <th style={th} colSpan={2}>DESIGNATION DES MATIERES</th>
            <th style={th} colSpan={2}>Quantités</th>
            <th style={th} rowSpan={2}>Prix<br/>Unitaire</th>
            <th style={th} rowSpan={2}>Montant</th>
            <th style={th} rowSpan={2}>Observations</th>
          </tr>
          <tr>
            <th style={th}>Nature des matières</th>
            <th style={th}>Spécification</th>
            <th style={th}>Nombre<br/>d'Unités</th>
            <th style={th}>Nature des<br/>Unités <sup>(3)</sup></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i}>
              <td style={td}>{r.compte}</td>
              <td style={td}>{r.nom}{r.expiry?<span style={{color:"#555"}}> — Péremp. {fmtDate(r.expiry)}</span>:null}</td>
              <td style={td}>{r.spec}</td>
              <td style={{...td,textAlign:"right"}}>{r.qty}</td>
              <td style={{...td,textAlign:"center"}}>{r.unit}</td>
              <td style={{...td,textAlign:"right"}}>{r.pu?fmt(r.pu):""}</td>
              <td style={{...td,textAlign:"right",fontWeight:700}}>{r.pu?fmt(r.montant):""}</td>
              <td style={td}></td>
            </tr>
          ))}
          {Array.from({length:blank}).map((_,i)=>(
            <tr key={"b"+i}>{Array.from({length:8}).map((__,j)=><td key={j} style={{...td,height:16}}></td>)}</tr>
          ))}
          <tr>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
            <td style={{...td,borderTop:B,borderBottom:B,textAlign:"right",fontWeight:800}} colSpan={2}>TOTAUX</td>
            <td style={{...td,borderTop:B,borderBottom:B,textAlign:"right",fontWeight:800}}>{fmt(totalUnites)}</td>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
            <td style={{...td,borderTop:B,borderBottom:B,textAlign:"right",fontWeight:800}}>{fmt(totalMontant)}</td>
            <td style={{...td,borderTop:B,borderBottom:B}}></td>
          </tr>
        </tbody>
      </table>
      {s.notes&&<div style={{fontSize:10,fontStyle:"italic",margin:"6px 0"}}>Observations : {s.notes}</div>}

      <table style={{ width:"100%", borderCollapse:"collapse", marginTop:12, tableLayout:"fixed" }}>
        <tbody>
          <tr>
            <td style={{...cell,width:"25%"}}>
              <div style={ttl}>CERTIFICATION</div>
              Arrête le présent bon à <b>{fmt(totalUnites)}</b> Unités représentant une valeur de <b>{fmt(totalMontant)}</b> francs<br/>
              {provisoire?"dont je certifie la sortie provisoire":"dont je certifie la prise en charge"}<br/>
              A Touba &nbsp; le {dateForCert}<br/>
              <u><b><i>{S1}<sup>(5)</sup></i></b></u><br/>
              {nSign(S1)&&<b>{nSign(S1)}</b>}
              {stamp}
            </td>
            <td style={{...cell,width:"25%"}}>
              <div style={ttl}>DIMINUTION DES PRISES EN CHARGE</div>
              {provisoire
                ? <>Le comptable des matières soussigné s'engage à faire diligence pour réintégrer les matières portées au présent bon (<b>{fmt(totalUnites)}</b> unités, valeur <b>{fmt(totalMontant)}</b> Francs) dans l'enceinte du service. <i>Sortie pour mémoire : l'existant n'est pas diminué.</i><br/></>
                : <>Le comptable des matières soussigné, déclare ce jour diminuer mes prises en charge de <b>{fmt(totalUnites)}</b> unités, représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/></>}
              A Touba &nbsp; le {dateForCert}<br/>
              <u><b><i>{S2}<sup>(5)</sup></i></b></u><br/>
              {nSign(S2)&&<b>{nSign(S2)}</b>}
              {stamp}
            </td>
            <td style={{...cell,width:"25%"}}>
              <div style={{...ttl,textDecoration:"none"}}>RECEPISSE</div>
              Je soussigné <b>{nSign(S3)||"______________________"}</b><br/>
              <b>{dest}</b><br/>
              reconnais avoir reçu les matières portées au présent bon{provisoire?" (à titre provisoire, à retourner)":""}<br/>
              à Touba &nbsp; le {dateForCert}<br/>
              <u><b><i>{S3}<sup>(5)</sup></i></b></u>
              {stamp}
            </td>
            <td style={{...cell,width:"25%",fontSize:9}}>
              <div style={{...ttl,fontWeight:400}}>EMPLOI DE L'IMPRIME</div>
              (1) Numérotation ininterrompue pour la gestion<br/>
              (2) Dans l'ordre des articles décrits sur les pièces justificatives ou dans l'ordre des comptes de la nomenclature<br/>
              (3) Litre, Kg, mètre, Nombre etc<br/>
              (4) Nom et qualité<br/>
              (5) Timbre et signature<br/>
              <span style={{fontSize:8}}>NB: Bon à établir en 3 exemplaires</span>
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

export function GrandLivrePrint({ product, rows, periodFrom, periodTo, model }) {
  const M = model || PRESET_FANN.grand_livre;
  const thStyle = { padding:"7px 8px", textAlign:"center", fontSize:9.5, fontWeight:700, color:"white", background:"#78350f", border:"1px solid #78350f" };
  const tdStyle = { padding:"6px 8px", fontSize:9.5, border:"1px solid #ddd" };
  return (
    <div>
      <OfficialHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{fontSize:9,color:"#64748b"}}>Période du <b>{fmtDate(periodFrom)||"—"}</b> au <b>{fmtDate(periodTo)||"—"}</b></div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:15, fontWeight:800 }}>GRAND LIVRE DES COMPTES</div>
          {(M.modele||M.articles)&&<div style={{ fontSize:9, color:"#64748b" }}>{[M.modele,M.instruction,M.articles].filter(Boolean).join(" — ")}</div>}
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
              <td style={{...tdStyle,textAlign:"center",color:"#7c3aed",fontWeight:700}}>{r.sortieProvisoire||""}</td>
              <td style={{...tdStyle,textAlign:"center",fontSize:8.5}}>{r.dateRetour||""}</td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={10} style={{...tdStyle,textAlign:"center",color:"#94a3b8"}}>Aucun mouvement sur cette période.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function FicheStockPrint({ product, rows, periodFrom, periodTo, signatoryNames, model }) {
  const M = model || PRESET_FANN.fiche_stock;
  const [S1,S2] = M.signers;
  const B = "1px solid #111";
  const th = { border:B, padding:"4px 5px", fontSize:10, fontWeight:700, textAlign:"center", verticalAlign:"middle" };
  const td = { border:B, padding:"3px 5px", fontSize:10, verticalAlign:"top" };
  const R = rows||[];
  const today = new Date().toLocaleDateString("fr-FR");
  const nm = k=>signatoryNames?.[k];
  const u = { fontWeight:700, fontStyle:"italic", textDecoration:"underline", fontSize:13 };
  return (
    <div style={{ color:"#111" }}>
      <OfficialHeader/>
      <div style={{ marginBottom:8 }}>
        <ModelLines m={M} style={{float:"right",textAlign:"right"}}/>
        <span style={{fontSize:16,fontWeight:800}}>FICHE DE STOCK DU</span>
        <span style={{marginLeft:14,fontWeight:700,fontSize:13,borderBottom:"1px dashed #111",padding:"0 8px"}}>{fmtDate(periodFrom)||"—"}</span>
        <b style={{margin:"0 12px"}}>au</b>
        <span style={{fontWeight:700,fontSize:13,borderBottom:"1px dashed #111",padding:"0 8px"}}>{fmtDate(periodTo)||"—"}</span>
        <div style={{fontSize:9}}>{today}</div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10.5, margin:"0 0 10px 40px", lineHeight:1.9 }}>
        <div>
          <div><b style={{fontSize:12}}>COMPTE N°</b> &nbsp;&nbsp;&nbsp; {product?.compteNumero||"—"}</div>
          <div><b style={{fontSize:12}}>INTITULE</b> &nbsp;&nbsp;&nbsp;&nbsp; {product?.name||"—"}</div>
        </div>
        <div style={{marginRight:40}}><b style={{fontSize:12}}>NATURE DE L'UNITE :</b> &nbsp; {product?.unit||"—"}</div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup>
          <col style={{width:"8%"}}/><col style={{width:"19%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/>
          <col style={{width:"19%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"9%"}}/><col style={{width:"13%"}}/>
        </colgroup>
        <thead>
          <tr>
            <th style={th} colSpan={4}>ENTREE</th>
            <th style={th} colSpan={3}>SORTIE</th>
            <th style={th} rowSpan={2}>Stock à la<br/>date</th>
            <th style={th} rowSpan={2}>Contrôlé par</th>
          </tr>
          <tr>
            <th style={th}>Date des<br/>opérations</th><th style={th}>Provenance</th><th style={th}>N°Bon</th><th style={th}>Quantité</th>
            <th style={th}>Destinataire</th><th style={th}>N°Bon</th><th style={th}>Quantité</th>
          </tr>
        </thead>
        <tbody>
          {R.map((r,i)=>(
            <tr key={i}>
              <td style={td}>{fmtDate(r.date)}</td>
              <td style={td}>{r.provenance||""}</td>
              <td style={{...td,textAlign:"center"}}>{r.entreeBon||""}</td>
              <td style={{...td,textAlign:"right"}}>{r.entreeQty||""}</td>
              <td style={td}>{r.destinataire||""}</td>
              <td style={{...td,textAlign:"center"}}>{r.sortieBon||""}</td>
              <td style={{...td,textAlign:"right"}}>{r.sortieQty||""}</td>
              <td style={{...td,textAlign:"right",fontWeight:700}}>{r.stock}</td>
              <td style={td}></td>
            </tr>
          ))}
          {R.length===0&&<tr><td colSpan={9} style={{...td,textAlign:"center",color:"#64748b"}}>Aucun mouvement sur cette période.</td></tr>}
        </tbody>
      </table>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:26 }}>
        <div style={{ width:"40%" }}>
          <div style={u}>{S1}</div>
          {nm(S1)&&<div style={{fontWeight:700,fontSize:13,marginTop:10}}>{nm(S1)}</div>}
          <div style={{height:70,marginTop:8}}></div>
        </div>
        <div style={{ width:"40%", textAlign:"right" }}>
          <div style={u}>{S2}</div>
          {nm(S2)&&<div style={{fontWeight:700,fontSize:13,marginTop:10}}>{nm(S2)}</div>}
          <div style={{height:70,marginTop:8}}></div>
        </div>
      </div>
    </div>
  );
}

// Consommation Matières par service — liste valorisée de tout ce qui a été
// remis à UN service sur une période (reconstruite à partir des Bons de
// Sortie), avec le bloc de certification en trois parties (Ordonnateur des
// Matières / Comptable des Matières / Réceptionnaire) propre à ce document.
export function ConsommationMatieresPrint({ serviceName, rows, periodFrom, periodTo, signatoryNames, model }) {
  const M = model || PRESET_FANN.consommation;
  const [S1,S2,S3] = M.signers;
  const thStyle = { padding:"8px 10px", textAlign:"center", fontSize:10.5, fontWeight:700, border:"1px solid #94a3b8", background:"#f1f5f9" };
  const tdStyle = { padding:"7px 10px", fontSize:10.5, border:"1px solid #ddd" };
  const totalUnites = (rows||[]).reduce((s,r)=>s+Number(r.qty||0),0);
  const totalMontant = (rows||[]).reduce((s,r)=>s+Number(r.montant||0),0);
  const fmt = n => n.toLocaleString("fr-FR", { minimumFractionDigits: n%1!==0?2:0, maximumFractionDigits:2 });
  return (
    <div>
      <OfficialHeader/>
      <ModelLines m={M} style={{float:"right",textAlign:"right"}}/>
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
                <u><b>{S1}</b></u><br/>
                {signatoryNames?.[S1]&&<b>{signatoryNames[S1]}</b>}
                <div style={{height:70,marginTop:6}}></div>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"33%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>DIMINUTION DES PRISES EN CHARGE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                le comptable des matières soussigné, déclare ce jour diminuer ses prises en charge de <b>{fmt(totalUnites)}</b> unités,<br/>
                représentant une valeur de <b>{fmt(totalMontant)}</b> Francs<br/>
                A Touba &nbsp; le {fmtDate(periodTo)||"—"}<br/><br/>
                <u><b>{S2}</b></u><br/>
                {signatoryNames?.[S2]&&<b>{signatoryNames[S2]}</b>}
                <div style={{height:70,marginTop:6}}></div>
              </div>
            </td>
            <td style={{border:"1px solid #94a3b8",padding:10,verticalAlign:"top",width:"34%"}}>
              <div style={{fontWeight:700,fontSize:11,textDecoration:"underline",marginBottom:10}}>RECEPISSE</div>
              <div style={{fontSize:10,lineHeight:1.9}}>
                Je soussigné {signatoryNames?.[S3]||"______________________"}<br/>
                {serviceName||"—"}<br/>
                reconnait avoir reçu les matières portées au présent bon<br/>
                à Touba &nbsp; le {fmtDate(periodTo)||"—"}<br/><br/>
                <u><b>{S3}</b></u><br/>
                {signatoryNames?.[S3]&&<b>{signatoryNames[S3]}</b>}
                <div style={{height:70,marginTop:6}}></div>
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
export function BalancePeriodiquePrint({ rows, periodFrom, periodTo, scopeLabel, model }) {
  const M = model || PRESET_FANN.balance;
  const thStyle = { padding:"6px 7px", textAlign:"center", fontSize:9, fontWeight:700, color:"white", background:"#1e3a8a", border:"1px solid #1e3a8a" };
  const tdStyle = { padding:"5px 7px", fontSize:9, border:"1px solid #ddd" };
  const totalGeneral = (rows||[]).reduce((s,r)=>s+r.montant,0);
  return (
    <div>
      <OfficialHeader/>
      <ModelLines m={M} style={{float:"right",textAlign:"right"}}/>
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
            <th style={{...thStyle,width:"8%"}}>dont en sortie provisoire</th>
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
              <td style={{...tdStyle,textAlign:"center",color:"#7c3aed"}}>{r.sortiesProvisoires||""}</td>
              <td style={{...tdStyle,textAlign:"center",fontWeight:700}}>{r.existantFin}</td>
              <td style={{...tdStyle,textAlign:"right"}}>{r.pu.toLocaleString("fr-FR")}</td>
              <td style={{...tdStyle,textAlign:"right",fontWeight:700}}>{r.montant.toLocaleString("fr-FR")}</td>
            </tr>
          ))}
          {(!rows||rows.length===0)&&<tr><td colSpan={10} style={{...tdStyle,textAlign:"center",color:"#94a3b8"}}>Aucun produit.</td></tr>}
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
export function PvPrint({ pv, resolvedCommission, circuitLabel, model }) {
  const M = model || PRESET_FANN.pv;
  if (!pv) return null;
  const thStyle = { padding:"6px 7px", textAlign:"center", fontSize:9.5, fontWeight:700, color:"white", background:"#1e3a8a", border:"1px solid #1e3a8a" };
  const tdStyle = { padding:"6px 7px", fontSize:9.5, border:"1px solid #ddd" };
  const dateStr = pv.dateReception ? fmtDate(pv.dateReception) : (pv.createdAt?.seconds ? fmtDate(new Date(pv.createdAt.seconds*1000).toISOString().slice(0,10)) : "—");
  return (
    <div>
      <OfficialHeader/>
      <ModelLines m={M} style={{float:"right",textAlign:"right"}}/>
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

      <div className="nb" style={{ breakInside:"avoid", pageBreakInside:"avoid" }}>
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
    </div>
  );
}

// Bon de Retour — Comptabilité Matières (Fonctionnement/Non-Pharmaceutique) :
// retour vers le fournisseur, l'inverse d'un Bon d'Entrée (diminution des
// prises en charge plutôt qu'augmentation).
export function RetourComptaPrint({ r, products, signatoryNames, circuitLabel, model }) {
  if (!r) return null;
  const M = model || PRESET_FANN.retour;
  const [S1,S2] = M.signers;
  const thStyle = { padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"2px solid #e2e8f0", background:"#f8fafc" };
  const tdStyle = { padding:"9px 12px", borderBottom:"1px solid #f1f5f9" };
  const statusLabel = r.status==="annule" ? "🚫 Annulé" : "✅ Envoyé";
  const dateStr = r.date ? fmtDate(r.date) : (r.createdAt?.seconds ? fmtDate(new Date(r.createdAt.seconds*1000).toISOString().slice(0,10)) : "—");
  const total = (r.items||[]).reduce((s,it)=>s+Number(it.qty||0)*Number(it.unitPrice||0),0);
  const totalUnites = (r.items||[]).reduce((s,it)=>s+Number(it.qty||0),0);
  return (
    <div>
      <OfficialHeader/>
      <ModelLines m={M} style={{textAlign:"right",marginBottom:6}}/>
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
        <SignatureBox label={S1} name={signatoryNames?.[S1]}/>
        <SignatureBox label={S2} name={signatoryNames?.[S2]}/>
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
export function LivreJournalPrint({ rows, report, periodFrom, periodTo, model }) {
  const M = model || PRESET_FANN.livre_journal;
  const B = "1px solid #111";
  const th = { border:B, padding:"4px 4px", fontSize:9, fontWeight:700, textAlign:"center", verticalAlign:"middle" };
  const td = { borderLeft:B, borderRight:B, padding:"3px 4px", fontSize:9, verticalAlign:"top" };
  const tdt = { ...td, borderTop:B, borderBottom:B, fontWeight:800 };
  const fmt = n => Number(n||0).toLocaleString("fr-FR");
  const R = rows||[];
  const sum = (arr,f)=>arr.reduce((s,r)=>s+f(r),0);
  const ent = R.filter(r=>r.type==="entree" && !r.memo); // la balance d'entrée est pour mémoire
  const sor = R.filter(r=>r.type==="sortie");
  const totalQtyEntree = sum(ent,r=>r.qty) + (report?.qtyEntree||0);
  const totalQtySortie = sum(sor.filter(r=>!r.provisoire),r=>r.qty) + (report?.qtySortie||0);
  const totalMontantEntree = sum(ent,r=>r.qty*r.pu) + (report?.montantEntree||0);
  const totalMontantSortie = sum(sor.filter(r=>!r.provisoire),r=>r.qty*r.pu) + (report?.montantSortie||0);
  // Pour mémoire (sans effet sur l'existant) : nombre d'unités en sortie provisoire.
  const totalProv = sum(sor.filter(r=>r.provisoire),r=>r.qty) + (report?.qtyProvisoire||0);
  const blank = 0;
  const N = 14;
  return (
    <div style={{ color:"#111" }}>
      <OfficialHeader/>
      <div style={{ display:"flex", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ width:"22%", fontSize:11, lineHeight:1.7 }}>
          <div>Période du &nbsp;<b>{fmtDate(periodFrom)||"—"}</b></div>
          <div>au <b style={{marginLeft:34}}>{fmtDate(periodTo)||"—"}</b></div>
        </div>
        <div style={{ flex:1, fontSize:13, fontWeight:800, textAlign:"center", letterSpacing:.3 }}>LE LIVRE - JOURNAL DES MOUVEMENTS DES MATIERES AFFECTANT L'EXISTANT<sup>(1)</sup></div>
        <ModelLines m={M} style={{width:"16%",textAlign:"right"}}/>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup>
          <col style={{width:"6%"}}/><col style={{width:"7%"}}/><col style={{width:"17%"}}/>
          <col style={{width:"4%"}}/><col style={{width:"6%"}}/><col style={{width:"5%"}}/>
          <col style={{width:"4%"}}/><col style={{width:"6%"}}/><col style={{width:"5%"}}/>
          <col style={{width:"7%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"9%"}}/>
        </colgroup>
        <thead>
          <tr>
            <th style={th} rowSpan={3}>Date</th>
            <th style={th} colSpan={2}>DESIGNATION DES MATIERES</th>
            <th style={th} colSpan={3}>Entrées</th>
            <th style={th} colSpan={3}>Sorties</th>
            <th style={th} rowSpan={3}>P.Unitaire</th>
            <th style={th} colSpan={2}>MONTANT</th>
            <th style={th} rowSpan={3}>Pour mémoire<br/>sorties<br/>provisoires</th>
            <th style={th} rowSpan={3}>Observations</th>
          </tr>
          <tr>
            <th style={th} rowSpan={2}>Nomenclature</th>
            <th style={th} rowSpan={2}>Nature des Matières <sup>(2)</sup></th>
            <th style={th} rowSpan={2}>N° Bon <sup>(3)</sup></th>
            <th style={th} rowSpan={2}>Nbre unités</th>
            <th style={th} rowSpan={2}>Nature Unité</th>
            <th style={th} rowSpan={2}>N° Bon <sup>(3)</sup></th>
            <th style={th} rowSpan={2}>Nbre unités</th>
            <th style={th} rowSpan={2}>Nature Unité</th>
            <th style={th} rowSpan={2}>Entrées</th>
            <th style={th} rowSpan={2}>Sorties</th>
          </tr>
          <tr></tr>
        </thead>
        <tbody>
          <tr style={{fontStyle:"italic",fontWeight:700}}>
            <td style={td}></td><td style={td}></td><td style={td}>Reports</td>
            <td style={td}></td><td style={{...td,textAlign:"right"}}>{fmt(report?.qtyEntree)}</td><td style={td}></td>
            <td style={td}></td><td style={{...td,textAlign:"right"}}>{fmt(report?.qtySortie)}</td><td style={td}></td>
            <td style={td}></td>
            <td style={{...td,textAlign:"right"}}>{fmt(report?.montantEntree)}</td>
            <td style={{...td,textAlign:"right"}}>{fmt(report?.montantSortie)}</td>
            <td style={{...td,textAlign:"right"}}>{fmt(report?.qtyProvisoire)}</td>
            <td style={td}></td>
          </tr>
          {R.map((r,i)=>{
            const isE = r.type==="entree", m = r.qty*r.pu;
            return (
              <tr key={i}>
                <td style={{...td,textAlign:"center"}}>{fmtDate(r.date)}</td>
                <td style={{...td,textAlign:"center"}}>{r.compteNumero}</td>
                <td style={td}>{r.productName}</td>
                <td style={{...td,textAlign:"center"}}>{isE?r.bon:""}</td>
                <td style={{...td,textAlign:"right"}}>{isE?(r.memo?"("+fmt(r.qty)+")":fmt(r.qty)):""}</td>
                <td style={{...td,textAlign:"center"}}>{isE?r.unite:""}</td>
                <td style={{...td,textAlign:"center"}}>{!isE?r.bon:""}</td>
                <td style={{...td,textAlign:"right"}}>{(!isE&&!r.provisoire)?fmt(r.qty):""}</td>
                <td style={{...td,textAlign:"center"}}>{!isE?r.unite:""}</td>
                <td style={{...td,textAlign:"right"}}>{fmt(r.pu)}</td>
                <td style={{...td,textAlign:"right",fontWeight:700}}>{isE?(r.memo?"("+fmt(m)+")":fmt(m)):""}</td>
                <td style={{...td,textAlign:"right",fontWeight:700}}>{(!isE&&!r.provisoire)?fmt(m):""}</td>
                <td style={{...td,textAlign:"right",fontWeight:700}}>{(!isE&&r.provisoire)?fmt(r.qty):""}</td>
                <td style={td}>{r.observations}</td>
              </tr>
            );
          })}
          {R.length===0&&<tr><td colSpan={N} style={{...td,textAlign:"center",color:"#64748b"}}>Aucun mouvement sur cette période.</td></tr>}
          {Array.from({length:blank}).map((_,i)=>(
            <tr key={"b"+i}>{Array.from({length:N}).map((__,j)=><td key={j} style={{...td,height:14}}></td>)}</tr>
          ))}
          <tr>
            <td style={tdt}></td><td style={tdt}></td><td style={{...tdt,fontStyle:"italic"}}>Totaux à reporter</td>
            <td style={tdt}></td><td style={{...tdt,textAlign:"right"}}>{fmt(totalQtyEntree)}</td><td style={tdt}></td>
            <td style={tdt}></td><td style={{...tdt,textAlign:"right"}}>{fmt(totalQtySortie)}</td><td style={tdt}></td>
            <td style={tdt}></td>
            <td style={{...tdt,textAlign:"right"}}>{fmt(totalMontantEntree)}</td>
            <td style={{...tdt,textAlign:"right"}}>{fmt(totalMontantSortie)}</td>
            <td style={{...tdt,textAlign:"right"}}>{fmt(totalProv)}</td>
            <td style={tdt}></td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize:8, marginTop:10, lineHeight:1.6 }}>
        <div>(1) il concerne les opérations des groupes 1 et 2</div>
        <div>(2) Inscription détaillée des comptes affectés par chaque opération d'entrée ou de sortie dans l'ordre chronologique des bons, les matières étant inscrites dans l'ordre des pièces justificatives</div>
        <div>(3) Série ininterrompue pendant une gestion</div>
      </div>
    </div>
  );
}

// ═══════════════ Clôture de gestion & compte de gestion ═══════════════
// Imprimés de fin de gestion (Instruction générale ; doc. de formation
// diapos 123 à 136) : relevé récapitulatif, PV de recensement, certificat
// administratif portant autorisation, compte de gestion des matières.

const CB = "1px solid #111";
const cth = { border:CB, padding:"4px 5px", fontSize:9.5, fontWeight:700, textAlign:"center", verticalAlign:"middle" };
const ctd = { border:CB, padding:"3px 5px", fontSize:9.5, verticalAlign:"top" };
const cnum = n => Number(n||0).toLocaleString("fr-FR");
const cnumBlank = n => n ? cnum(n) : "";

function ClotureHead({ title, subtitle, model, circuitLabel, numero }) {
  return (
    <>
      <OfficialHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ width:"24%", fontSize:10, lineHeight:1.7 }}>
          {circuitLabel&&<div style={{color:"#64748b"}}>Circuit : {circuitLabel}</div>}
          {numero&&<div><b>N° {numero}</b></div>}
        </div>
        <div style={{ flex:1, textAlign:"center" }}>
          <div style={{ fontSize:14.5, fontWeight:800, lineHeight:1.35 }}>{title}</div>
          {subtitle&&<div style={{ fontSize:11, marginTop:4 }}>{subtitle}</div>}
        </div>
        <div style={{ width:"24%", textAlign:"right" }}><ModelLines m={model}/></div>
      </div>
    </>
  );
}

function ClotureSignatures({ labels, names }) {
  return (
    <div className="nb" style={{ display:"grid", gridTemplateColumns:`repeat(${labels.length},1fr)`, gap:20, marginTop:22, breakInside:"avoid" }}>
      {labels.map(l=>(
        <div key={l} style={{ textAlign:"center" }}>
          <div style={{ fontWeight:700, fontSize:11, textDecoration:"underline" }}>{l}</div>
          {names?.[l]&&<div style={{ fontSize:11, fontWeight:600, marginTop:6 }}>{names[l]}</div>}
          <div style={{ height:70 }}></div>
        </div>
      ))}
    </div>
  );
}

export function ReleveRecapPrint({ rows, date, circuitLabel, model, signatoryNames }) {
  const M = model || PRESET_FANN.releve;
  const tot = (rows||[]).reduce((a,r)=>({ mag:a.mag+r.enMagasin, svc:a.svc+(r.enService||0), prov:a.prov+r.enSortieProv, ex:a.ex+r.existantFin, val:a.val+r.valeur }),{mag:0,svc:0,prov:0,ex:0,val:0});
  return (
    <div style={{ color:"#111" }}>
      <ClotureHead title="RELEVÉ RÉCAPITULATIF DES MATIÈRES" subtitle={"à la date du "+(fmtDate(date)||"—")} model={M} circuitLabel={circuitLabel}/>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup><col style={{width:"10%"}}/><col style={{width:"30%"}}/><col style={{width:"8%"}}/><col style={{width:"11%"}}/><col style={{width:"9%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/><col style={{width:"12%"}}/></colgroup>
        <thead>
          <tr>
            <th style={cth}>N° Compte nomenclature</th><th style={cth}>Désignation des matières</th><th style={cth}>Unité</th>
            <th style={cth}>En attente d'affectation (en magasin)</th><th style={cth}>En service</th><th style={cth}>En sortie provisoire</th>
            <th style={cth}>Existant (grand livre)</th><th style={cth}>Valeur (P.U. × existant)</th>
          </tr>
        </thead>
        <tbody>
          {(rows||[]).map(r=>(
            <tr key={r.productId}>
              <td style={{...ctd,textAlign:"center"}}>{r.compteNumero}</td><td style={ctd}>{r.productName}</td><td style={{...ctd,textAlign:"center"}}>{r.unit}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(r.enMagasin)}</td><td style={{...ctd,textAlign:"right"}}>{cnumBlank(r.enService)}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnumBlank(r.enSortieProv)}</td><td style={{...ctd,textAlign:"right",fontWeight:700}}>{cnum(r.existantFin)}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(r.valeur)}</td>
            </tr>
          ))}
          <tr>
            <td style={{...ctd,fontWeight:800}} colSpan={3}>TOTAUX</td>
            <td style={{...ctd,textAlign:"right",fontWeight:800}}>{cnum(tot.mag)}</td><td style={{...ctd,textAlign:"right",fontWeight:800}}>{cnumBlank(tot.svc)}</td>
            <td style={{...ctd,textAlign:"right",fontWeight:800}}>{cnumBlank(tot.prov)}</td><td style={{...ctd,textAlign:"right",fontWeight:800}}>{cnum(tot.ex)}</td>
            <td style={{...ctd,textAlign:"right",fontWeight:800}}>{cnum(tot.val)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{fontSize:8.5,marginTop:6,color:"#334155"}}>Établi en fin de gestion et lors de tout arrêté des écritures, dans l'ordre des comptes de la nomenclature, en reportant l'existant du grand livre. La colonne « En service » reprend les fiches d'inventaire individuel contradictoire (matériel du 1er groupe confié aux détenteurs).</div>
      <ClotureSignatures labels={M.signers?.length?M.signers:["Le Comptable des matières"]} names={signatoryNames}/>
    </div>
  );
}

export function PvRecensementPrint({ cloture, circuitLabel, model, commission }) {
  const M = model || PRESET_FANN.pv_recensement;
  const L = cloture?.lignes||[];
  const exc = L.reduce((a,l)=>a+Math.max(0,l.ecart)*l.pu,0), def = L.reduce((a,l)=>a+Math.max(0,-l.ecart)*l.pu,0);
  return (
    <div style={{ color:"#111" }}>
      <ClotureHead title="PROCÈS-VERBAL DE RECENSEMENT DES MATIÈRES" subtitle={"Gestion "+cloture?.year+" — recensement au "+(fmtDate(cloture?.date)||"—")} model={M} circuitLabel={circuitLabel} numero={cloture?.pvNumero}/>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup><col style={{width:"9%"}}/><col style={{width:"25%"}}/><col style={{width:"7%"}}/><col style={{width:"9%"}}/><col style={{width:"9%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"9%"}}/><col style={{width:"8%"}}/></colgroup>
        <thead>
          <tr>
            <th style={cth} rowSpan={2}>N° nomenclature</th><th style={cth} rowSpan={2}>Désignation des matières</th><th style={cth} rowSpan={2}>Unité</th>
            <th style={cth} colSpan={2}>Existant</th><th style={cth} colSpan={2}>Écarts</th><th style={cth} rowSpan={2}>P.U.</th><th style={cth} rowSpan={2}>Valeur des écarts</th><th style={cth} rowSpan={2}>Observations</th>
          </tr>
          <tr><th style={cth}>D'après les écritures</th><th style={cth}>Constaté</th><th style={cth}>Excédent</th><th style={cth}>Déficit</th></tr>
        </thead>
        <tbody>
          {L.map(l=>(
            <tr key={l.productId}>
              <td style={{...ctd,textAlign:"center"}}>{l.compteNumero}</td><td style={ctd}>{l.productName}</td><td style={{...ctd,textAlign:"center"}}>{l.unit}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(l.existantComptable)}</td><td style={{...ctd,textAlign:"right",fontWeight:700}}>{cnum(l.constate)}</td>
              <td style={{...ctd,textAlign:"right"}}>{l.ecart>0?cnum(l.ecart):""}</td><td style={{...ctd,textAlign:"right"}}>{l.ecart<0?cnum(-l.ecart):""}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(l.pu)}</td><td style={{...ctd,textAlign:"right"}}>{l.ecart?cnum(Math.abs(l.ecart)*l.pu):""}</td>
              <td style={ctd}>{l.observation||""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="nb" style={{ border:CB, padding:10, fontSize:10.5, lineHeight:1.8, marginTop:10, breakInside:"avoid" }}>
        <b>RÉCAPITULATIF</b> — {L.length} article(s) recensé(s) ; {L.filter(l=>l.ecart>0).length} excédent(s) pour une valeur de <b>{cnum(exc)}</b> F ; {L.filter(l=>l.ecart<0).length} déficit(s) pour une valeur de <b>{cnum(def)}</b> F.
        {(exc||def)?<div>En cas d'écart, une copie du présent procès-verbal est adressée au Ministre chargé des Finances ; les écarts sont régularisés sur autorisation par certificat administratif.</div>:<div>Aucun écart entre l'existant physique et l'existant comptable.</div>}
      </div>
      <div className="nb" style={{ breakInside:"avoid", marginTop:14 }}>
        <div style={{ fontSize:11.5, fontWeight:700, marginBottom:6 }}>Noms, qualités et signatures des membres de la commission de recensement :</div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr><th style={{...cth,width:"7%"}}>N°</th><th style={{...cth,width:"38%"}}>Noms</th><th style={{...cth,width:"25%"}}>Qualité</th><th style={{...cth,width:"30%"}}>Signature</th></tr></thead>
          <tbody>
            {(commission||[]).map((m,i)=>(
              <tr key={i}><td style={{...ctd,textAlign:"center"}}>{i+1}</td><td style={ctd}><b>{m.displayName||m.personName}</b></td><td style={ctd}>{m.fonctionName||""}</td><td style={{...ctd,height:40}}></td></tr>
            ))}
            {(!commission||commission.length===0)&&[0,1,2].map(i=><tr key={i}><td style={{...ctd,textAlign:"center"}}>{i+1}</td><td style={{...ctd,height:40}}></td><td style={ctd}></td><td style={ctd}></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CertificatAdministratifPrint({ cloture, circuitLabel, model, signatoryNames }) {
  const M = model || PRESET_FANN.certificat;
  const L = (cloture?.lignes||[]).filter(l=>l.ecart);
  const [S1,S2] = (M.signers&&M.signers.length>=2) ? M.signers : ["L'Administrateur des matières","L'Ordonnateur des matières"];
  return (
    <div style={{ color:"#111" }}>
      <ClotureHead title="CERTIFICAT ADMINISTRATIF PORTANT AUTORISATION" subtitle={"Gestion "+cloture?.year} model={M} circuitLabel={circuitLabel} numero={cloture?.certificatNumero}/>
      <div style={{ fontSize:11, lineHeight:1.8, marginBottom:10 }}>
        Je, soussigné, l'ordonnateur des matières ou son délégué, certifie avoir autorisé, sur la demande de l'administrateur des matières, les opérations suivantes
        à la suite de l'excédent ou du déficit révélé par l'inventaire du <b>{fmtDate(cloture?.date)||"—"}</b>
        {cloture?.pvNumero?<> (procès-verbal de recensement n° <b>{cloture.pvNumero}</b>)</>:null}, dû à : <b>{cloture?.motifEcarts||"____________________________________"}</b>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <thead>
          <tr><th style={cth} colSpan={4}>POSITION ANCIENNE DES MATIÈRES</th><th style={cth} colSpan={2}>POSITION NOUVELLE</th><th style={cth} rowSpan={2}>Observations</th></tr>
          <tr><th style={cth}>N° nomenclature</th><th style={{...cth,width:"26%"}}>Désignation</th><th style={cth}>Quantité</th><th style={cth}>Montant</th><th style={cth}>Quantité</th><th style={cth}>Montant</th></tr>
        </thead>
        <tbody>
          {L.map(l=>(
            <tr key={l.productId}>
              <td style={{...ctd,textAlign:"center"}}>{l.compteNumero}</td><td style={ctd}>{l.productName}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(l.existantComptable)}</td><td style={{...ctd,textAlign:"right"}}>{cnum(l.existantComptable*l.pu)}</td>
              <td style={{...ctd,textAlign:"right",fontWeight:700}}>{cnum(l.constate)}</td><td style={{...ctd,textAlign:"right"}}>{cnum(l.constate*l.pu)}</td>
              <td style={ctd}>{l.ecart>0?"Excédent de "+cnum(l.ecart)+" — entrée par bon d'entrée":"Déficit de "+cnum(-l.ecart)+" — sortie par bon de sortie définitive"}{l.observation?" — "+l.observation:""}</td>
            </tr>
          ))}
          {L.length===0&&<tr><td style={{...ctd,textAlign:"center",color:"#64748b"}} colSpan={7}>Aucun écart à régulariser.</td></tr>}
        </tbody>
      </table>
      <div style={{ fontSize:10.5, marginTop:10 }}>Fait à Touba, le {fmtDate(cloture?.certificatDate||cloture?.date)||"—"}</div>
      <ClotureSignatures labels={[S1,S2]} names={signatoryNames}/>
    </div>
  );
}

export function CompteGestionPrint({ rows, year, circuitLabel, model, signatoryNames, pieces }) {
  const M = model || PRESET_FANN.compte_gestion;
  const tot = (rows||[]).reduce((a,r)=>({ deb:a.deb+r.existantDebut*r.pu, ent:a.ent+r.entrees*r.pu, sor:a.sor+(r.sortiesDef+r.retours)*r.pu, fin:a.fin+r.valeur }),{deb:0,ent:0,sor:0,fin:0});
  return (
    <div style={{ color:"#111" }}>
      <ClotureHead title="COMPTE DE GESTION DES MATIÈRES" subtitle={"Gestion "+year+" — balance générale des comptes"} model={M} circuitLabel={circuitLabel}/>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup><col style={{width:"8%"}}/><col style={{width:"19%"}}/><col style={{width:"7%"}}/><col style={{width:"7%"}}/><col style={{width:"7%"}}/><col style={{width:"8%"}}/><col style={{width:"7%"}}/><col style={{width:"8%"}}/><col style={{width:"7%"}}/><col style={{width:"7%"}}/><col style={{width:"6%"}}/><col style={{width:"9%"}}/></colgroup>
        <thead>
          <tr>
            <th style={cth} rowSpan={2}>N° compte</th><th style={cth} rowSpan={2}>Désignation des matières</th>
            <th style={cth} rowSpan={2}>Existant début de gestion</th><th style={cth} rowSpan={2}>Entrées de la gestion</th><th style={cth} rowSpan={2}>Total des entrées</th>
            <th style={cth} rowSpan={2}>Sorties définitives</th>
            <th style={cth} colSpan={4}>Existant en fin de gestion</th>
            <th style={cth} rowSpan={2}>P.U.</th><th style={cth} rowSpan={2}>Valeur existant fin</th>
          </tr>
          <tr><th style={cth}>Total</th><th style={cth}>dont en attente d'affectation</th><th style={cth}>dont en service</th><th style={cth}>dont en sortie provisoire</th></tr>
        </thead>
        <tbody>
          {(rows||[]).map(r=>(
            <tr key={r.productId}>
              <td style={{...ctd,textAlign:"center"}}>{r.compteNumero}</td><td style={ctd}>{r.productName}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(r.existantDebut)}</td><td style={{...ctd,textAlign:"right"}}>{cnumBlank(r.entrees)}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(r.totalEntrees)}</td><td style={{...ctd,textAlign:"right"}}>{cnumBlank(r.sortiesDef+r.retours)}</td>
              <td style={{...ctd,textAlign:"right",fontWeight:700}}>{cnum(r.existantFin)}</td><td style={{...ctd,textAlign:"right"}}>{cnum(r.enMagasin)}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnumBlank(r.enService)}</td><td style={{...ctd,textAlign:"right"}}>{cnumBlank(r.enSortieProv)}</td><td style={{...ctd,textAlign:"right"}}>{cnum(r.pu)}</td>
              <td style={{...ctd,textAlign:"right"}}>{cnum(r.valeur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="nb" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:10, fontSize:10.5, breakInside:"avoid" }}>
        <div style={{ border:CB, padding:8, lineHeight:1.8 }}>
          <b>VALEURS (FCFA)</b><br/>
          Existant en début de gestion : <b>{cnum(tot.deb)}</b><br/>
          Entrées de la gestion : <b>{cnum(tot.ent)}</b><br/>
          Sorties définitives : <b>{cnum(tot.sor)}</b><br/>
          Existant en fin de gestion : <b>{cnum(tot.fin)}</b>
        </div>
        <div style={{ border:CB, padding:8, lineHeight:1.8 }}>
          <b>PIÈCES JUSTIFICATIVES JOINTES</b><br/>
          Bons d'entrée : <b>{pieces?.be||0}</b> · Bons de sortie définitive : <b>{pieces?.bsd||0}</b> · Bons de sortie provisoire : <b>{pieces?.bsp||0}</b><br/>
          Bons de retour : <b>{pieces?.br||0}</b> · PV de réception : <b>{pieces?.pv||0}</b><br/>
          PV de recensement : <b>{pieces?.pvr||"—"}</b> · Extrait du grand livre · Arrêté de nomination du comptable
        </div>
      </div>
      <div style={{ fontSize:9, marginTop:6, color:"#334155" }}>Établi en quatre exemplaires (comptable, comptable centralisateur, ministère de tutelle / ordonnateur, Cour des comptes) et transmis au juge des comptes dans les cinq mois suivant la clôture de la gestion. Coté et paraphé sur chaque feuillet.</div>
      <ClotureSignatures labels={M.signers?.length?M.signers:["Le Comptable des matières"]} names={signatoryNames}/>
    </div>
  );
}

// Fiche d'inventaire individuel contradictoire des matières du 1er groupe
// confiées à un détenteur (modèle n°6 — doc. de formation diapo 94).
// Inventaire permanent : les matières peuvent être remises ou reprises à des
// dates différentes. À établir en trois exemplaires (détenteur, comptable,
// affiché dans le bureau ou local).
export function FicheDetenteurPrint({ fiche, mouvements, products, circuitLabel, model, signatoryNames, year }) {
  const M = model || PRESET_FANN.fiche_detenteur;
  const [S1,S2] = (M.signers&&M.signers.length>=2) ? M.signers : ["Le Comptable des matières","Le Détenteur"];
  const mv = (mouvements||[]).filter(m=>m.status!=="annule").sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const byProd = {};
  mv.forEach(m=>{ (byProd[m.productId] ||= []).push(m); });
  const lignes = Object.entries(byProd).map(([pid,list])=>{
    const p = (products||[]).find(x=>x.id===pid)||{};
    return { pid, p, list, remises:list.filter(m=>m.type!=="reprise"), reprises:list.filter(m=>m.type==="reprise"),
      detenu:list.reduce((s,m)=>s+(m.type==="reprise"?-1:1)*(Number(m.qty)||0),0) };
  });
  return (
    <div style={{ color:"#111" }}>
      <ClotureHead title="INVENTAIRE INDIVIDUEL CONTRADICTOIRE DES MATIÈRES DU 1er GROUPE" subtitle={"confiées à un détenteur"+(year?" — année budgétaire "+year:"")} model={M} circuitLabel={circuitLabel} numero={fiche?.numero}/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, fontSize:10.5, lineHeight:1.8, marginBottom:10 }}>
        <div style={{ border:CB, padding:8 }}>
          <b>Le Comptable des matières</b>, soussigné, déclare conserver les matières décrites ci-dessous dans ses prises en charge.<br/>
          Prénom, Nom : <b>{signatoryNames?.[S1]||"______________________"}</b>
        </div>
        <div style={{ border:CB, padding:8 }}>
          <b>Le Détenteur</b> — Prénom, Nom : <b>{fiche?.detenteurNom||"—"}</b> · Fonction : <b>{fiche?.fonction||"—"}</b><br/>
          Lieu d'affectation des matières : <b>{fiche?.lieu||"—"}</b><br/>
          Soussigné, déclare détenir les matières et m'engage à les tenir en bon état d'entretien.
        </div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup><col style={{width:"9%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/><col style={{width:"21%"}}/><col style={{width:"7%"}}/><col style={{width:"8%"}}/><col style={{width:"6%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"6%"}}/><col style={{width:"7%"}}/></colgroup>
        <thead>
          <tr>
            <th style={cth} rowSpan={2}>N° nomenclature</th><th style={cth} rowSpan={2}>N° d'immatriculation</th><th style={cth} rowSpan={2}>N° bon d'entrée</th>
            <th style={cth} rowSpan={2}>Désignation des matières</th><th style={cth} rowSpan={2}>Nature de l'unité</th>
            <th style={cth} colSpan={3}>REMISE DE MATIÈRES AU DÉTENTEUR</th><th style={cth} colSpan={3}>REPRISE DES MATIÈRES PAR LE COMPTABLE</th>
          </tr>
          <tr><th style={cth}>Date</th><th style={cth}>Nbre d'unités</th><th style={cth}>Émargement</th><th style={cth}>Date</th><th style={cth}>Nbre d'unités</th><th style={cth}>Émargement</th></tr>
        </thead>
        <tbody>
          {lignes.map(l=>{
            const n = Math.max(l.remises.length, l.reprises.length, 1);
            return Array.from({length:n}).map((_,i)=>{
              const r=l.remises[i], k=l.reprises[i];
              return (
                <tr key={l.pid+"_"+i}>
                  {i===0&&<>
                    <td style={{...ctd,textAlign:"center"}} rowSpan={n}>{l.p.compteNumero||""}</td>
                    <td style={ctd} rowSpan={n}>{[...new Set(l.list.map(m=>m.immatriculation).filter(Boolean))].join(", ")}</td>
                    <td style={ctd} rowSpan={n}>{[...new Set(l.list.map(m=>m.beRef).filter(Boolean))].join(", ")}</td>
                    <td style={ctd} rowSpan={n}>{l.p.name||l.list[0].productName}{l.detenu?<div style={{fontSize:8.5,color:"#334155"}}>Détenu à ce jour : <b>{l.detenu}</b></div>:null}</td>
                    <td style={{...ctd,textAlign:"center"}} rowSpan={n}>{l.p.unit||""}</td>
                  </>}
                  <td style={{...ctd,textAlign:"center"}}>{r?fmtDate(r.date):""}</td><td style={{...ctd,textAlign:"right"}}>{r?cnum(r.qty):""}</td><td style={{...ctd,height:22}}></td>
                  <td style={{...ctd,textAlign:"center"}}>{k?fmtDate(k.date):""}</td><td style={{...ctd,textAlign:"right"}}>{k?cnum(k.qty):""}</td><td style={ctd}></td>
                </tr>
              );
            });
          })}
          {lignes.length===0&&<tr><td style={{...ctd,textAlign:"center",color:"#64748b"}} colSpan={11}>Aucune matière remise à ce détenteur.</td></tr>}
        </tbody>
      </table>
      <div style={{fontSize:8.5,marginTop:6}}>(1) Cet inventaire individuel est un inventaire permanent ; les matières peuvent être remises ou reprises à des dates différentes. Document à établir en trois exemplaires : 1 pour le détenteur, 1 pour le comptable, 1 affiché dans chaque bureau ou local.</div>
      <div style={{fontSize:10.5,marginTop:6}}>Fait à Touba, le {fmtDate(new Date().toISOString().slice(0,10))}</div>
      <ClotureSignatures labels={[S1,S2]} names={{...signatoryNames,[S2]:signatoryNames?.[S2]||fiche?.detenteurNom}}/>
    </div>
  );
}

// Nomenclature — liste des articles filtrée (par compte principal,
// divisionnaire / sous-compte, groupe), regroupée par compte de rattachement.
export function NomenclatureListPrint({ rows, filtersLabel }) {
  const groups = [];
  (rows||[]).forEach(r=>{
    const key = r.compte || "__none";
    let g = groups.find(x=>x.key===key);
    if (!g) { g = { key, title: r.compte ? r.compte+" — "+(r.compteLib||"") : "Articles sans n° de compte", princ: r.principal ? r.principal+" — "+(r.principalLib||"") : "", rows:[] }; groups.push(g); }
    g.rows.push(r);
  });
  return (
    <div style={{ color:"#111" }}>
      <OfficialHeader/>
      <div style={{ textAlign:"center", marginBottom:8 }}>
        <div style={{ fontSize:15, fontWeight:800 }}>NOMENCLATURE DES MATIÈRES — LISTE DES ARTICLES</div>
        <div style={{ fontSize:10.5, marginTop:3 }}>{filtersLabel}</div>
        <div style={{ fontSize:10, color:"#475569" }}>{(rows||[]).length} article(s)</div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
        <colgroup><col style={{width:"13%"}}/><col style={{width:"45%"}}/><col style={{width:"12%"}}/><col style={{width:"16%"}}/><col style={{width:"14%"}}/></colgroup>
        <thead><tr><th style={cth}>Réf.</th><th style={cth}>Désignation de l'article</th><th style={cth}>Unité</th><th style={cth}>Spécification</th><th style={cth}>Groupe</th></tr></thead>
        <tbody>
          {groups.map(g=>[
            <tr key={g.key+"_h"}><td colSpan={5} style={{...ctd,background:"#e7f5ee",fontWeight:800}}>{g.title}{g.princ&&g.key.split(".").length>1?<span style={{fontWeight:400,color:"#475569"}}> · {g.princ}</span>:null} <span style={{fontWeight:400,color:"#475569"}}>({g.rows.length})</span></td></tr>,
            ...g.rows.map(r=>(
              <tr key={r.id}>
                <td style={{...ctd,fontWeight:700}}>{r.ref||"—"}</td><td style={ctd}>{r.name}</td><td style={{...ctd,textAlign:"center"}}>{r.unit}</td>
                <td style={{...ctd,textAlign:"center"}}>{r.spec}</td><td style={{...ctd,textAlign:"center"}}>{r.groupe}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
