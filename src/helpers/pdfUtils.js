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
