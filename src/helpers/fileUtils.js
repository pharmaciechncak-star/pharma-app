import * as XLSX from "xlsx";

export async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result, { type: "array" });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(raw);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Convertit une URL d'asset (ex: import Vite "/assets/img-xxx.jpeg") en data URI base64.
// Nécessaire pour les documents imprimés ouverts dans une fenêtre/onglet séparé (via Blob URL) :
// ce contexte ne résout pas toujours les chemins de build de l'app, contrairement à une image
// auto-suffisante en base64. Le résultat n'est jamais stocké dans le code source — uniquement
// généré à la volée au moment de l'impression.
export async function imageUrlToDataURL(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
