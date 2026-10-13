// Recherche dans la documentation « Formation en comptabilité des matières ».
// Partagé par la page Documentation (recherche saisie par l'utilisateur) et
// l'Assistant IA (sélection des diapositives utiles à une question, envoyées
// au modèle comme extraits à citer).

// Mots vides : articles, prépositions et mots interrogatifs, ignorés pour
// que « comment faire une sortie provisoire ? » cherche « sortie provisoire ».
export const DOC_STOP = new Set(("de la le les des du d l et a au aux en un une pour par sur dans ou que qui est "
  + "ce cet cette ces se sa son ses leur leurs il elle ils elles on nous vous je j me m te t y "
  + "comment quel quelle quels quelles quoi quand pourquoi combien ou est-ce qu c ca cela "
  + "faut faire fait peut peuvent doit doivent dois sont etre avoir ai as avons ont mon ma mes "
  + "pas ne plus tres bien aussi alors donc avec sans entre lorsque si cas lors partie").split(" "));

// Minuscules, sans accents, apostrophes unifiées, nombres sans séparateurs
// (« 300.000 », « 300 000 » et « 300000 » se retrouvent).
export function docNorm(s){
  return String(s||"")
    .replace(/œ/gi,"oe").replace(/æ/gi,"ae")
    .normalize("NFD").replace(/[̀-ͯ]/g,"")
    .toLowerCase()
    .replace(/[’‘`´]/g,"'")
    .replace(/(\d)[.\s  ](?=\d{3}(?!\d))/g,"$1");
}

export function docTerms(q){
  return docNorm(q).split(/[^a-z0-9]+/).filter(w=>w.length>1 && !DOC_STOP.has(w));
}

// Racine grossière : retire le pluriel pour que « sorties » trouve « sortie ».
const stem = w => (w.length>4 && /[sx]$/.test(w)) ? w.slice(0,-1) : w;

// Rubrique la plus précise du sommaire contenant la diapositive n.
export function docPathOf(toc, n){
  const path=[];
  (toc||[]).forEach(e=>{ if(n>=e.from && n<=e.to){ path[e.level]=e.title; path.length=e.level+1; } });
  return path.filter(Boolean);
}

// mode "all" : tous les mots doivent apparaître (recherche de la page).
// mode "any" : classement par pertinence, au moins un mot (questions à l'IA).
export function searchDocSlides(doc, query, { mode="all", limit=60, normSlides } = {}){
  const ts = docTerms(query).map(stem);
  if(!doc || !ts.length) return { terms:ts, slides:[] };
  const NS = normSlides || doc.DOC_SLIDES.map(docNorm);
  // Poids d'un mot = sa rareté dans le document (un mot présent partout,
  // comme « matière », compte moins qu'un mot précis comme « perte »).
  const N = NS.length;
  const idf = {};
  ts.forEach(w=>{ const df = NS.reduce((c,t)=>c+(t.includes(w)?1:0),0); idf[w] = Math.log((N+1)/(df+1))+0.2; });
  const out=[];
  NS.forEach((t,i)=>{
    const n=i+1;
    if(n===1) return;
    const head = docNorm(docPathOf(doc.DOC_TOC,n).join(" "));
    const hits = ts.filter(w=>t.includes(w) || head.includes(w));
    if(mode==="all" ? hits.length<ts.length : hits.length===0) return;
    let score = 0;
    hits.forEach(w=>{
      const c = t.split(w).length-1;
      score += idf[w] * (2 + Math.min(4,c)*0.5 + (head.includes(w)?1.5:0));
    });
    if(n<=8) score*=0.4;                             // le plan cite tout : classé après le contenu
    out.push({ n, score, hits:hits.length });
  });
  out.sort((a,b)=>b.score-a.score || a.n-b.n);
  return { terms:ts, slides:out.slice(0,limit) };
}

// Chargement paresseux et unique du texte de la documentation.
let _docPromise=null;
export function loadDoc(){
  if(!_docPromise) _docPromise = import("../data/docComptaMatieres.js").catch(e=>{ _docPromise=null; throw e; });
  return _docPromise;
}

// Ouvre la page Documentation directement sur une diapositive (utilisé par
// les références cliquables de l'Assistant IA).
export function openDocSlide(n, onNav){
  try{ window.__pharmaDocSlide = Number(n); }catch{}
  try{ window.dispatchEvent(new CustomEvent("pharma-open-doc",{ detail:Number(n) })); }catch{}
  if(onNav) onNav("documentation-compta");
}
