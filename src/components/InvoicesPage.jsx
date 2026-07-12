import { useState } from "react";
import * as XLSX from "xlsx";
import { numberToWords, downloadExcel } from "../helpers/exportUtils";
import { imageUrlToDataURL } from "../helpers/fileUtils";
import { IMG_CARDIO_SRC, IMG_LABEL_SRC, IMG_CHNCAK_SRC, IMG_LOGO_CARDIO_B64, IMG_LABEL_QUALITE_B64, IMG_LOGO_CHNCAK_B64 } from "../images";
import { PageHeader } from "./ui/PageHeader";
import { btn, card } from "../helpers/styles";
import { can } from "../permissions";
import { Badge } from "./ui/FormControls";

export function InvoicesPage({store,activeSupplier,onNav,currentUser}){
  const [sel,setSel]=useState(null);
  const invoices=activeSupplier ? store.invoices.filter(i=>i.supplierId===activeSupplier.id) : store.invoices;

  // ── Génération Excel Situation (format CHNCAK) ──
  const downloadSituationExcel = async (inv) => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const [cardioB64, labelB64, chncakB64] = await Promise.all([
        imageUrlToDataURL(IMG_CARDIO_SRC),
        imageUrlToDataURL(IMG_LABEL_SRC),
        imageUrlToDataURL(IMG_CHNCAK_SRC),
      ]);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Situation");
      const now = new Date().toLocaleDateString("fr-FR");
      const items = inv.items||[];

      // Colonnes : A = marge image gauche, B-E = contenu, F = marge image droite
      ws.columns = [{width:11},{width:44},{width:20},{width:20},{width:20},{width:20}];

      const navy = "FF1A3A5C", lightBlue = "FFDCE6F1";
      const centerBold = { horizontal:"center", vertical:"middle" };
      const thin = { style:"thin", color:{argb:"FFDDDDDD"} };
      const border = { top:thin, bottom:thin, left:thin, right:thin };

      let r = 1;
      const entLignes = [
        "République du Sénégal",
        "Un peuple - un but - une foi",
        "Ministère de la Santé et de l'Action Sociale",
        "Direction Générale des Établissements de Santé",
        "Direction des Établissements Publics de Santé",
        "Centre Hospitalier National Cheikh Ahmadoul Khadim",
      ];
      entLignes.forEach((t,i) => {
        ws.mergeCells(r,2,r,5);
        const cell = ws.getCell(r,2);
        cell.value = t;
        cell.alignment = centerBold;
        cell.font = { bold: i===0||i===5, size: i===0?11:8.5 };
        ws.getRow(r).height = 13;
        r++;
      });

      ws.getCell(r,5).value = `Date : ${now}`;
      ws.getCell(r,5).alignment = { horizontal:"right" };
      r++;
      r++; // ligne vide

      const phRow = r;
      ws.mergeCells(r,2,r,5);
      const phCell = ws.getCell(r,2);
      phCell.value = "LA PHARMACIE — CHNCAK";
      phCell.font = { bold:true, color:{argb:"FFFFFFFF"}, size:11 };
      phCell.alignment = centerBold;
      phCell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:navy} };
      ws.getRow(r).height = 20;
      r++;

      ws.mergeCells(r,2,r,5);
      const titCell = ws.getCell(r,2);
      titCell.value = `SITUATION MENSUELLE DES VENTES — ${inv.supplier} (${inv.month})`;
      titCell.font = { bold:true, color:{argb:navy}, size:11 };
      titCell.alignment = centerBold;
      titCell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:lightBlue} };
      ws.getRow(r).height = 18;
      r++;

      ws.getCell(r,2).value = `Réf : ${inv.reference}`;
      r++;
      r++; // ligne vide

      const hdRow = r;
      ["DÉSIGNATION","QUANTITÉS VENDUES","PRIX UNITAIRE (FCFA)","PRIX TOTAL (FCFA)"].forEach((h,i) => {
        const cell = ws.getCell(r, 2+i);
        cell.value = h;
        cell.font = { bold:true, color:{argb:"FFFFFFFF"} };
        cell.alignment = centerBold;
        cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:navy} };
        cell.border = border;
      });
      ws.getRow(r).height = 20;
      r++;

      items.forEach(it => {
        ws.getCell(r,2).value = it.productName;
        ws.getCell(r,3).value = Number(it.qty||0);
        ws.getCell(r,4).value = Number(it.unitPrice||0);
        ws.getCell(r,5).value = Number(it.total||0);
        for (let c=2;c<=5;c++) ws.getCell(r,c).border = border;
        ws.getRow(r).height = 16;
        r++;
      });

      ws.mergeCells(r,2,r,4);
      const totLabel = ws.getCell(r,2);
      totLabel.value = "MONTANT TOTAL (FCFA)";
      totLabel.font = { bold:true, color:{argb:"FFFFFFFF"} };
      totLabel.alignment = centerBold;
      totLabel.fill = { type:"pattern", pattern:"solid", fgColor:{argb:navy} };
      const totVal = ws.getCell(r,5);
      totVal.value = Number(inv.total||0);
      totVal.font = { bold:true, color:{argb:"FFFFFFFF"} };
      totVal.alignment = { horizontal:"right" };
      totVal.fill = { type:"pattern", pattern:"solid", fgColor:{argb:navy} };
      r++;

      ws.mergeCells(r,2,r,5);
      ws.getCell(r,2).value = `Arrêté à : ${numberToWords(inv.total||0)} francs CFA`;
      ws.getCell(r,2).font = { italic:true, size:9 };
      r++; r++; r++;

      const sigPairs = [
        ["Le Chef de service de la Pharmacie CHNCAK", "Le SAF CHNCAK"],
        ["Le Comptable Matière Principal CHNCAK", "Le Contrôleur de Gestion CHNCAK"],
      ];
      sigPairs.forEach(([l,rr]) => {
        ws.mergeCells(r,2,r,3);
        ws.mergeCells(r,4,r,5);
        ws.getCell(r,2).value = l;
        ws.getCell(r,2).font = { bold:true, size:9 };
        ws.getCell(r,2).alignment = centerBold;
        ws.getCell(r,4).value = rr;
        ws.getCell(r,4).font = { bold:true, size:9 };
        ws.getCell(r,4).alignment = centerBold;
        r += 4;
      });
      ws.mergeCells(r,2,r,5);
      ws.getCell(r,2).value = "La Directrice CHNCAK";
      ws.getCell(r,2).font = { bold:true, size:9 };
      ws.getCell(r,2).alignment = centerBold;

      // ── Images (image du logo Cardiologie à gauche, Label + CHNCAK côte à côte à droite) ──
      const imgCardio = wb.addImage({ base64: cardioB64, extension:"jpeg" });
      ws.addImage(imgCardio, { tl:{col:0.1,row:0.1}, ext:{width:70,height:88} });

      const imgLabel = wb.addImage({ base64: labelB64, extension:"jpeg" });
      ws.addImage(imgLabel, { tl:{col:5.05,row:0.1}, ext:{width:60,height:60} });

      const imgChncak = wb.addImage({ base64: chncakB64, extension:"jpeg" });
      ws.addImage(imgChncak, { tl:{col:5.75,row:0.15}, ext:{width:55,height:42} });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SITUATION_${inv.supplier}_${inv.month.replace(/\s/g,"_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert("Erreur Excel : " + e.message); }
  };

  // ── Génération PDF Situation (format officiel CHNCAK) ──
  const downloadSituationPDF = async (inv) => {
    const [cardioB64, labelB64, chncakB64] = await Promise.all([
      imageUrlToDataURL(IMG_CARDIO_SRC),
      imageUrlToDataURL(IMG_LABEL_SRC),
      imageUrlToDataURL(IMG_CHNCAK_SRC),
    ]);
    const now = new Date().toLocaleDateString("fr-FR");
    const trs = (inv.items||[]).map((it,i) =>
      "<tr style=\"background:" + (i%2===0?"#fff":"#f8fafc") + "\">" +
      "<td>" + it.productName + "</td>" +
      "<td style=\"text-align:center\">" + Number(it.qty||0).toLocaleString("fr-FR") + "</td>" +
      "<td style=\"text-align:right\">" + Number(it.unitPrice||0).toLocaleString("fr-FR") + "</td>" +
      "<td style=\"text-align:right;font-weight:600\">" + Number(it.total||0).toLocaleString("fr-FR") + "</td>" +
      "</tr>"
    ).join("");

    const sigBlock = (label) =>
      "<div class=\"sb\">" +
        "<div class=\"sn\">" + label + "</div>" +
        "<div class=\"ss\"></div>" +
      "</div>";

    const css =
      "@page{size:A4;margin:1.5cm 1.8cm}" +
      "*{box-sizing:border-box;margin:0;padding:0}" +
      "body{font-family:Arial,sans-serif;font-size:10px;color:#111}" +
      ".ph{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A3A5C;padding-bottom:8px;margin-bottom:6px}" +
      ".ph-left{flex-shrink:0;width:85px}" +
      ".ph-right{flex-shrink:0;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;width:145px}" +
      ".eln{display:inline-block;border-bottom:1px solid #999;padding-bottom:1px}" +
      ".logo-c{width:72px;height:72px;object-fit:contain}" +
      ".label-q{width:64px;height:64px;object-fit:contain}" +
      ".ent{text-align:center;font-size:8.5px;line-height:1.8;color:#111;flex:1;padding:0 10px}" +
      ".ent .title{font-size:10px;font-weight:bold}" +
      ".band{background:#1A3A5C;color:#fff;text-align:center;padding:5px;font-size:11px;font-weight:bold;letter-spacing:1px;margin-bottom:8px}" +
      ".sit{background:#DCE6F1;border:1.5px solid #1A3A5C;color:#1A3A5C;text-align:center;padding:6px;font-size:11px;font-weight:bold;margin-bottom:8px;border-radius:2px}" +
      ".rd{display:flex;justify-content:space-between;font-size:9px;color:#555;margin-bottom:8px}" +
      "table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px}" +
      "th{background:#1A3A5C;color:#fff;padding:6px 8px;text-align:center;border:1px solid #0f2a47}" +
      "td{padding:5px 8px;border:1px solid #ddd}" +
      ".tot td{background:#1A3A5C;color:#fff;font-weight:bold;font-size:11px}" +
      ".montant{font-style:italic;font-size:9px;color:#444;margin:4px 0 24px;padding:5px 8px;border-left:3px solid #1A3A5C;background:#f8fafc}" +
      ".sg{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px}" +
      ".sb{text-align:center;padding:0 10px}" +
      ".sn{font-weight:bold;font-size:9px;color:#1A3A5C;text-decoration:underline;margin-bottom:60px;display:block}" +
      ".ss{height:4px}" +
      ".full{grid-column:1/-1;max-width:50%;margin:0 auto}";

    const html =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Situation</title>" +
      "<style>" + css + "</style></head><body>" +
      "<div class=\"ph\">" +
        "<div class=\"ph-left\">" +
          "<img src=\"" + cardioB64 + "\" style=\"width:80px;height:100px;object-fit:contain\" alt=\"Cardiologie\"/>" +
        "</div>" +
        "<div class=\"ent\">" +
          "<div style=\"font-size:11px;font-weight:bold\">République du Sénégal</div>" +
          "<div><span class=\"eln\">Un peuple - un but - une foi</span></div>" +
          "<div><span class=\"eln\">Ministère de la Santé et de l'Action Sociale</span></div>" +
          "<div><span class=\"eln\">Direction Générale des Établissements de Santé</span></div>" +
          "<div><span class=\"eln\">Direction des Établissements Publics de Santé</span></div>" +
          "<div style=\"font-weight:bold\"><span class=\"eln\">Centre Hospitalier National Cheikh Ahmadoul Khadim</span></div>" +
        "</div>" +
        "<div class=\"ph-right\">" +
          "<img src=\"" + labelB64 + "\" style=\"width:65px;height:65px;object-fit:contain\" alt=\"Label Qualité\"/>" +
          "<img src=\"" + chncakB64 + "\" style=\"width:65px;height:50px;object-fit:contain\" alt=\"CHNCAK\"/>" +
        "</div>" +
      "</div>" +
"<div class=\"rd\"><span>Réf : <strong>" + inv.reference + "</strong></span><span>Date : " + now + "</span></div>" +
      "<div class=\"band\">LA PHARMACIE — CHNCAK</div>" +
      "<div class=\"sit\">SITUATION MENSUELLE DES VENTES — " + inv.supplier + " (" + inv.month + ")</div>" +
      "<table><thead><tr>" +
        "<th style=\"width:45%\">DÉSIGNATION</th>" +
        "<th style=\"width:18%\">QUANTITÉS VENDUES</th>" +
        "<th style=\"width:18%\">PRIX UNITAIRE (FCFA)</th>" +
        "<th style=\"width:19%\">PRIX TOTAL (FCFA)</th>" +
      "</tr></thead><tbody>" + trs +
      "<tr class=\"tot\"><td colspan=\"3\" style=\"text-align:center\">MONTANT TOTAL (FCFA)</td>" +
      "<td style=\"text-align:right;font-size:12px\">" + Number(inv.total||0).toLocaleString("fr-FR") + "</td></tr>" +
      "</tbody></table>" +
      "<div class=\"montant\">Arrêté la présente situation à la somme de : <strong>" + numberToWords(inv.total||0) + " francs CFA</strong></div>" +
      "<div class=\"sg\">" +
        sigBlock("Le Chef de service de la Pharmacie CHNCAK") +
        sigBlock("Le SAF CHNCAK") +
        sigBlock("Le Comptable Matière Principal CHNCAK") +
        sigBlock("Le Contrôleur de Gestion CHNCAK") +
        "<div class=\"sb full\"><div class=\"sn\">La Directrice CHNCAK</div><div class=\"ss\"></div></div>" +
      "</div>" +
      "</body></html>";

    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if(win) {
      win.addEventListener("load", () => {
        setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 500);
      });
    } else {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none";
      document.body.appendChild(iframe);
      iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
      iframe.contentWindow.onload = () => {
        setTimeout(() => { iframe.contentWindow.print(); setTimeout(()=>document.body.removeChild(iframe),2000); }, 500);
      };
    }
  };



  if(sel){
    const inv=sel;
    return(
      <div style={{padding:0}}>
        <PageHeader pageId="factures" title="📊 Situation Mensuelle" subtitle={inv.supplier+" · "+inv.month}>
          <button onClick={()=>setSel(null)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>← Retour</button>
        </PageHeader>
        <div style={{padding:16}}>
          {/* ── EN-TÊTE OFFICIELLE ── */}
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",borderBottom:"2px solid #1A3A5C",paddingBottom:8,marginBottom:6,gap:8}}>

            {/* GAUCHE : Image 1 — serpent + cœur */}
            <div style={{flexShrink:0,width:80}}>
              <img src={IMG_LOGO_CARDIO_B64} alt="Cardiologie"
                style={{width:80,height:100,objectFit:"contain",display:"block"}}/>
            </div>

            {/* CENTRE : Texte hiérarchie officielle */}
            <div style={{flex:1,textAlign:"center",fontSize:9,lineHeight:2,color:"#111",padding:"0 8px"}}>
              <div style={{fontSize:11,fontWeight:"bold"}}>République du Sénégal</div>
              <div>Un peuple - un but - une foi</div>
              <div style={{borderTop:"1px solid #999",margin:"0 40px"}}/>
              <div>Ministère de la Santé et de l'Action Sociale</div>
              <div style={{borderTop:"1px solid #999",margin:"0 40px"}}/>
              <div>Direction Générale des Établissements de Santé</div>
              <div style={{borderTop:"1px solid #999",margin:"0 40px"}}/>
              <div>Direction des Établissements Publics de Santé</div>
              <div style={{borderTop:"1px solid #999",margin:"0 40px"}}/>
              <div style={{fontWeight:"bold"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
              <div style={{borderTop:"1px solid #999",margin:"0 40px"}}/>
            </div>

            {/* DROITE : Image 2 (label) + Image 3 (mosquée) empilées */}
            <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:4,width:70}}>
              <img src={IMG_LABEL_QUALITE_B64} alt="Label Qualité"
                style={{width:65,height:65,objectFit:"contain",display:"block"}}/>
              <img src={IMG_LOGO_CHNCAK_B64} alt="CHNCAK"
                style={{width:65,height:50,objectFit:"contain",display:"block"}}/>
            </div>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#555",marginBottom:8}}>
            <span>Réf : <strong>{inv.reference}</strong></span>
            <span>Date : {new Date().toLocaleDateString("fr-FR")}</span>
          </div>
          <div style={{background:"#1A3A5C",color:"white",textAlign:"center",padding:"5px",fontWeight:700,fontSize:11,letterSpacing:1,marginBottom:8}}>
            LA PHARMACIE — CHNCAK
          </div>
          <div style={{background:"#DCE6F1",color:"#1A3A5C",textAlign:"center",padding:"6px",fontWeight:700,fontSize:11,border:"1.5px solid #1A3A5C",marginBottom:10,borderRadius:2}}>
            SITUATION MENSUELLE DES VENTES — {inv.supplier} ({inv.month})
          </div>

          {/* Tableau produits */}
          <div style={{overflowX:"auto",marginBottom:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr>
                  {["DÉSIGNATION","QUANTITÉS VENDUES","PRIX UNITAIRE (FCFA)","PRIX TOTAL (FCFA)"].map(h=>(
                    <th key={h} style={{background:"#1A3A5C",color:"white",padding:"8px",textAlign:"center",border:"1px solid #999",fontSize:10}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(inv.items||[]).map((it,i)=>(
                  <tr key={i} style={{background:i%2===0?"white":"#f5f5f5"}}>
                    <td style={{padding:"6px 8px",border:"1px solid #ddd"}}>{it.productName}</td>
                    <td style={{padding:"6px 8px",border:"1px solid #ddd",textAlign:"center"}}>{Number(it.qty||0).toLocaleString("fr-FR")}</td>
                    <td style={{padding:"6px 8px",border:"1px solid #ddd",textAlign:"right"}}>{Number(it.unitPrice||0).toLocaleString("fr-FR")}</td>
                    <td style={{padding:"6px 8px",border:"1px solid #ddd",textAlign:"right",fontWeight:600}}>{Number(it.total||0).toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
                <tr style={{background:"#DCE6F1"}}>
                  <td colSpan={3} style={{padding:"8px",border:"1px solid #1A3A5C",fontWeight:800,color:"#1A3A5C",textAlign:"center"}}>MONTANT TOTAL (FCFA)</td>
                  <td style={{padding:"8px",border:"1px solid #1A3A5C",fontWeight:800,color:"#1A3A5C",textAlign:"right",fontSize:13}}>{Number(inv.total||0).toLocaleString("fr-FR")}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{fontSize:10,fontStyle:"italic",color:"#333",marginBottom:16}}>Montant en lettres : {numberToWords(inv.total||0)} francs CFA</div>

          {/* Signatures — noms soulignés + espace pour cachet */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:16,marginTop:8}}>
            {[
              ["Le Chef de service de la Pharmacie CHNCAK","Le SAF CHNCAK"],
              ["Le Comptable Matière Principal CHNCAK","Le Contrôleur de Gestion CHNCAK"],
            ].map(([l,r],i)=>(
              <div key={i} style={{display:"contents"}}>
                <div style={{textAlign:"center",padding:"0 8px"}}>
                  <div style={{fontWeight:700,fontSize:9,color:"#1A3A5C",textDecoration:"underline",marginBottom:60}}>{l}</div>
                </div>
                <div style={{textAlign:"center",padding:"0 8px"}}>
                  <div style={{fontWeight:700,fontSize:9,color:"#1A3A5C",textDecoration:"underline",marginBottom:60}}>{r}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",maxWidth:"50%",margin:"0 auto",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:9,color:"#1A3A5C",textDecoration:"underline",marginBottom:60}}>La Directrice CHNCAK</div>
          </div>

          {/* Statut + Boutons */}
          <div style={{display:"flex",gap:6,marginTop:16,flexWrap:"wrap",justifyContent:"center"}}>
            {can(currentUser,"factures","w")&&(!inv.status||inv.status==="en attente")&&(
              <button onClick={()=>{store.updateInvoice(inv.id,{status:"envoyée"});setSel(p=>({...p,status:"envoyée"}));}}
                style={{...btn(),background:"#dcfce7",color:"#059669",border:"1px solid #86efac",fontSize:12}}>✅ Marquer envoyée</button>
            )}
            {can(currentUser,"factures","w")&&inv.status==="envoyée"&&(
              <button onClick={()=>{store.updateInvoice(inv.id,{status:"payée"});setSel(p=>({...p,status:"payée"}));}}
                style={{...btn(),background:"#ede9fe",color:"#7c3aed",border:"1px solid #c4b5fd",fontSize:12}}>💰 Marquer payée</button>
            )}
            <button onClick={()=>downloadSituationExcel(inv)} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ Excel</button>
            <button onClick={()=>downloadSituationPDF(inv)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer/PDF</button>
            {can(currentUser,"factures","d")&&(
              <button onClick={()=>{store.deleteInvoice(inv.id);setSel(null);}} style={{...btn(),background:"#fee2e2",color:"#ef4444",border:"1px solid #fca5a5",fontSize:12}}>🗑️ Supprimer</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const exportAllXLS=()=>{
    const rows=invoices.flatMap(inv=>(inv.items||[]).map(it=>[inv.reference,inv.month,inv.supplier,it.productName,it.qty,Number(it.unitPrice||0),Number(it.total||0),Number(inv.total||0)]));
    downloadExcel("factures_"+Date.now()+".xlsx",rows,["Référence","Période","Fournisseur","Produit","Qté","Prix unit. FCFA","Total ligne FCFA","Total facture FCFA"]);
  };

  return(
    <div style={{padding:16}}>
      <PageHeader pageId="factures" title="📊 Situations"
        subtitle={activeSupplier?.name || "Tous fournisseurs"}>
        {invoices.length>0&&<button onClick={exportAllXLS} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>⬇️ Excel</button>}
      </PageHeader>
      {invoices.length===0
        ?<div style={{...card,textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:10}}>📭</div><div style={{color:"#94a3b8"}}>Aucune facture. Effectuez un inventaire pour en générer.</div></div>
        :<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {invoices.map(inv=>(
            <div key={inv.id} onClick={()=>setSel(inv)} style={{...card,cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:28}}>📊</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{inv.reference}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{inv.supplier} · {inv.month}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800,color:"#0891b2",fontSize:15}}>{Number(inv.total||0).toLocaleString("fr-FR")} FCFA</div>
                <Badge color={inv.status==="envoyée"?"#059669":inv.status==="payée"?"#7c3aed":"#f59e0b"}>{inv.status||"en attente"}</Badge>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
