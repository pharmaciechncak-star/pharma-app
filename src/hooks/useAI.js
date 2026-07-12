import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { SECTIONS, ROLES } from "../constants";
import { can } from "../permissions";
import { readExcelFile, readFileAsBase64 } from "../helpers/fileUtils";

export function buildAIContext(store, currentUser, activeSupplier, page) {
  const isAdmin = currentUser?.role === "admin";
  const accessiblePages = SECTIONS.filter(s => can(currentUser, s.id, "r")).map(s => s.id);
  accessiblePages.push("dashboard");

  const ctx = {
    utilisateur: { nom: currentUser?.name||"—", role: ROLES[currentUser?.role]?.label||currentUser?.role, email: currentUser?.email },
    fournisseurActif: activeSupplier ? { nom: activeSupplier.name, email: activeSupplier.email } : null,
    pageActuelle: page,
    pagesAccessibles: accessiblePages,
    dateAujourdhui: new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}),
  };

  if (can(currentUser,"produits","r")) {
    const prods = activeSupplier ? store.products.filter(p=>p.supplierId===activeSupplier.id) : store.products;
    ctx.produits = prods.map(p=>({ nom:p.name, prix:p.price, stockActuel:store.stock[p.id]||0, alerteStock:(store.stock[p.id]||0)<30 }));
    ctx.stockTotal = prods.reduce((s,p)=>s+(store.stock[p.id]||0),0);
    ctx.produitsEnAlerte = prods.filter(p=>(store.stock[p.id]||0)<30).map(p=>p.name);
  }
  if (can(currentUser,"entrees","r")) {
    const ents = activeSupplier ? store.entries.filter(e=>e.supplierId===activeSupplier.id) : store.entries;
    ctx.entrees = { total: ents.length, ceMois: ents.filter(e=>new Date(e.date).getMonth()===new Date().getMonth()).length,
      recentes: ents.slice(0,10).map(e=>({ ref:e.reference, date:e.date?.substring(0,10), depot:e.depotId, articles:(e.items||[]).length, par:e.createdByName })) };
  }
  if (can(currentUser,"retours","r")) {
    const rets = activeSupplier ? store.returns.filter(r=>r.supplierId===activeSupplier.id) : store.returns;
    ctx.retours = { total: rets.length, ceMois: rets.filter(r=>new Date(r.date).getMonth()===new Date().getMonth()).length };
  }
  if (can(currentUser,"inventaire","r") || can(currentUser,"hist-inv","r")) {
    const invs = activeSupplier ? store.inventories.filter(i=>i.supplierId===activeSupplier.id) : store.inventories;
    ctx.inventaires = { total: invs.length,
      derniers: invs.slice(0,5).map(inv=>({ mois:inv.month, date:inv.date?.substring(0,10), totalVendu:inv.totalSold||0, produits:inv.data?.length||0, par:inv.createdByName,
        detail: (inv.data||[]).filter(r=>r.sold>0).map(r=>({ produit:r.product?.name||"—", vendu:r.sold, stockNouv:r.nw })) })) };
  }
  if (can(currentUser,"factures","r") || can(currentUser,"hist-fact","r")) {
    const facts = activeSupplier ? store.invoices.filter(i=>i.supplierId===activeSupplier.id) : store.invoices;
    ctx.factures = { total:facts.length, enAttente:facts.filter(f=>!f.status||f.status==="en attente").length,
      envoyees:facts.filter(f=>f.status==="envoyée").length, payees:facts.filter(f=>f.status==="payée").length,
      montantTotal:facts.reduce((s,f)=>s+(f.total||0),0),
      recentes: facts.slice(0,5).map(f=>({ ref:f.reference, mois:f.month, montant:f.total, statut:f.status, par:f.createdByName })) };
  }
  if (can(currentUser,"messagerie","r")) {
    ctx.messagerie = { total:store.messages.length, nonLus:store.messages.filter(m=>!m.read).length };
  }
  if (can(currentUser,"fournisseurs","r")) {
    ctx.fournisseurs = store.suppliers.map(s=>({ nom:s.name, email:s.email,
      nbProduits:store.products.filter(p=>p.supplierId===s.id).length,
      nbDepots:store.depots.filter(d=>d.supplierId===s.id).length }));
  }
  if (can(currentUser,"depots","r")) {
    ctx.depots = store.depots.map(d=>({ nom:d.name, localisation:d.location,
      fournisseur:store.suppliers.find(s=>s.id===d.supplierId)?.name||"—" }));
  }
  return ctx;
}

export function useAI() {
  const [msgs, setMsgs] = useState([{role:"assistant",content:"Bonjour ! Je suis l'assistant IA de CHNCAK PharmaStock. Je connais vos stocks, inventaires, factures et bons en temps réel. Posez-moi n'importe quelle question sur vos données ou demandez-moi d'ouvrir une page !"}]);
  const [loading, setLoading] = useState(false);

  const send = useCallback(async(text, ctx, onNav, fileData=null)=>{
    const userContent = fileData ? "[Document: " + (fileData.fileName||"fichier") + "]\n" + text : text;
    const newMsgs = [...msgs, {role:"user", content:userContent}];
    setMsgs(newMsgs);
    setLoading(true);

    const dataCtx = ctx.fullData ? JSON.stringify(ctx.fullData, null, 1) : "{}";
    const pagesAccess = (ctx.fullData?.pagesAccessibles || []);

    const system = "Tu es l'assistant IA intelligent de CHNCAK PharmaStock (Centre Hospitalier National Cheikh Ahmadoul Khadim).\n\nUTILISATEUR : " + (ctx.fullData?.utilisateur?.nom||"—") + " | Rôle : " + (ctx.fullData?.utilisateur?.role||"—") + "\n\nNAVIGATION : Utilise [NAVIGATE:nom-page] pour ouvrir une page.\nPages accessibles : " + pagesAccess.join(", ") + "\n\nGÉNÉRATION DE FICHIERS :\n- Pour générer un fichier Excel : [EXCEL:nom_fichier.xlsx]\n  Suivi d'un tableau JSON : [DATA:[{...},{...}]]\n- Pour générer un PDF : [PDF:nom_fichier]\n  Suivi du contenu HTML : [PDFCONTENT:<table>...</table>]\n- Pour générer un CSV : [CSV:nom_fichier.csv]\n  Suivi d'un tableau JSON : [DATA:[{...},{...}]]\n\nEXEMPLES :\n- Rapport stock : génère un Excel avec tous les produits et leurs quantités.\n- Factures du mois : génère un PDF ou Excel avec la liste des factures.\n- Produits en alerte : génère un fichier CSV des produits sous le seuil.\n\nDONNÉES EN TEMPS RÉEL :\n" + dataCtx + "\n\nINSTRUCTIONS :\n1. Réponds en français, de façon précise et professionnelle.\n2. Utilise les données ci-dessus pour répondre sur stocks, quantités, dates, historiques, situations.\n3. Pour naviguer vers une page accessible : [NAVIGATE:nom-page].\n4. Si l'utilisateur demande un fichier, génère-le avec les balises appropriées.\n5. Fais des calculs, comparaisons, résumés à partir des données.\n6. Signale proactivement les stocks bas ou anomalies.\\n7. GÉNÉRATION DE FICHIERS : place TOUT le HTML dans [PDFCONTENT:...] et TOUT le JSON dans [DATA:[...]]. Ne répète JAMAIS le HTML ou JSON brut dans ta réponse.\\n8. IMPORTANT - DONNÉES COMPLÈTES : quand on te demande une liste ou un rapport, tu DOIS inclure la TOTALITÉ des éléments sans exception. Ne tronque JAMAIS une liste. Si on demande les 93 produits, génère les 93 lignes. Écris uniquement un message de confirmation court après les balises.";

    try {
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ system, messages:newMsgs.map(m=>({role:m.role,content:m.content})) })
      });
      if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || "Erreur serveur "+res.status); }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const aiText = data.reply || "Désolé, je n'ai pas pu répondre.";

      // ── Navigation ──
      const navMatch = aiText.match(/\[NAVIGATE:([^\]]+)\]/);
      if (navMatch && onNav) {
        const tp = navMatch[1].trim();
        if (pagesAccess.includes(tp) || tp === "dashboard") onNav(tp);
      }

      // ── Génération Excel ──
      const excelMatch = aiText.match(/\[EXCEL:([^\]]+)\]/);
      const dataMatch  = aiText.match(/\[DATA:(\[.*?\])\]/s);
      if (excelMatch && dataMatch) {
        try {
          const fileName = excelMatch[1].trim();
          const rows = JSON.parse(dataMatch[1]);
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map(r => headers.map(h => r[h] ?? ""))]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Données");
            XLSX.writeFile(wb, fileName);
          }
        } catch(e) { console.warn("Erreur génération Excel:", e); }
      }

      // ── Génération CSV ──
      const csvMatch = aiText.match(/\[CSV:([^\]]+)\]/);
      if (csvMatch && dataMatch) {
        try {
          const fileName = csvMatch[1].trim();
          const rows = JSON.parse(dataMatch[1]);
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            const csv = [headers.join(";"), ...rows.map(r => headers.map(h => String(r[h]??"")||"").join(";"))].join("\n");
            const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a"); a.href=url; a.download=fileName; a.click();
            URL.revokeObjectURL(url);
          }
        } catch(e) { console.warn("Erreur génération CSV:", e); }
      }

      // ── Génération PDF ──
      const pdfMatch     = aiText.match(/\[PDF:([^\]]+)\]/);
      const pdfContent   = aiText.match(/\[PDFCONTENT:(.*?)\]/s);
      if (pdfMatch) {
        try {
          const fileName = pdfMatch[1].trim();
          const htmlBody = pdfContent ? pdfContent[1] : "<p>" + aiText.replace(/\[.*?\]/gs,"").trim() + "</p>";
          const win = window.open("","_blank");
          const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + fileName + "</title>"
            + "<style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px;}"
            + "table{width:100%;border-collapse:collapse;margin-top:12px;}"
            + "th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left;}"
            + "th{background:#0f172a;color:white;}"
            + "tr:nth-child(even){background:#f8fafc;}"
            + "h2{color:#0f172a;}</style></head>"
            + "<body><h2>CHNCAK PharmaStock — " + fileName + "</h2>"
            + htmlBody
            + "<p style=\"margin-top:24px;font-size:11px;color:#64748b;\">Généré le " + new Date().toLocaleDateString("fr-FR") + "</p>"
            + "</body></html>";
          win.document.write(html);
          win.document.close();
          win.print();
        } catch(e) { console.warn("Erreur génération PDF:", e); }
      }

      // Nettoyer les balises du message affiché
      let cleanText = aiText
        .replace(/\[NAVIGATE:[^\]]+\]/g,"")
        .replace(/\[EXCEL:[^\]]+\]/g,"✅ Fichier Excel généré et téléchargé.")
        .replace(/\[CSV:[^\]]+\]/g,"✅ Fichier CSV généré et téléchargé.")
        .replace(/\[PDF:[^\]]+\]/g,"✅ Fichier PDF ouvert pour impression/téléchargement.")
        // Supprimer les blocs DATA et PDFCONTENT (avec contenu potentiellement très long)
        .replace(/\[DATA:\[[\s\S]*?\]\]/g,"")
        .replace(/\[PDFCONTENT:[\s\S]*?\]/g,"")
        // Supprimer tout HTML brut
        .replace(/<table[\s\S]*?<\/table>/gi,"")
        .replace(/<[^>]+>/g,"")
        // Supprimer blocs de code
        .replace(/```[\s\S]*?```/g,"")
        // Supprimer tableaux JSON bruts [ {...}, {...} ]
        .replace(/\[\s*\{[\s\S]*?\}\s*\]/g,"")
        // Supprimer lignes qui ressemblent à du JSON ou données brutes
        .replace(/^\s*[\{\}"\[\],:0-9]+.*$/gm,"")
        // Nettoyer les lignes vides multiples
        .replace(/\n{3,}/g,"\n\n")
        .trim();

      // Si après nettoyage il ne reste que du bruit, mettre un message générique
      if(!cleanText || cleanText.length < 5) {
        const fileType = excelMatch?"Excel":csvMatch?"CSV":pdfMatch?"PDF":"fichier";
        cleanText = "✅ " + fileType + " généré avec succès.";
      }

      setMsgs([...newMsgs, {role:"assistant", content:cleanText}]);
    } catch(e) {
      setMsgs([...newMsgs, {role:"assistant", content:"❌ Erreur IA : " + e.message}]);
    } finally { setLoading(false); }
  }, [msgs]);

  return { msgs, loading, send, reset:()=>setMsgs([{role:"assistant",content:"Session réinitialisée. Comment puis-je vous aider ?"}]) };
}

export function matchProduct(nameInFile, products) {
  if (!nameInFile) return null;
  const norm = s => s.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();

  const n = norm(nameInFile);
  const nWords = n.split(" ").filter(w => w.length > 1);

  // 1. Correspondance exacte normalisée
  const exact = products.find(p => norm(p.name) === n);
  if (exact) return exact;

  // 2. Score : compter les mots significatifs communs
  const scored = products.map(p => {
    const pNorm  = norm(p.name);
    const pWords = pNorm.split(" ").filter(w => w.length > 1);
    // Mots de l'entrée trouvés dans le produit
    const commonN = nWords.filter(w => pWords.includes(w)).length;
    // Mots du produit trouvés dans l'entrée
    const commonP = pWords.filter(w => nWords.includes(w)).length;
    // Score = ratio de mots communs sur total mots du produit
    const score = pWords.length > 0
      ? (commonN + commonP) / (nWords.length + pWords.length)
      : 0;
    return { p, score, commonN, commonP, pWords, nWords };
  }).filter(s => s.score > 0);

  if (scored.length === 0) return null;

  // Trier par score décroissant
  scored.sort((a,b) => b.score - a.score);
  const best = scored[0];

  // Seuil strict : au moins 50% des mots du produit doivent matcher
  // ET au moins 2 mots communs si le produit a plus de 2 mots
  const minWords = best.pWords.length > 2 ? 2 : 1;
  if (best.commonP < minWords) return null;
  if (best.score < 0.35) return null;

  // Si deux candidats ont un score proche, vérifier qu'ils ne sont pas ambigus
  if (scored.length > 1) {
    const second = scored[1];
    // Si le 2e candidat a un score très proche du 1er → ambiguïté → ne pas matcher
    if (second.score > 0 && (best.score - second.score) < 0.1) {
      // Départager : le produit dont le nom normalisé contient le plus de mots du fichier
      if (second.commonN > best.commonN) return second.p;
    }
  }

  return best.p;
}

export async function scanExcelForProducts(file) {
  const rows = await readExcelFile(file);
  if (!rows || rows.length === 0) return { success: false, items: [] };
  // Colonnes possibles (insensible à la casse)
  const get = (row, ...keys) => {
    for (const k of Object.keys(row)) {
      if (keys.some(key => k.toLowerCase().includes(key.toLowerCase()))) {
        const v = row[k];
        if (v !== "" && v !== null && v !== undefined) return String(v).trim();
      }
    }
    return "";
  };
  const items = rows
    .map(row => ({
      productName: get(row,"nom","name","produit","désignation","designation","article","libellé","libelle","description"),
      qty:         get(row,"qté","qty","quantité","quantite","stock","nombre"),
      unitPrice:   get(row,"prix","price","pu","tarif","montant","cout","coût"),
      lot:         get(row,"lot","batch","n°lot"),
      expiry:      get(row,"expir","peremption","péremption","dlc","date limite","date d'expir"),
    }))
    .filter(it => it.productName);
  return { success: true, items, rawCount: rows.length };
}

export async function scanDocumentWithAI(file, products) {
  const ext = file.name.split(".").pop().toLowerCase();
  const isImage = ["jpg","jpeg","png","gif","webp"].includes(ext);
  const isPDF   = ext === "pdf";
  const isExcel = ["xlsx","xls","csv","ods"].includes(ext);

  // ── Excel : lecture réelle avec SheetJS ──
  if (isExcel) {
    try {
      const { success, items, rawCount } = await scanExcelForProducts(file);
      if (!success || items.length === 0)
        return { success: false, items: [], error: "Aucune ligne détectée dans le fichier Excel." };
      // Enrichir avec les IDs produits connus
      const enriched = items.map(it => {
        const match = matchProduct(it.productName, products);
        return {
          productId:   match?.id   || "",
          productName: match?.name || it.productName,
          qty:         it.qty      || "",
          unitPrice:   it.unitPrice|| (match?.price ? String(match.price) : ""),
          lot:         it.lot      || "",
          expiry:      it.expiry   || "",
          newProduct:  !match,   // true = produit inconnu → à créer
        };
      });
      return {
        success: true, simulated: false,
        reference: "SCAN-" + Math.random().toString(36).substr(2,6).toUpperCase(),
        items: enriched,
        rawCount,
      };
    } catch(e) {
      console.error("Excel read error:", e);
      return { success: false, items: [], error: "Erreur lecture Excel : " + e.message };
    }
  }

  // ── Image ou PDF : envoi à Claude ──
  const productList = products.map((p,i) => `${i+1}. "${p.name}"`).join("\n");
  const instruction = `Tu es un assistant d'extraction de données pharmaceutiques.
Analyse ce document et extrais les informations de bon d'entrée ou d'inventaire.

LISTE EXACTE DES PRODUITS CONNUS (utilise EXACTEMENT ces noms, ne les modifie pas) :
${productList}

RÈGLES STRICTES DE CORRESPONDANCE :
- Pour chaque ligne du document, trouve le produit qui correspond LE MIEUX dans la liste ci-dessus
- La correspondance doit être PRÉCISE : "Perfuseur" → cherche un produit avec "PERFUSEUR" dans son nom, PAS "SODIUM CHLORURE"
- Pour les variantes (ex: Vicryl 2/0, Vicryl 3/0, Vicryl 5/0) : fais attention aux numéros/tailles, ne confonds PAS Vicryl 2/0 ronde avec Vicryl 3/0 ronde
- Si aucun produit ne correspond exactement, utilise le nom tel qu'il apparaît dans le document
- Ne jamais substituer un produit par un autre qui commence par les mêmes lettres si le reste du nom est différent

Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans texte avant ou après.
Format exact:
{"reference":"BON-XXX","fournisseur":"Nom","items":[{"productName":"nom exact du produit de la liste ou tel que dans le document","qty":0,"unitPrice":0,"lot":"...","expiry":"AAAA-MM-JJ"}]}
Extrait TOUTES les lignes du document.`;

  try {
    let content;
    if (isImage) {
      const b64  = await readFileAsBase64(file);
      const mime = file.type?.startsWith("image/") ? file.type : "image/jpeg";
      content = [
        { type:"image",  source:{ type:"base64", media_type:mime, data:b64 } },
        { type:"text",   text: instruction }
      ];
    } else if (isPDF) {
      const b64 = await readFileAsBase64(file);
      content = [
        { type:"document", source:{ type:"base64", media_type:"application/pdf", data:b64 } },
        { type:"text",     text: instruction }
      ];
    } else {
      return { success: false, items: [], error: "Format non supporté : " + ext };
    }

    const res = await fetch("/api/chat", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ messages:[{ role:"user", content }] })
    });

    if (!res.ok) {
      const errData = await res.json().catch(()=>({}));
      return { success:false, items:[], error: errData.error || "Erreur API Claude." };
    }

    const data    = await res.json();
    const rawText = data.reply || "";

    let parsed = null;
    try { parsed = JSON.parse(rawText.trim()); }
    catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
    }

    if (!parsed?.items?.length)
      return { success:false, items:[], error:"Aucune donnée extraite du document." };

    const enriched = parsed.items.map(it => {
      const match = matchProduct(it.productName, products);
      return {
        productId:   match?.id   || "",
        productName: match?.name || it.productName || "",
        qty:         String(it.qty || ""),
        unitPrice:   String(it.unitPrice || (match?.price ? String(match.price) : "")),
        lot:         it.lot    || "",
        expiry:      it.expiry || "",
        newProduct:  !match,
      };
    });

    return { success:true, simulated:false,
      reference: parsed.reference || "",
      items: enriched };

  } catch(e) {
    console.error("Scan error:", e);
    return { success:false, items:[], error: e.message };
  }
}
