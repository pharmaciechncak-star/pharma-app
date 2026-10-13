// Nomenclature des matières (Instruction générale n°04, art. 15 — doc. de
// formation diapos 27 à 37). Deux groupes :
//   1 = matières durables (usage de plusieurs années, entretien permanent)
//   2 = matières consomptibles dès le premier usage
// Numéro de compte : compte principal (2 chiffres) . divisionnaire (2) . sous-compte (2),
// ex. 10.01.03. Le 1er chiffre du compte principal donne le groupe.

export const COMPTES_PRINCIPAUX = [
  { code:"10", groupe:"1", label:"Mobilier et matériel de bureau" },
  { code:"11", groupe:"1", label:"Mobilier de logement et appareils électroménagers" },
  { code:"12", groupe:"1", label:"Voitures automobiles" },
  { code:"13", groupe:"1", label:"Motocycles et vélocipèdes" },
  { code:"14", groupe:"1", label:"Machines et matériel d'exploitation" },
  { code:"15", groupe:"1", label:"Installations" },
  { code:"16", groupe:"1", label:"Immobilisations animales" },
  { code:"17", groupe:"1", label:"Matériel informatique" },
  { code:"18", groupe:"1", label:"Autres immobilisations" },
  { code:"20", groupe:"2", label:"Fournitures de bureau" },
  { code:"21", groupe:"2", label:"Combustibles" },
  { code:"22", groupe:"2", label:"Produits d'entretien" },
  { code:"23", groupe:"2", label:"Produits agricoles" },
  { code:"24", groupe:"2", label:"Produits industriels" },
  { code:"25", groupe:"2", label:"Produits de la sylviculture et de l'exploitation forestière" },
  { code:"26", groupe:"2", label:"Produits de la pêche" },
  { code:"27", groupe:"2", label:"Produits de l'élevage" },
  { code:"28", groupe:"2", label:"Produits pharmaceutiques" },
  { code:"29", groupe:"2", label:"Autres produits" },
];

export const GROUPES = [
  { id:"1", label:"Groupe 1 — matières durables" },
  { id:"2", label:"Groupe 2 — matières consomptibles" },
];

// Groupe déduit du n° de compte (1er chiffre), sinon null.
export function groupeFromCompte(compte){
  const m = String(compte||"").trim().match(/^([12])\d/);
  return m ? m[1] : null;
}

// Groupe d'un produit : choisi sur la fiche, sinon déduit du n° de compte.
export function productGroupe(p){
  if (!p) return null;
  if (p.groupe==="1" || p.groupe==="2") return p.groupe;
  return groupeFromCompte(p.compteNumero);
}

export function comptePrincipalOf(compte){
  const code = String(compte||"").trim().slice(0,2);
  return COMPTES_PRINCIPAUX.find(c=>c.code===code) || null;
}

// Contrôle du format : PP, PP.DD ou PP.DD.SS (séparateur point ou espace
// accepté). Les sous-comptes à 3 chiffres déjà utilisés (ex. 28.01.719)
// restent acceptés, avec un simple avertissement.
export function checkCompte(compte){
  const s = String(compte||"").trim();
  if (!s) return { ok:true, warn:"" };
  const norm = s.replace(/\s+/g,".");
  if (!/^\d{2}(\.\d{2,3}){0,3}$/.test(norm)) return { ok:false, warn:"Format attendu : 2 chiffres (compte principal), puis .2 chiffres (divisionnaire), .2 chiffres (sous-compte), éventuellement .n° d'article — ex. 28.01.04" };
  const cp = comptePrincipalOf(norm);
  if (!cp) return { ok:true, warn:"Compte principal "+norm.slice(0,2)+" absent de la nomenclature indicative (10 à 18 pour le groupe 1, 20 à 29 pour le groupe 2)." };
  if (/^\d{2}\.\d{2}\.\d{3}$/.test(norm)) return { ok:true, warn:"Sous-compte à 3 chiffres : la nomenclature indicative prévoit 2 chiffres (01 à 99)." };
  return { ok:true, warn:"" };
}

// ── Arborescence (page Nomenclature) ──
// Niveaux : 1 = compte principal (PP), 2 = divisionnaire (PP.DD),
// 3 = sous-compte (PP.DD.SS). Les articles (produits) portent un n° de compte
// qui prolonge le code du nœud auquel ils sont rattachés (ex. 28.06 → 28.06.01).
export function normCode(s){ return String(s||"").trim().replace(/[\s\-_/]+/g,".").replace(/\.+/g,".").replace(/^\.|\.$/g,""); }
export function codeLevel(code){ const c=normCode(code); return c ? c.split(".").length : 0; }
export function parentCodeOf(code){ const parts=normCode(code).split("."); parts.pop(); return parts.join("."); }
export const NIVEAUX = { 1:"Compte principal", 2:"Compte divisionnaire", 3:"Sous-compte" };

// Prochain code libre sous un parent : parent + "." + n° (largeur min. 2).
export function nextChildCode(parent, existingCodes){
  const p = normCode(parent);
  const kids = (existingCodes||[]).map(normCode).filter(c=>c.startsWith(p+".") && c.split(".").length===p.split(".").length+1);
  const nums = kids.map(c=>c.split(".").pop());
  const width = Math.max(2, ...nums.map(n=>n.length));
  const max = nums.reduce((m,n)=>Math.max(m, Number(n)||0), 0);
  return p + "." + String(max+1).padStart(width,"0");
}

// Nœud de rattachement d'un article : le nœud le plus profond dont le code
// est un préfixe strict de son n° de compte.
export function articleNodeOf(ref, nodeCodes){
  const r = normCode(ref);
  let best = "";
  (nodeCodes||[]).forEach(c=>{ const n=normCode(c); if (r.startsWith(n+".") && n.length>best.length) best=n; });
  return best;
}
