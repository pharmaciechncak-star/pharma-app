import { useState, useMemo } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { Modal } from "../ui/Modal";
import { can } from "../../permissions";
import { COMPTES_PRINCIPAUX, normCode, codeLevel, parentCodeOf, nextChildCode, articleNodeOf, productGroupe, NIVEAUX } from "../../helpers/nomenclature";
import { downloadExcelTable } from "../../helpers/exportUtils";
import { downloadPdfTable } from "../../helpers/pdfUtils";
import { PrintModal, NomenclatureListPrint } from "../print/PrintTemplates";
import { ConfirmDelete } from "../ui/Modal";
import { ScanReviewModal } from "../ui/ScanReviewModal";
import { scanDocumentWithAI } from "../../hooks/useAI";
import { getComptaCircuits } from "../../helpers/circuitsConfig";
import { GROUPES } from "../../helpers/nomenclature";

// Nomenclature des matières (Instruction générale art. 15 ; doc. de formation
// diapos 27 à 37) : comptes principaux (PP), comptes divisionnaires (PP.DD)
// et sous-comptes (PP.DD.SS), auxquels sont rattachés les articles
// (produits) par leur n° de compte. Même logique que l'écran « Nomenclatures
// des articles » de FANN : on choisit un compte, puis un sous-compte, et on y
// crée, rattache ou déplace des articles.
// Articles de la comptabilité matières uniquement : la gestion des produits
// du Dépôt Vente reste dans la page Produits.
const COMPTA_KEYS = ["fonctionnement","non_pharmaceutique"];
const isComptaProduct = p => (p.circuits||[]).some(c=>COMPTA_KEYS.includes(c));
const groupeLabel = g => g==="1" ? "Premier" : g==="2" ? "Deuxième" : "—";

export function NomenclaturePage({ store, currentUser }){
  const canW = can(currentUser,"produits","w");
  const canD = can(currentUser,"produits","d");
  const CIRC = getComptaCircuits(store);
  const CIRCUIT_OPTS = COMPTA_KEYS.map(k=>[k, (CIRC[k]?.icon||"")+" "+(CIRC[k]?.label||k)]);
  const role = currentUser?.role||"";
  const defaultCompta = /non_pharma/.test(role) ? "non_pharmaceutique" : "fonctionnement";
  const nodes = useMemo(()=>(store.nomenclature||[]).map(n=>({...n, code:normCode(n.code||n.id)})).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})), [store.nomenclature]);
  const nodeCodes = nodes.map(n=>n.code);
  const allProducts = store.products||[];
  const products = allProducts.filter(isComptaProduct);
  const refOf = p => normCode(p.compteNumero);
  const allCodesAndRefs = [...nodeCodes, ...products.map(refOf).filter(Boolean)];

  const principaux = nodes.filter(n=>codeLevel(n.code)===1);
  const [selP,setSelP] = useState("");
  const [selN,setSelN] = useState(""); // divisionnaire ou sous-compte sélectionné
  const curP = selP || principaux[0]?.code || "";
  const sousNodes = nodes.filter(n=>codeLevel(n.code)>1 && n.code.startsWith(curP+"."));
  const curNode = selN && selN.startsWith(curP+".") ? selN : "";
  const target = curNode || curP; // nœud dont on affiche les articles
  const articles = products.filter(p=>refOf(p) && articleNodeOf(refOf(p), nodeCodes)===target)
    .sort((a,b)=>refOf(a).localeCompare(refOf(b),undefined,{numeric:true}));
  const countUnder = code => products.filter(p=>refOf(p).startsWith(code+".")).length;

  const [msg,setMsg] = useState("");
  const say = m => { setMsg(m); setTimeout(()=>setMsg(""),6000); };
  const [busy,setBusy] = useState(false);
  const [nodeModal,setNodeModal] = useState(null);   // {mode, niveau, parent, code, libelle}
  const [artModal,setArtModal] = useState(null);     // {mode:"create"|"attach", ...}
  const [moveModal,setMoveModal] = useState(null);   // {product, target}
  const [attachSearch,setAttachSearch] = useState("");
  const [search,setSearch] = useState("");
  // Volets repliables (pour élargir le tableau des articles) et vue « liste »
  const [foldP,setFoldP] = useState(false);
  const [foldS,setFoldS] = useState(false);
  const [view,setView] = useState("arbre"); // "arbre" | "liste"
  const [flt,setFlt] = useState({ principal:"", node:"", groupe:"", q:"" });
  const [printList,setPrintList] = useState(false);

  // Codes utilisés par des produits mais sans compte créé (reprise de l'existant)
  const missing = useMemo(()=>{
    const need = new Set();
    products.forEach(p=>{ const r=refOf(p); if(!r) return; const parts=r.split("."); for(let i=1;i<parts.length;i++){ need.add(parts.slice(0,i).join(".")); } });
    return [...need].filter(c=>!nodeCodes.includes(c) && codeLevel(c)<=3 && /^\d{2}/.test(c)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  }, [products, nodeCodes]); // eslint-disable-line

  const importIndicative = async () => {
    setBusy(true);
    try{
      for (const c of COMPTES_PRINCIPAUX) if (!nodeCodes.includes(c.code)) await store.saveNomenclatureNode({ code:c.code, libelle:c.label.toUpperCase(), niveau:1, groupe:c.groupe });
      say("✅ Comptes principaux de la nomenclature indicative créés (10 à 29).");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };
  const createMissing = async () => {
    setBusy(true);
    try{
      for (const c of missing) {
        const cp = COMPTES_PRINCIPAUX.find(x=>x.code===c);
        await store.saveNomenclatureNode({ code:c, libelle: cp ? cp.label.toUpperCase() : "(à compléter)", niveau:codeLevel(c), groupe:c[0]==="1"?"1":c[0]==="2"?"2":"" });
      }
      say("✅ "+missing.length+" compte(s) créé(s) à partir des n° des produits — complétez les libellés « (à compléter) ».");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };

  const openAddNode = (niveau, parent) => setNodeModal({ mode:"add", niveau, parent,
    code: niveau===1 ? "" : nextChildCode(parent, allCodesAndRefs), libelle:"" });
  const saveNode = async () => {
    const m = nodeModal; const code = normCode(m.code);
    if (m.mode==="add") {
      if (m.niveau===1 && !/^\d{2}$/.test(code)) { say("⚠️ Un compte principal a 2 chiffres (ex. 28)."); return; }
      if (m.niveau>1 && !(code.startsWith(normCode(m.parent)+".") && codeLevel(code)===m.niveau)) { say("⚠️ Le code doit prolonger "+m.parent+" (ex. "+nextChildCode(m.parent, allCodesAndRefs)+")."); return; }
      if (nodeCodes.includes(code)) { say("⚠️ Le compte "+code+" existe déjà."); return; }
      if (products.some(p=>refOf(p)===code)) { say("⚠️ "+code+" est déjà le n° d'un article."); return; }
    }
    if (!m.libelle.trim()) { say("⚠️ Libellé obligatoire."); return; }
    setBusy(true);
    try{
      await store.saveNomenclatureNode({ code, libelle:m.libelle.trim().toUpperCase(), niveau:codeLevel(code), groupe:code[0]==="1"?"1":code[0]==="2"?"2":"" });
      if (m.mode==="add") { if (m.niveau===1) { setSelP(code); setSelN(""); } else setSelN(code); }
      setNodeModal(null); say("✅ Compte "+code+" enregistré.");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };
  const deleteNode = async (code) => {
    if (nodeCodes.some(c=>c.startsWith(code+"."))) { say("⚠️ Supprimez d'abord les comptes rattachés à "+code+"."); return; }
    if (countUnder(code)>0) { say("⚠️ "+countUnder(code)+" article(s) sont rattachés à "+code+" : déplacez-les d'abord."); return; }
    setBusy(true);
    try{ await store.deleteNomenclatureNode(code); if (selN===code) setSelN(""); if (selP===code) setSelP(""); say("✅ Compte "+code+" supprimé."); }
    catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };

  const nextArticleRef = node => nextChildCode(node, allCodesAndRefs);
  const openCreateArticle = () => setArtModal({ mode:"create", ref:nextArticleRef(target), name:"", unit:"", price:"", conditionnement:"", circuits:[defaultCompta], supplierId:"" });
  const createArticle = async () => {
    const a = artModal; const ref = normCode(a.ref);
    if (!a.name.trim()) { say("⚠️ Nom de l'article obligatoire."); return; }
    if (!ref.startsWith(target+".")) { say("⚠️ Le n° doit prolonger "+target+"."); return; }
    if (products.some(p=>refOf(p)===ref) || nodeCodes.includes(ref)) { say("⚠️ Le n° "+ref+" est déjà utilisé."); return; }
    setBusy(true);
    try{
      await store.addProduct({ name:a.name.trim(), unit:a.unit||"Unité", price:Number(a.price)||0, conditionnement:a.conditionnement||"", circuits:a.circuits.filter(c=>COMPTA_KEYS.includes(c)).length?a.circuits.filter(c=>COMPTA_KEYS.includes(c)):[defaultCompta],
        supplierId:a.supplierId||"", compteNumero:ref, groupe:"", barcode1:"", barcode2:"", barcode3:"", reorderThreshold:null, typeFonct:"" });
      setArtModal(null); say("✅ Article "+ref+" — "+a.name+" créé.");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };
  const [attachAll,setAttachAll] = useState(false);
  const attachArticle = async (p) => {
    const ref = nextArticleRef(target);
    setBusy(true);
    // Un produit du Dépôt Vente rattaché devient aussi un article comptable (circuit ajouté).
    const circuits = isComptaProduct(p) ? p.circuits : [...new Set([...(p.circuits&&p.circuits.length?p.circuits:["vente"]), defaultCompta])];
    try{ await store.updateProduct(p.id, { name:p.name, compteNumero:ref, circuits }); setArtModal(null); setAttachSearch(""); say("✅ "+p.name+" rattaché à "+target+" (n° "+ref+")."); }
    catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };
  const moveArticle = async () => {
    const { product, target:to } = moveModal;
    if (!to) { say("⚠️ Choisissez le compte de destination."); return; }
    const ref = nextArticleRef(to);
    setBusy(true);
    try{ await store.updateProduct(product.id, { name:product.name, compteNumero:ref }); setMoveModal(null); say("✅ "+product.name+" déplacé : "+(refOf(product)||"—")+" → "+ref+"."); }
    catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };
  // ── Modifier un article (tous les champs de la fiche, côté comptabilité) ──
  const [editArt,setEditArt] = useState(null);
  const openEditArticle = p => setEditArt({ id:p.id, name:p.name||"", unit:p.unit||"", price:String(p.price??""), conditionnement:p.conditionnement||"",
    supplierId:p.supplierId||"", typeFonct:p.typeFonct||"", groupe:p.groupe||"", reorderThreshold:p.reorderThreshold!=null?String(p.reorderThreshold):"",
    barcode1:p.barcode1||"", barcode2:p.barcode2||"", barcode3:p.barcode3||"", circuits:(p.circuits||[]).filter(c=>COMPTA_KEYS.includes(c)), otherCircuits:(p.circuits||[]).filter(c=>!COMPTA_KEYS.includes(c)) });
  const saveEditArticle = async () => {
    const a = editArt;
    if (!a.name.trim()) { say("⚠️ Nom obligatoire."); return; }
    if (!a.circuits.length) { say("⚠️ Choisissez au moins un circuit de la comptabilité."); return; }
    setBusy(true);
    try{
      await store.updateProduct(a.id, { name:a.name.trim(), unit:a.unit||"Unité", price:Number(a.price)||0, conditionnement:a.conditionnement||"", supplierId:a.supplierId||"",
        typeFonct:a.typeFonct||"", groupe:a.groupe||"", reorderThreshold:a.reorderThreshold===""?null:Number(a.reorderThreshold),
        barcode1:a.barcode1.trim(), barcode2:a.barcode2.trim(), barcode3:a.barcode3.trim(), circuits:[...new Set([...a.circuits, ...a.otherCircuits])] });
      setEditArt(null); say("✅ Article modifié.");
    }catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };
  // Suppression : seulement si l'article n'apparaît dans aucun bon comptable.
  const [delArt,setDelArt] = useState(null);
  const usedIn = p => ["entreesFonct","entreesNp","sortiesFonct","sortiesNp","retoursFonct","retoursNp"].some(k=>(store[k]||[]).some(d=>(d.items||[]).some(i=>i.productId===p.id)));
  const askDelete = p => { if (usedIn(p)) { say("⚠️ "+p.name+" figure dans des bons : il ne peut pas être supprimé (retirez-le seulement de la nomenclature)."); return; } setDelArt(p); };

  // ── Import (Excel, PDF, photo) dans le compte sélectionné ──
  const importRef = { current:null };
  const [scanState,setScanState] = useState({ msg:"", result:null, open:false });
  const [importCircuit,setImportCircuit] = useState(defaultCompta);
  const handleImportFile = async file => {
    if (!file) return;
    setScanState({ msg:"⏳ Analyse du document…", result:null, open:false });
    try{
      const res = await scanDocumentWithAI(file, products);
      if (!res.success || !res.items?.length) { setScanState({ msg:"⚠️ "+(res.error||"Aucun article détecté."), result:null, open:false }); return; }
      setScanState({ msg:"", result:res, open:true });
    }catch(e){ setScanState({ msg:"❌ "+e.message, result:null, open:false }); }
  };
  const confirmImport = async rows => {
    setScanState(s=>({...s, open:false, msg:"⏳ Import en cours…"}));
    let added=0, skipped=0; const used=[...allCodesAndRefs];
    for (const row of rows) {
      if (!row.isNew || !row.productName?.trim()) { skipped++; continue; }
      const ref = nextChildCode(target, used); used.push(ref);
      await store.addProduct({ name:row.productName.trim(), price:Number(row.unitPrice||0), unit:row.unit||"Unité", supplierId:"", circuits:[importCircuit],
        compteNumero:ref, groupe:"", conditionnement:"", typeFonct:"", barcode1:"", barcode2:"", barcode3:"", reorderThreshold:null });
      added++;
    }
    setScanState({ msg:[added?"✅ "+added+" article(s) créé(s) dans "+target:"", skipped?"ℹ️ "+skipped+" déjà existant(s), ignoré(s)":""].filter(Boolean).join(" · ")||"ℹ️ Aucun article ajouté.", result:null, open:false });
  };

  const detachArticle = async (p) => {
    setBusy(true);
    try{ await store.updateProduct(p.id, { name:p.name, compteNumero:"" }); say("✅ "+p.name+" retiré de la nomenclature (sans n° de compte)."); }
    catch(e){ say("❌ "+e.message); }
    setBusy(false);
  };

  const exportExcel = () => {
    const rows = [];
    nodes.forEach(n=>{
      rows.push([n.code, NIVEAUX[codeLevel(n.code)]||"", n.libelle||"", groupeLabel(n.code[0]==="1"?"1":n.code[0]==="2"?"2":""), "", ""]);
      products.filter(p=>refOf(p) && articleNodeOf(refOf(p),nodeCodes)===n.code).sort((a,b)=>refOf(a).localeCompare(refOf(b),undefined,{numeric:true}))
        .forEach(p=>rows.push([refOf(p),"Article",p.name,groupeLabel(productGroupe(p)),p.unit||"",p.conditionnement||""]));
    });
    downloadExcelTable({ filename:"nomenclature_des_matieres", title:"NOMENCLATURE DES MATIÈRES", subtitle:"Comptes, sous-comptes et articles", headers:["Code / Réf.","Niveau","Libellé / Nom","Groupe","Unité","Spécification"], rows });
  };

  // Recherche globale (article ou compte) → ouvre le bon nœud
  const searchResults = search.trim().length>=2 ? [
    ...nodes.filter(n=>(n.code+" "+(n.libelle||"")).toLowerCase().includes(search.toLowerCase())).slice(0,8).map(n=>({kind:"node",n})),
    ...products.filter(p=>refOf(p) && (refOf(p)+" "+p.name).toLowerCase().includes(search.toLowerCase())).slice(0,12).map(p=>({kind:"art",p})),
  ] : [];
  const goTo = code => { const p = code.split(".")[0]; setSelP(p); setSelN(codeLevel(code)>1?code:""); setSearch(""); };

  // ── Vue « Liste des articles » : filtres par compte principal, compte
  // divisionnaire / sous-compte, groupe, texte ; impression et téléchargement.
  const fltNodes = flt.principal && flt.principal!=="__none" ? nodes.filter(n=>codeLevel(n.code)>1 && n.code.startsWith(flt.principal+".")) : [];
  const listRows = useMemo(()=>{
    const q = flt.q.trim().toLowerCase();
    return products.filter(p=>{
      const r = refOf(p);
      if (flt.principal==="__none") { if (r) return false; }
      else if (flt.principal && !(r===flt.principal || r.startsWith(flt.principal+"."))) return false;
      if (flt.node && !r.startsWith(flt.node+".")) return false;
      if (flt.groupe && productGroupe(p)!==flt.groupe) return false;
      if (q && !(r+" "+p.name+" "+(p.conditionnement||"")).toLowerCase().includes(q)) return false;
      return true;
    }).map(p=>{
      const r = refOf(p); const nodeC = r ? articleNodeOf(r,nodeCodes) : "";
      const node = nodes.find(n=>n.code===nodeC);
      const princ = nodes.find(n=>n.code===(r||"").split(".")[0]);
      return { id:p.id, ref:r, name:p.name, unit:p.unit||"", spec:p.conditionnement||"Néant", groupe:groupeLabel(productGroupe(p)),
        compte:nodeC, compteLib:node?.libelle||"", principal:princ?.code||"", principalLib:princ?.libelle||"" };
    }).sort((a,b)=>(a.ref||"zzz").localeCompare(b.ref||"zzz",undefined,{numeric:true}) || a.name.localeCompare(b.name));
  }, [products, flt, nodes]); // eslint-disable-line
  const fltLabel = [
    flt.principal==="__none" ? "Articles sans n° de compte" : flt.principal ? "Compte "+flt.principal+" — "+(nodes.find(n=>n.code===flt.principal)?.libelle||"") : "Tous les comptes",
    flt.node ? "Sous-compte "+flt.node+" — "+(nodes.find(n=>n.code===flt.node)?.libelle||"") : "",
    flt.groupe ? (flt.groupe==="1"?"Groupe 1 (matières durables)":"Groupe 2 (matières consomptibles)") : "",
    flt.q.trim() ? "Recherche : « "+flt.q.trim()+" »" : "",
  ].filter(Boolean).join(" · ");
  const LIST_HEADERS = ["Réf.","Désignation de l'article","Unité","Spécification","Groupe","Compte de rattachement"];
  const listData = () => listRows.map(r=>[r.ref||"—", r.name, r.unit, r.spec, r.groupe, r.compte?(r.compte+" — "+r.compteLib):"—"]);
  const exportListExcel = () => downloadExcelTable({ filename:"nomenclature_articles", title:"NOMENCLATURE — LISTE DES ARTICLES", subtitle:fltLabel+" — "+listRows.length+" article(s)", headers:LIST_HEADERS, rows:listData() });
  const exportListPdf = () => downloadPdfTable({ filename:"nomenclature_articles", title:"NOMENCLATURE — LISTE DES ARTICLES", subtitle:fltLabel+" — "+listRows.length+" article(s)", headers:LIST_HEADERS, rows:listData() });

  const panel = { ...card, padding:0, overflow:"hidden", display:"flex", flexDirection:"column", minWidth:260 };
  const foldedBar = (title, onOpen) => (
    <div onClick={onOpen} title={"Déplier : "+title} style={{...card,padding:0,width:42,minWidth:42,flex:"0 0 42px",cursor:"pointer",background:"#065f46",color:"white",display:"flex",flexDirection:"column",alignItems:"center",gap:8,paddingTop:10,minHeight:200}}>
      <span style={{fontSize:13}}>▶</span>
      <span style={{writingMode:"vertical-rl",transform:"rotate(180deg)",fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>{title}</span>
    </div>
  );
  const foldBtn = (onFold) => <button onClick={onFold} title="Replier ce tableau" style={{...btn(),background:"rgba(255,255,255,0.18)",color:"white",fontSize:11,padding:"2px 7px",border:"none"}}>◀</button>;
  const head = (title, right) => (
    <div style={{background:"#065f46",color:"white",padding:"8px 12px",fontWeight:800,fontSize:12.5,display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
      <span>{title}</span>{right}
    </div>
  );
  const smallBtn = (bg,c) => ({...btn(),background:bg,color:c,fontSize:11,padding:"3px 8px",border:"none"});
  const row = (active) => ({display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",fontSize:12,background:active?"#dcfce7":"white"});
  const principalLib = principaux.find(n=>n.code===curP)?.libelle||"";
  const targetLib = nodes.find(n=>n.code===target)?.libelle||"";

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="nomenclature" title="🗂️ Nomenclature des matières" subtitle="Comptes principaux, comptes divisionnaires, sous-comptes et articles">
        <button onClick={exportExcel} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>⬇️ Excel</button>
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{...card,marginBottom:12,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",position:"relative"}}>
          <div style={{flex:1,minWidth:240,position:"relative"}}>
            <input style={input} placeholder="🔍 Rechercher un compte ou un article (code, nom)…" value={search} onChange={e=>setSearch(e.target.value)}/>
            {searchResults.length>0&&(
              <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:20,maxHeight:280,overflowY:"auto",boxShadow:"0 6px 18px rgba(0,0,0,.12)"}}>
                {searchResults.map((r,i)=> r.kind==="node"
                  ? <div key={"n"+i} onClick={()=>goTo(r.n.code)} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #f1f5f9"}}>📁 <b>{r.n.code}</b> {r.n.libelle}</div>
                  : <div key={"a"+i} onClick={()=>goTo(articleNodeOf(refOf(r.p),nodeCodes)||refOf(r.p).split(".")[0])} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #f1f5f9"}}>📄 <b>{refOf(r.p)}</b> {r.p.name}</div>)}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:0,border:"1px solid #bbf7d0",borderRadius:8,overflow:"hidden"}}>
            {[["arbre","🗂️ Arborescence"],["liste","📋 Liste des articles"]].map(([v,lb])=>(
              <button key={v} onClick={()=>setView(v)} style={{...btn(),borderRadius:0,fontSize:12,background:view===v?"#065f46":"white",color:view===v?"white":"#065f46",border:"none"}}>{lb}</button>
            ))}
          </div>
          {canW&&principaux.length===0&&<button disabled={busy} style={{...btn(),background:"#065f46",color:"white",fontSize:12}} onClick={importIndicative}>📥 Créer les comptes principaux de la nomenclature indicative (10 à 29)</button>}
          {canW&&missing.length>0&&<button disabled={busy} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}} onClick={createMissing} title={missing.join(", ")}>🧩 Créer les {missing.length} compte(s) utilisés par les produits mais absents</button>}
        </div>

        {scanState.msg&&<Alert type={scanState.msg.startsWith("✅")?"success":"warn"}>{scanState.msg}</Alert>}
        {view==="arbre"&&canW&&target&&<div style={{fontSize:11.5,color:"#475569",marginBottom:6,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          Circuit des articles importés :
          <select style={{...input,width:"auto",padding:"3px 8px",fontSize:11.5}} value={importCircuit} onChange={e=>setImportCircuit(e.target.value)}>
            {CIRCUIT_OPTS.map(([k,lb])=><option key={k} value={k}>{lb}</option>)}
          </select>
        </div>}
        {view==="arbre"&&<div style={{display:"flex",gap:12,alignItems:"stretch",flexWrap:"wrap"}}>
          {/* Comptes principaux */}
          {foldP ? foldedBar("Comptes principaux"+(curP?" — "+curP:""), ()=>setFoldP(false)) :
          <div style={{...panel,flex:"1 1 280px",maxWidth:420}}>
            {head("Comptes principaux", <span style={{display:"flex",gap:4}}>{canW&&<button style={smallBtn("white","#065f46")} onClick={()=>openAddNode(1,"")}>+ Compte</button>}{foldBtn(()=>setFoldP(true))}</span>)}
            <div style={{maxHeight:520,overflowY:"auto"}}>
              {principaux.length===0&&<div style={{padding:12,fontSize:12,color:"#94a3b8"}}>Aucun compte. Créez-en un, ou importez la nomenclature indicative.</div>}
              {principaux.map(n=>(
                <div key={n.code} onClick={()=>{setSelP(n.code);setSelN("");}} style={row(n.code===curP)}>
                  <b style={{width:30}}>{n.code}</b>
                  <span style={{flex:1}}>{n.libelle}</span>
                  <span style={{fontSize:10,color:"#64748b"}}>G{n.code[0]}</span>
                  {canW&&<span onClick={e=>{e.stopPropagation();setNodeModal({mode:"edit",niveau:1,code:n.code,libelle:n.libelle||""});}} title="Modifier le libellé">✏️</span>}
                </div>
              ))}
            </div>
          </div>}

          {/* Divisionnaires et sous-comptes */}
          {foldS ? foldedBar("Sous-comptes"+(curNode?" — "+curNode:curP?" de "+curP:""), ()=>setFoldS(false)) :
          <div style={{...panel,flex:"1 1 300px",maxWidth:460}}>
            {head(curP?`Sous-comptes de ${curP} — ${principalLib}`:"Sous-comptes", <span style={{display:"flex",gap:4}}>{canW&&curP&&<button style={smallBtn("white","#065f46")} onClick={()=>openAddNode(2,curP)}>+ Divisionnaire</button>}{foldBtn(()=>setFoldS(true))}</span>)}
            <div style={{maxHeight:520,overflowY:"auto"}}>
              {curP&&<div onClick={()=>setSelN("")} style={{...row(!curNode),fontStyle:"italic",color:"#475569"}}>Articles rattachés directement à {curP}</div>}
              {sousNodes.length===0&&curP&&<div style={{padding:12,fontSize:12,color:"#94a3b8"}}>Aucun compte divisionnaire.</div>}
              {sousNodes.map(n=>{ const lvl=codeLevel(n.code); return (
                <div key={n.code} onClick={()=>setSelN(n.code)} style={{...row(n.code===curNode),paddingLeft:lvl===3?28:10}}>
                  <b style={{width:lvl===3?70:48}}>{n.code}</b>
                  <span style={{flex:1}}>{n.libelle}</span>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{countUnder(n.code)}</span>
                  {canW&&lvl===2&&<span onClick={e=>{e.stopPropagation();openAddNode(3,n.code);}} title="Ajouter un sous-compte">➕</span>}
                  {canW&&<span onClick={e=>{e.stopPropagation();setNodeModal({mode:"edit",niveau:lvl,code:n.code,libelle:n.libelle||""});}} title="Modifier le libellé">✏️</span>}
                  {canW&&<span onClick={e=>{e.stopPropagation();deleteNode(n.code);}} title="Supprimer (si vide)">🗑️</span>}
                </div>
              ); })}
            </div>
          </div>}

          {/* Articles */}
          <div style={{...panel,flex:"3 1 380px"}}>
            {head(target?`Articles — ${target} ${targetLib}`:"Articles", canW&&target&&<span style={{display:"flex",gap:4}}>
              <button style={smallBtn("white","#065f46")} onClick={openCreateArticle}>+ Créer</button>
              <button style={smallBtn("#d1fae5","#065f46")} onClick={()=>{setArtModal({mode:"attach"});setAttachSearch("");}}>⤵ Rattacher</button>
              <label style={{...smallBtn("#ecfeff","#0e7490"),cursor:"pointer"}} title="Importer des articles (Excel, PDF, photo) dans ce compte">📄 Importer
                <input type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{ handleImportFile(e.target.files?.[0]); e.target.value=""; }}/>
              </label>
            </span>)}
            <div style={{maxHeight:520,overflow:"auto"}}>
              {articles.length===0&&<div style={{padding:12,fontSize:12,color:"#94a3b8"}}>{target?"Aucun article rattaché à "+target+".":"Choisissez un compte."}</div>}
              {articles.length>0&&(
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
                  <thead><tr>{["Réf.","Nom","Unité","Spécif.","Groupe",""].map(h=><th key={h} style={{background:"#f1f5f9",padding:"5px 6px",borderBottom:"1px solid #e2e8f0",textAlign:"left",position:"sticky",top:0}}>{h}</th>)}</tr></thead>
                  <tbody>{articles.map(p=>(
                    <tr key={p.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                      <td style={{padding:"5px 6px",fontWeight:700,whiteSpace:"nowrap"}}>{refOf(p)}</td>
                      <td style={{padding:"5px 6px"}}>{p.name}</td>
                      <td style={{padding:"5px 6px"}}>{p.unit||""}</td>
                      <td style={{padding:"5px 6px"}}>{p.conditionnement||"Néant"}</td>
                      <td style={{padding:"5px 6px"}}>{groupeLabel(productGroupe(p))}</td>
                      <td style={{padding:"3px 6px",whiteSpace:"nowrap"}}>{canW&&<>
                        <span style={{cursor:"pointer",marginRight:6}} title="Modifier l'article" onClick={()=>openEditArticle(p)}>✏️</span>
                        <span style={{cursor:"pointer",marginRight:6}} title="Déplacer vers un autre compte" onClick={()=>setMoveModal({product:p,target:""})}>↔️</span>
                        <span style={{cursor:"pointer",marginRight:6}} title="Retirer de la nomenclature (garder l'article sans n°)" onClick={()=>detachArticle(p)}>✕</span>
                        {canD&&<span style={{cursor:"pointer"}} title="Supprimer l'article" onClick={()=>askDelete(p)}>🗑️</span>}
                      </>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>}

        {view==="liste"&&(
          <div style={{...card,padding:0,overflow:"hidden"}}>
            <div style={{background:"#065f46",color:"white",padding:"8px 12px",fontWeight:800,fontSize:12.5}}>📋 Liste des articles — {listRows.length} article(s)</div>
            <div style={{padding:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,borderBottom:"1px solid #e2e8f0"}}>
              <div><label style={label}>Compte principal</label>
                <select style={input} value={flt.principal} onChange={e=>setFlt(f=>({...f,principal:e.target.value,node:""}))}>
                  <option value="">— Tous —</option>
                  {principaux.map(n=><option key={n.code} value={n.code}>{n.code} — {n.libelle}</option>)}
                  <option value="__none">Articles sans n° de compte</option>
                </select>
              </div>
              <div><label style={label}>Compte divisionnaire / sous-compte</label>
                <select style={input} value={flt.node} disabled={!fltNodes.length} onChange={e=>setFlt(f=>({...f,node:e.target.value}))}>
                  <option value="">— Tous —</option>
                  {fltNodes.map(n=><option key={n.code} value={n.code}>{"\u00a0".repeat((codeLevel(n.code)-2)*4)}{n.code} — {n.libelle}</option>)}
                </select>
              </div>
              <div><label style={label}>Groupe</label>
                <select style={input} value={flt.groupe} onChange={e=>setFlt(f=>({...f,groupe:e.target.value}))}>
                  <option value="">— Tous —</option>
                  <option value="1">Groupe 1 — matières durables</option>
                  <option value="2">Groupe 2 — matières consomptibles</option>
                </select>
              </div>
              <div><label style={label}>Recherche</label><input style={input} value={flt.q} onChange={e=>setFlt(f=>({...f,q:e.target.value}))} placeholder="Nom, réf., spécification…"/></div>
            </div>
            <div style={{padding:"8px 12px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",borderBottom:"1px solid #e2e8f0"}}>
              <span style={{fontSize:11.5,color:"#475569",flex:1}}>{fltLabel}</span>
              <button style={{...btn(),background:"#0891b2",color:"white",fontSize:12}} onClick={()=>setPrintList(true)} disabled={!listRows.length}>🖨️ Imprimer</button>
              <button style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:12}} onClick={exportListExcel} disabled={!listRows.length}>⬇️ Excel</button>
              <button style={{...btn(),background:"#fef3c7",color:"#92400e",fontSize:12}} onClick={exportListPdf} disabled={!listRows.length}>📄 PDF</button>
              {(flt.principal||flt.node||flt.groupe||flt.q)&&<button style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:12}} onClick={()=>setFlt({principal:"",node:"",groupe:"",q:""})}>✕ Effacer les filtres</button>}
            </div>
            <div style={{maxHeight:600,overflow:"auto"}}>
              {listRows.length===0?<div style={{padding:14,fontSize:12,color:"#94a3b8"}}>Aucun article ne correspond.</div>:(
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>{LIST_HEADERS.map(h=><th key={h} style={{background:"#f1f5f9",padding:"6px 8px",borderBottom:"1px solid #e2e8f0",textAlign:"left",position:"sticky",top:0}}>{h}</th>)}</tr></thead>
                  <tbody>{listRows.map(r=>(
                    <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",cursor:r.compte?"pointer":"default"}} onClick={()=>{ if(r.compte){ goTo(r.compte); setView("arbre"); } }} title={r.compte?"Ouvrir dans l'arborescence":""}>
                      <td style={{padding:"5px 8px",fontWeight:700,whiteSpace:"nowrap"}}>{r.ref||"—"}</td>
                      <td style={{padding:"5px 8px"}}>{r.name}</td>
                      <td style={{padding:"5px 8px"}}>{r.unit}</td>
                      <td style={{padding:"5px 8px"}}>{r.spec}</td>
                      <td style={{padding:"5px 8px"}}>{r.groupe}</td>
                      <td style={{padding:"5px 8px",color:"#475569"}}>{r.compte?r.compte+" — "+r.compteLib:"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
        <div style={{fontSize:11,color:"#94a3b8",marginTop:10}}>Le n° d'un article prolonge le code du compte auquel il est rattaché (ex. 28.06 → 28.06.01). Déplacer un article lui attribue un nouveau n° ; les bons déjà enregistrés restent liés au même produit. Groupe : 1er chiffre du compte (1 = matières durables, 2 = consommables).</div>
      </div>

      <Modal open={!!nodeModal} onClose={()=>setNodeModal(null)} title={nodeModal?.mode==="edit"?"✏️ Modifier le compte "+nodeModal?.code:"➕ "+(NIVEAUX[nodeModal?.niveau]||"Compte")}>
        {nodeModal&&(
          <div>
            {nodeModal.parent&&<div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Rattaché à : <b>{nodeModal.parent}</b> {nodes.find(n=>n.code===nodeModal.parent)?.libelle||""}</div>}
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:8,marginBottom:12}}>
              <div><label style={label}>Code</label><input style={input} value={nodeModal.code} disabled={nodeModal.mode==="edit"} onChange={e=>setNodeModal(m=>({...m,code:e.target.value}))} placeholder={nodeModal.niveau===1?"ex. 28":""}/></div>
              <div><label style={label}>Libellé</label><input style={input} value={nodeModal.libelle} onChange={e=>setNodeModal(m=>({...m,libelle:e.target.value}))} placeholder="ex. PRODUITS DESTINÉS À LA RADIOLOGIE"/></div>
            </div>
            {nodeModal.niveau===1&&nodeModal.mode==="add"&&<div style={{fontSize:11,color:"#64748b",marginBottom:10}}>10 à 18 : matières du 1er groupe (durables) · 20 à 29 : matières du 2e groupe (consommables).</div>}
            <button disabled={busy} onClick={saveNode} style={{...btn(),background:"#065f46",color:"white",width:"100%",padding:10}}>{busy?"⏳":"💾"} Enregistrer</button>
          </div>
        )}
      </Modal>

      <Modal open={artModal?.mode==="create"} onClose={()=>setArtModal(null)} title={"➕ Nouvel article dans "+target}>
        {artModal?.mode==="create"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"150px 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Réf. (n° de compte)</label><input style={input} value={artModal.ref} onChange={e=>setArtModal(a=>({...a,ref:e.target.value}))}/></div>
              <div><label style={label}>Nom de l'article</label><input style={input} value={artModal.name} onChange={e=>setArtModal(a=>({...a,name:e.target.value}))}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Unité</label><input style={input} value={artModal.unit} onChange={e=>setArtModal(a=>({...a,unit:e.target.value}))} placeholder="ex. b/100, Unité, Litre"/></div>
              <div><label style={label}>Spécification</label><input style={input} value={artModal.conditionnement} onChange={e=>setArtModal(a=>({...a,conditionnement:e.target.value}))} placeholder="Néant"/></div>
              <div><label style={label}>Prix unitaire</label><input type="number" style={input} value={artModal.price} onChange={e=>setArtModal(a=>({...a,price:e.target.value}))}/></div>
            </div>
            <div style={{marginBottom:8}}><label style={label}>Fournisseur <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span></label>
              <select style={input} value={artModal.supplierId} onChange={e=>setArtModal(a=>({...a,supplierId:e.target.value}))}>
                <option value="">—</option>{(store.suppliers||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:12}}><label style={label}>Circuits</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{CIRCUIT_OPTS.map(([c,lb])=>(
                <label key={c} style={{fontSize:12,display:"flex",gap:4,alignItems:"center",border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 9px"}}>
                  <input type="checkbox" checked={artModal.circuits.includes(c)} onChange={()=>setArtModal(a=>({...a,circuits:a.circuits.includes(c)?a.circuits.filter(x=>x!==c):[...a.circuits,c]}))}/>{lb}
                </label>))}</div>
            </div>
            <button disabled={busy} onClick={createArticle} style={{...btn(),background:"#065f46",color:"white",width:"100%",padding:10}}>{busy?"⏳":"💾"} Créer l'article</button>
          </div>
        )}
      </Modal>

      <Modal open={artModal?.mode==="attach"} onClose={()=>setArtModal(null)} title={"⤵ Rattacher un produit existant à "+target}>
        {artModal?.mode==="attach"&&(
          <div>
            <input style={{...input,marginBottom:8}} autoFocus placeholder="🔍 Nom du produit…" value={attachSearch} onChange={e=>setAttachSearch(e.target.value)}/>
            <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Il recevra le n° <b>{nextArticleRef(target)}</b>. Les articles sans n° de compte sont proposés en premier.</div>
            <label style={{fontSize:11.5,display:"flex",gap:6,alignItems:"center",marginBottom:6,cursor:"pointer"}}><input type="checkbox" checked={attachAll} onChange={e=>setAttachAll(e.target.checked)}/> Afficher aussi les produits du Dépôt Vente (ils deviendront aussi des articles de la comptabilité)</label>
            <div style={{maxHeight:320,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8}}>
              {(attachAll?allProducts:products).filter(p=>!attachSearch.trim()||p.name.toLowerCase().includes(attachSearch.toLowerCase()))
                .sort((a,b)=>(refOf(a)?1:0)-(refOf(b)?1:0) || a.name.localeCompare(b.name)).slice(0,40).map(p=>(
                <div key={p.id} onClick={()=>!busy&&attachArticle(p)} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",gap:8}}>
                  <span>{p.name}</span><span style={{color:refOf(p)?"#b45309":"#94a3b8"}}>{refOf(p)?"actuel : "+refOf(p):"sans n°"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!moveModal} onClose={()=>setMoveModal(null)} title={"↔️ Déplacer « "+(moveModal?.product?.name||"")+" »"}>
        {moveModal&&(
          <div>
            <div style={{fontSize:12,marginBottom:8}}>N° actuel : <b>{refOf(moveModal.product)||"—"}</b></div>
            <label style={label}>Compte de destination</label>
            <select style={{...input,marginBottom:8}} value={moveModal.target} onChange={e=>setMoveModal(m=>({...m,target:e.target.value}))}>
              <option value="">— Choisir —</option>
              {nodes.map(n=><option key={n.code} value={n.code}>{" ".repeat((codeLevel(n.code)-1)*4)}{n.code} — {n.libelle}</option>)}
            </select>
            {moveModal.target&&<div style={{fontSize:12,color:"#065f46",marginBottom:10}}>Nouveau n° : <b>{nextArticleRef(moveModal.target)}</b>{moveModal.target[0]!==refOf(moveModal.product)[0]&&refOf(moveModal.product)?<span style={{color:"#b45309"}}> — attention, changement de groupe.</span>:null}</div>}
            <button disabled={busy} onClick={moveArticle} style={{...btn(),background:"#065f46",color:"white",width:"100%",padding:10}}>{busy?"⏳":"↔️"} Déplacer</button>
          </div>
        )}
      </Modal>
      <Modal open={!!editArt} onClose={()=>setEditArt(null)} title={"✏️ Modifier l'article"}>
        {editArt&&(
          <div>
            <div style={{marginBottom:8}}><label style={label}>Nom de l'article</label><input style={input} value={editArt.name} onChange={e=>setEditArt(a=>({...a,name:e.target.value}))}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Unité</label><input style={input} value={editArt.unit} onChange={e=>setEditArt(a=>({...a,unit:e.target.value}))}/></div>
              <div><label style={label}>Spécification</label><input style={input} value={editArt.conditionnement} onChange={e=>setEditArt(a=>({...a,conditionnement:e.target.value}))} placeholder="Néant"/></div>
              <div><label style={label}>Prix unitaire</label><input type="number" style={input} value={editArt.price} onChange={e=>setEditArt(a=>({...a,price:e.target.value}))}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Fournisseur</label>
                <select style={input} value={editArt.supplierId} onChange={e=>setEditArt(a=>({...a,supplierId:e.target.value}))}>
                  <option value="">—</option>{(store.suppliers||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label style={label}>Groupe</label>
                <select style={input} value={editArt.groupe} onChange={e=>setEditArt(a=>({...a,groupe:e.target.value}))}>
                  <option value="">Auto (d'après le n° de compte)</option>{GROUPES.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
                </select></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Type <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(classement)</span></label>
                <select style={input} value={editArt.typeFonct} onChange={e=>setEditArt(a=>({...a,typeFonct:e.target.value}))}>
                  <option value="">— Aucun —</option>{(store.productTypesFonct||[]).map(ty=><option key={ty.id} value={ty.name}>{ty.name}</option>)}
                </select></div>
              <div><label style={label}>Seuil de réapprovisionnement</label><input type="number" min="0" style={input} value={editArt.reorderThreshold} onChange={e=>setEditArt(a=>({...a,reorderThreshold:e.target.value}))}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {["barcode1","barcode2","barcode3"].map((f,i)=><div key={f}><label style={label}>Code-barres {i+1}</label><input style={{...input,fontFamily:"monospace"}} value={editArt[f]} onChange={e=>setEditArt(a=>({...a,[f]:e.target.value}))}/></div>)}
            </div>
            <div style={{marginBottom:12}}><label style={label}>Circuits de la comptabilité</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{CIRCUIT_OPTS.map(([c,lb])=>(
                <label key={c} style={{fontSize:12,display:"flex",gap:4,alignItems:"center",border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 9px"}}>
                  <input type="checkbox" checked={editArt.circuits.includes(c)} onChange={()=>setEditArt(a=>({...a,circuits:a.circuits.includes(c)?a.circuits.filter(x=>x!==c):[...a.circuits,c]}))}/>{lb}
                </label>))}</div>
              {editArt.otherCircuits.length>0&&<div style={{fontSize:10.5,color:"#64748b",marginTop:4}}>Aussi présent au Dépôt Vente — cela reste inchangé (géré dans la page Produits).</div>}
            </div>
            <button disabled={busy} onClick={saveEditArticle} style={{...btn(),background:"#065f46",color:"white",width:"100%",padding:10}}>{busy?"⏳":"💾"} Enregistrer</button>
          </div>
        )}
      </Modal>
      <ConfirmDelete open={!!delArt} onClose={()=>setDelArt(null)} label={delArt?.name||""}
        onConfirm={async()=>{ try{ await store.deleteProduct(delArt.id); say("✅ Article supprimé."); }catch(e){ say("❌ "+e.message); } setDelArt(null); }}/>
      <ScanReviewModal open={scanState.open} onClose={()=>setScanState({msg:"",result:null,open:false})} scanResult={scanState.result}
        allProducts={products} activeSupplier={null} onConfirm={confirmImport} mode="products"/>
      <PrintModal open={printList} onClose={()=>setPrintList(false)} title="Nomenclature — liste des articles" reference={"NOMENCLATURE — "+fltLabel}>
        <NomenclatureListPrint rows={listRows} filtersLabel={fltLabel}/>
      </PrintModal>
    </div>
  );
}
