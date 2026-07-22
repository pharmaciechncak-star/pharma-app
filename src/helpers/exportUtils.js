import * as XLSX from "xlsx";

export function downloadCSV(filename, rows, headers) {
  // Point-virgule, pas virgule : en localisation française (celle de l'app,
  // Sénégal/CHNCAK), Excel attend ";" comme séparateur de champs CSV — la
  // virgule y est déjà utilisée comme séparateur décimal, donc un CSV séparé
  // par des virgules s'ouvre en une seule colonne au lieu d'un vrai tableau.
  const escape = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const lines = [headers.map(escape).join(';'), ...rows.map(r=>r.map(escape).join(';'))];
  const blob = new Blob(["\uFEFF"+lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename, rows, headers) {
  try {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(()=>({wch:24}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Données");
    XLSX.writeFile(wb, filename);
  } catch(e) {
    console.error("Excel error:", e);
    downloadCSV(filename.replace(".xlsx",".csv"), rows, headers);
  }
}

export function downloadInvoiceCSV(inv){
  const rows=(inv.items||[]).map(it=>[it.productName,it.qty,Number(it.unitPrice||0),Number(it.total||0)]);
  downloadCSV(inv.reference+".csv",rows,["Produit","Quantité","Prix unit. FCFA","Total FCFA"]);
}

export function numberToWords(n) {
  try {
    n = Math.round(Number(n)||0);
    if(n===0) return "zéro";
    if(n<0) return "moins "+numberToWords(-n);
    const u = ["","un","deux","trois","quatre","cinq","six","sept","huit","neuf",
               "dix","onze","douze","treize","quatorze","quinze","seize",
               "dix-sept","dix-huit","dix-neuf"];
    const d = ["","","vingt","trente","quarante","cinquante","soixante","soixante",
               "quatre-vingt","quatre-vingt"];
    const below100=n=>{
      if(n<20) return u[n]||"";
      const t=Math.floor(n/10), o=n%10;
      if(t===7) return "soixante-"+(o===1?"et-":"")+(o?u[10+o]:"dix");
      if(t===9) return "quatre-vingt-"+(o?u[10+o]:"dix");
      if(t===8) return "quatre-vingts"+(o?"-"+u[o]:"");
      return d[t]+(o?(o===1?"-et-":"-")+u[o]:"");
    };
    const below1000=n=>{
      if(n<100) return below100(n);
      const h=Math.floor(n/100), r=n%100;
      return (h>1?u[h]+"-":"")+"cent"+(h>1&&!r?"s":"")+(r?"-"+below100(r):"");
    };
    const M=Math.floor(n/1000000), K=Math.floor((n%1000000)/1000), R=n%1000;
    let s="";
    if(M) s+=(M===1?"un million":below1000(M)+" millions")+" ";
    if(K) s+=(K===1?"mille":below1000(K)+" mille")+" ";
    if(R||!s) s+=below1000(R||0);
    return s.trim().replace(/\s+/g," ");
  } catch(e){ return String(n); }
}
