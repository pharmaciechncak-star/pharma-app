// Calculs de l'existant comptable (Comptabilité Matières), partagés par la
// Clôture de gestion et le Compte de gestion.
//
// Existant comptable à une date D (équation de l'Instruction générale, art. 1) :
//   entrées (≤ D) − sorties définitives (≤ D) − retours fournisseur (≤ D)
// Les sorties provisoires n'affectent pas l'existant : elles sont suivies à
// part (« en sortie provisoire »). La balance d'entrée (BE n°1) reprend
// l'existant de la gestion précédente : elle n'est pas recomptée comme entrée.

export const dayOfTs = ts => ts?.seconds ? new Date(ts.seconds*1000).toISOString().slice(0,10) : "";
export const entreeDate = e => e.date || dayOfTs(e.createdAt);
export const retourDate = r => r.date || dayOfTs(r.createdAt);
export const isBalanceEntree = e => e?.typeEntree === "balance";
// Date comptable d'une sortie : date d'opération si renseignée (régularisation
// de clôture datée à l'arrêté), sinon date d'enregistrement.
export const sortieDate = s => s.dateOperation || dayOfTs(s.createdAt);

// Sortie provisoire encore dehors à la date D.
export function provOutstandingAt(s, D){
  if (s.status==="annule" || s.nature!=="provisoire") return false;
  const d = sortieDate(s);
  if (D && d > D) return false;
  if (s.status==="retournee") { const r = dayOfTs(s.returnedAt); return !!(D && r && r > D); }
  return true;
}

// Agrégat par produit entre deux dates (incluses). from vide = depuis toujours.
export function computeByProduct({ entrees, sorties, retours }, { from="", to="" } = {}){
  const agg = {};
  const T = pid => (agg[pid] ||= { avantE:0, avantS:0, entrees:0, sortiesDef:0, retours:0, enSortieProv:0 });
  const inPeriod = d => (!from || d>=from) && (!to || d<=to);
  const before = d => from && d<from;
  (entrees||[]).forEach(e=>{
    if (e.status==="annule" || isBalanceEntree(e)) return;
    const d = entreeDate(e);
    if (to && d>to) return;
    (e.items||[]).forEach(it=>{ const q=Number(it.qty)||0; if (before(d)) T(it.productId).avantE+=q; else if (inPeriod(d)) T(it.productId).entrees+=q; });
  });
  (sorties||[]).forEach(s=>{
    if (s.status==="annule") return;
    if (s.nature==="provisoire") {
      if (provOutstandingAt(s, to||null)) (s.items||[]).forEach(it=>{ T(it.productId).enSortieProv += Number(it.qty)||0; });
      return;
    }
    const d = sortieDate(s);
    if (to && d>to) return;
    (s.items||[]).forEach(it=>{ const q=Number(it.qty)||0; if (before(d)) T(it.productId).avantS+=q; else if (inPeriod(d)) T(it.productId).sortiesDef+=q; });
  });
  (retours||[]).forEach(r=>{
    if (r.status==="annule") return;
    const d = retourDate(r);
    if (to && d>to) return;
    (r.items||[]).forEach(it=>{ const q=Number(it.qty)||0; if (before(d)) T(it.productId).avantS+=q; else if (inPeriod(d)) T(it.productId).retours+=q; });
  });
  return agg;
}

// Lignes complètes (une par produit concerné) pour un état annuel ou une date d'arrêté.
export function existantRows(data, products, { from="", to="" } = {}){
  const agg = computeByProduct(data, { from, to });
  // Matériel remis aux détenteurs (fiches d'inventaire individuel) à la date d'arrêté
  const enService = {};
  (data.affectations||[]).forEach(a=>{
    if (a.status==="annule" || (data.circuit && a.circuit!==data.circuit)) return;
    if (to && a.date && a.date>to) return;
    enService[a.productId] = (enService[a.productId]||0) + (a.type==="reprise"?-1:1)*(Number(a.qty)||0);
  });
  return (products||[])
    .filter(p=>agg[p.id])
    .map(p=>{
      const a = agg[p.id];
      const existantDebut = a.avantE - a.avantS;
      const totalEntrees = existantDebut + a.entrees;
      const existantFin = totalEntrees - a.sortiesDef - a.retours;
      const pu = Number(p.price)||0;
      return {
        productId:p.id, compteNumero:p.compteNumero||"", productName:p.name, unit:p.unit||"", pu,
        existantDebut, entrees:a.entrees, totalEntrees, sortiesDef:a.sortiesDef, retours:a.retours,
        existantFin, enSortieProv:a.enSortieProv, enService:enService[p.id]||0, enMagasin: existantFin - a.enSortieProv - (enService[p.id]||0),
        valeur: existantFin*pu,
      };
    })
    .filter(r=>r.existantDebut||r.entrees||r.sortiesDef||r.retours||r.existantFin)
    .sort((a,b)=> (a.compteNumero||"zz").localeCompare(b.compteNumero||"zz") || a.productName.localeCompare(b.productName));
}
