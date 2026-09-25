import { LOGO_B64 } from "../images";

export const PDF_CSS = `body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;line-height:1.5;padding:20px 28px;margin:0;}
table{width:100%;border-collapse:collapse;margin-bottom:14px;}
th,td{padding:7px 9px;border:1px solid #e2e8f0;text-align:left;font-size:11px;}
th{background:#f0f9ff;font-weight:700;color:#0891b2;}
.total-row td{background:#f0f9ff;font-weight:800;color:#0891b2;}
.ph-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #0891b2;}
.ph-logo{display:flex;align-items:center;gap:10px;}
.ph-logo img{width:55px;height:55px;border-radius:50%;object-fit:cover;}
.ph-org{font-size:14px;font-weight:800;color:#0891b2;line-height:1.2;}
.ph-sub{font-size:9px;color:#64748b;line-height:1.4;}
.ph-doctitle{font-size:16px;font-weight:800;text-align:right;}
.ph-docref{font-size:11px;color:#64748b;font-family:monospace;text-align:right;}
.footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;}
@page{margin:12mm;}`;

export function pdfHeader(docTitle, docRef="") {
  return `<div class="ph-header">
    <div class="ph-logo">
      <img src="${LOGO_B64}" alt="CHNCAK"/>
      <div>
        <div class="ph-org">CHNCAK</div>
        <div class="ph-sub">Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
        <div class="ph-sub">PharmaStock — Gestion Pharmaceutique</div>
      </div>
    </div>
    <div>
      <div class="ph-doctitle">${docTitle}</div>
      ${docRef ? `<div class="ph-docref">${docRef}</div>` : ""}
    </div>
  </div>`;
}

export function downloadPDF(title, htmlContent) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${PDF_CSS}</style></head><body>${htmlContent}</body></html>`);
  doc.close();
  setTimeout(()=>{
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(()=>{ try{document.body.removeChild(iframe);}catch{} }, 2000);
  }, 300);
}

// jsPDF (polices Helvetica standard, encodage WinAnsi) ne sait pas afficher
// l'espace fine insécable que produit toLocaleString("fr-FR") pour séparer
// les milliers (ex: "180\u202f000") — le glyphe demandé n'existe pas dans
// cet encodage et s'affiche comme un caractère parasite ("/"). On regroupe
// donc les milliers nous-mêmes avec un espace normal, sûr dans cette police.
export function fmtNumPdf(n) {
  const num = Math.round(Number(n)||0);
  const neg = num < 0;
  const s = Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg?"-":"") + s;
}

// Vraie génération de fichier .pdf téléchargeable (jsPDF) — contrairement à
// downloadPDF ci-dessus, ne passe jamais par la boîte de dialogue
// d'impression du navigateur : un clic, un fichier enregistré, comme Excel.
// L'en-tête reproduit le texte de l'en-tête officiel utilisé sur les
// documents imprimés (République du Sénégal / Ministère / CHNCAK) — sans les
// logos, dont la taille dépasse le seuil d'intégration en base64 de Vite et
// ne sont donc pas fiables à charger ici.
export async function downloadPdfTable({ filename, title, subtitle, headers, rows, totalRow }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const orientation = headers.length > 7 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = 10;
  doc.setFontSize(10.5);
  doc.setFont(undefined, "bold");
  doc.setTextColor(20);
  doc.text("République du Sénégal", pageWidth/2, y, { align: "center" }); y += 4.2;
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(60);
  ["Un peuple - un but - une foi","Ministère de la Santé et de l'Hygiène Publique","Direction Générale des Établissements de Santé","Direction des Établissements Publics de Santé"]
    .forEach(line=>{ doc.text(line, pageWidth/2, y, { align: "center" }); y += 3.6; });
  doc.setFont(undefined, "bold");
  doc.setTextColor(20);
  doc.text("Centre Hospitalier National Cheikh Ahmadoul Khadim", pageWidth/2, y, { align: "center" }); y += 3;
  doc.setDrawColor(6, 95, 70);
  doc.setLineWidth(0.6);
  doc.line(14, y, pageWidth-14, y);
  y += 6;

  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.setTextColor(20);
  doc.text(title, 14, y);
  if (subtitle) {
    doc.setFontSize(8.5);
    doc.setFont(undefined, "normal");
    doc.setTextColor(100);
    doc.text(subtitle, pageWidth - 14, y, { align: "right" });
  }
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    foot: totalRow ? [totalRow] : undefined,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text(
      "Généré le " + new Date().toLocaleDateString("fr-FR") + " — Page " + i + "/" + pageCount,
      pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" }
    );
  }

  doc.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}
