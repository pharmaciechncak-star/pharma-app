import { useState, useEffect } from "react";
import { signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db, authSecondary } from "../firebase";
import { ROLES, DEFAULT_CAROUSEL_SLIDES } from "../constants";

export function liveCol(collName, setter, ...constraints) {
  const q = constraints.length
    ? query(collection(db, collName), ...constraints)
    : collection(db, collName);
  return onSnapshot(q, snap =>
    setter(snap.docs.map(d => ({
      id: d.id, ...d.data(),
      // Priorité au champ "date" PROPRE au document (ex: la date choisie sur
      // un Bon d'Entrée, "2026-09-21") — ne jamais l'écraser par un
      // horodatage complet dérivé de createdAt ("2026-09-21T09:28:26.491Z"),
      // qui casse à la fois son affichage et toute comparaison avec un filtre
      // de période au format YYYY-MM-DD. Le repli sur createdAt ne sert que
      // pour les collections qui n'ont pas leur propre champ "date".
      date: d.data().date || d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
    }))),
    // Sans ce second callback, une erreur de permission Firestore remonte
    // comme "Uncaught Error in snapshot listener" générique dans la console,
    // sans jamais dire QUELLE collection est en cause — impossible à
    // diagnostiquer. Avec ce callback, l'erreur est capturée proprement et
    // identifie la collection concernée.
    err => console.warn(`[liveCol] Erreur d'écoute sur "${collName}" :`, err.code || err.message || err)
  );
}

export async function adjustStockFB(items, sign) {
  for (const it of (items||[])) {
    if (!it.productId || !it.qty) continue;
    const ref  = doc(db, "products", it.productId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const cur = snap.data().stockQty || 0;
      await updateDoc(ref, { stockQty: Math.max(0, cur + sign * Number(it.qty)) });
    }
  }
}

// ─────────────────────────────────────────────
// Lots de péremption (FEFO) — domaine Stock (2) uniquement
// ─────────────────────────────────────────────
// Un lot vit soit à la pharmacie ("pharmacy"), soit chez un service
// ("service:<serviceId>"). Il est créé à la réception, migré (pharmacie→service)
// lors d'un transfert, et réduit lors d'une consommation ou d'un retour service.
// Ce système est indépendant du Stock (1) — bons d'entrée/retour/inventaire —
// qui reste un simple compteur agrégé (products.stockQty), sans notion de lot.

function locPharmacy() { return "pharmacy"; }
function locService(serviceId) { return "service:" + serviceId; }
// Circuit "fonctionnement" (Comptabilité Matières) — emplacements distincts
// de ceux du circuit "vente" ci-dessus, pour que les lots des deux circuits
// ne se mélangent jamais dans le suivi FEFO/péremptions.
function locFonctPharmacy() { return "fonct-pharmacy"; }
function locFonctService(serviceId) { return "fonct-service:" + serviceId; }
// Circuit "non pharmaceutique" — emplacements distincts, même logique.
function locNpPharmacy() { return "np-pharmacy"; }
function locNpService(serviceId) { return "np-service:" + serviceId; }

export async function createBatch({ productId, productName, lot, expiry, qty, location, source, sourceRef, userId, userName }) {
  if (!productId || !Number(qty)) return null;
  const ref = await addDoc(collection(db, "batches"), {
    productId, productName: productName || "",
    lot: lot || "", expiry: expiry || "",
    qtyInitial: Number(qty), qtyRemaining: Number(qty),
    location, source, sourceRef,
    createdBy: userId, createdByName: userName, createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Consomme les lots d'un produit, à un emplacement donné, en priorité sur ceux
// dont la date de péremption est la plus proche (FEFO — First Expired, First
// Out). Les lots sans date renseignée sont consommés en dernier. Si la
// quantité demandée dépasse les lots suivis à cet emplacement (ex : stock
// antérieur à l'introduction des lots), le solde non couvert ("shortfall")
// est simplement ignoré : les compteurs dénormalisés (svcStock, formules
// Stock 2) restent la source de vérité pour la quantité totale.
export async function consumeFEFO(productId, qtyNeeded, location) {
  if (!productId || !qtyNeeded || !location) return { consumed: [], shortfall: 0 };
  const q = query(collection(db, "batches"),
    where("productId", "==", productId),
    where("location", "==", location),
    where("qtyRemaining", ">", 0));
  const snap = await getDocs(q);
  const batches = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if (!a.expiry && !b.expiry) return 0;
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return a.expiry.localeCompare(b.expiry);
    });
  let remaining = Number(qtyNeeded);
  const consumed = [];
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.qtyRemaining, remaining);
    if (take <= 0) continue;
    await updateDoc(doc(db, "batches", b.id), { qtyRemaining: b.qtyRemaining - take });
    consumed.push({ batchId: b.id, lot: b.lot, expiry: b.expiry, qty: take });
    remaining -= take;
  }
  return { consumed, shortfall: Math.max(0, remaining) };
}

// Récupère tous les lots créés par une opération donnée (transfert, retour,
// réception), via leur source/sourceRef — utilisé pour la modification et
// l'annulation (jamais de suppression, on retrouve ce qui a été créé pour le
// réajuster ou le neutraliser).
async function getBatchesFor(source, sourceRef) {
  const q = query(collection(db, "batches"), where("source", "==", source), where("sourceRef", "==", sourceRef));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Fait "revenir" tous les lots créés par une opération (transfert ou retour)
// vers un emplacement donné : cherche un lot compatible (même produit/lot/
// péremption) à cet emplacement pour lui recréditer la quantité, ou en crée un
// nouveau si aucun ne correspond — puis neutralise le lot d'origine (jamais de
// suppression). Utilisé par cancelTransfer/updateTransfer et
// cancelSvcReturn/updateSvcReturn : la logique est strictement symétrique,
// seul l'emplacement de destination change.
async function reverseBatchesOf(source, sourceRef, targetLocation, userId, userName) {
  const batches = await getBatchesFor(source, sourceRef);
  for (const b of batches) {
    if (!b.qtyRemaining) continue;
    const q = query(collection(db, "batches"),
      where("productId", "==", b.productId),
      where("location", "==", targetLocation),
      where("lot", "==", b.lot || ""),
      where("expiry", "==", b.expiry || ""));
    const snap = await getDocs(q);
    const existing = snap.docs[0];
    if (existing) {
      const ed = existing.data();
      await updateDoc(doc(db, "batches", existing.id), {
        qtyRemaining: (ed.qtyRemaining||0) + b.qtyRemaining,
        qtyInitial: (ed.qtyInitial||0) + b.qtyRemaining,
      });
    } else {
      await createBatch({
        productId: b.productId, productName: b.productName, lot: b.lot, expiry: b.expiry,
        qty: b.qtyRemaining, location: targetLocation, source: "reversal", sourceRef: b.id,
        userId, userName,
      });
    }
    await updateDoc(doc(db, "batches", b.id), { qtyRemaining: 0, qtyInitial: 0 });
  }
}

// Restaure exactement l'effet stock d'une consommation (svcStock + lots FEFO
// précisément consommés, via consumedBatches enregistré à la création) —
// utilisé par cancelConsumption et updateConsumption (annule puis réapplique).
async function restoreConsumptionStock(c) {
  for (const it of (c.items||[])) {
    if (!it.productId || !it.qty) continue;
    const sKey = c.serviceId+"_"+it.productId;
    const sSnap = await getDoc(doc(db,"svcStock",sKey));
    const sCur = sSnap.data()?.qty || 0;
    await setDoc(doc(db,"svcStock",sKey), { serviceId:c.serviceId, productId:it.productId, qty: sCur + Number(it.qty) }, { merge:true });
  }
  for (const grp of (c.consumedBatches||[])) {
    for (const b of (grp.batches||[])) {
      const bSnap = await getDoc(doc(db,"batches",b.batchId));
      if (bSnap.exists()) {
        await updateDoc(doc(db,"batches",b.batchId), { qtyRemaining: (bSnap.data().qtyRemaining||0) + b.qty });
      }
    }
  }
}

export function useStore(userId, userName, page) {
  const [suppliers,    setSuppliers]    = useState([]);
  const [depots,       setDepots]       = useState([]);
  const [products,     setProducts]     = useState([]);
  const [users,        setUsers]        = useState([]);
  const [entries,      setEntries]      = useState([]);
  const [returns,      setReturns]      = useState([]);
  const [inventories,  setInventories]  = useState([]);
  const [invoices,     setInvoices]     = useState([]);
  const [messages,     setMessages]     = useState([]);
  const [activities,   setActivities]   = useState([]);
  const [services,     setServices]     = useState([]);
  const [transfers,    setTransfers]    = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [svcReturns,   setSvcReturns]   = useState([]);
  const [receptions,   setReceptions]   = useState([]);
  const [batches,      setBatches]      = useState([]);
  // NB : pas de state "patients" — le dossier patient (voir getPatient/upsertPatient
  // plus bas) est consulté via une requête ciblée getDoc(), jamais via une liste
  // complète : inutile de maintenir un écouteur temps réel sur toute la collection.
  const [carouselSlides, setCarouselSlides] = useState(null); // null = pas encore chargé
  const [stock2Inventories, setStock2Inventories] = useState([]);
  const [entreesFonct, setEntreesFonct] = useState([]);
  const [stock2InventoriesFonct, setStock2InventoriesFonct] = useState([]);
  const [productTypesFonct, setProductTypesFonct] = useState([]);
  const [circuitsRegistry, setCircuitsRegistry] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [pvFonctions, setPvFonctions] = useState([]);
  const [pvResponsables, setPvResponsables] = useState([]);
  const [pvSettings, setPvSettings] = useState([]);
  const [procesVerbaux, setProcesVerbaux] = useState([]);
  const [entreesNp, setEntreesNp] = useState([]);
  const [sortiesNp, setSortiesNp] = useState([]);
  const [stock2InventoriesNp, setStock2InventoriesNp] = useState([]);
  const [sortiesFonct, setSortiesFonct] = useState([]);
  const [svcStock,     setSvcStock]     = useState({}); // { "serviceId_productId": qty }
  const [stock,        setStock]        = useState({});
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Helper avec gestion d'erreur silencieuse
    const safeLiveCol = (collName, setter, ...constraints) => {
      try { return liveCol(collName, setter, ...constraints); }
      catch(e) { console.warn("Listener error:", collName, e); return ()=>{}; }
    };

    const unsubs = [
      safeLiveCol("suppliers",    setSuppliers,   orderBy("name")),
      safeLiveCol("depots",       setDepots,      orderBy("name")),
      safeLiveCol("users",        setUsers,       orderBy("name")),
      safeLiveCol("entries",      setEntries,     orderBy("createdAt","desc")),
      safeLiveCol("returns",      setReturns,     orderBy("createdAt","desc")),
      safeLiveCol("inventories",  setInventories, orderBy("createdAt","desc")),
      safeLiveCol("invoices",     setInvoices,    orderBy("createdAt","desc")),
      safeLiveCol("messages",     setMessages,    orderBy("createdAt","desc")),
      safeLiveCol("services",     setServices,    orderBy("name")),
      safeLiveCol("transfers",    setTransfers,   orderBy("createdAt","desc")),
      safeLiveCol("consumptions", setConsumptions,orderBy("createdAt","desc")),
      safeLiveCol("svcReturns",   setSvcReturns,  orderBy("createdAt","desc")),
      safeLiveCol("receptions",   setReceptions,  orderBy("createdAt","desc")),
      safeLiveCol("stock2Inventories", setStock2Inventories, orderBy("createdAt","desc")),
      safeLiveCol("entreesFonct", setEntreesFonct, orderBy("createdAt","desc")),
      safeLiveCol("stock2InventoriesFonct", setStock2InventoriesFonct, orderBy("createdAt","desc")),
      safeLiveCol("productTypesFonct", setProductTypesFonct, orderBy("name","asc")),
      safeLiveCol("circuitsRegistry", setCircuitsRegistry, orderBy("createdAt","asc")),
      safeLiveCol("demandes", setDemandes, orderBy("createdAt","desc")),
      safeLiveCol("pvFonctions", setPvFonctions, orderBy("name","asc")),
      safeLiveCol("pvResponsables", setPvResponsables, orderBy("order","asc")),
      safeLiveCol("pvSettings", setPvSettings),
      safeLiveCol("procesVerbaux", setProcesVerbaux, orderBy("createdAt","desc")),
      safeLiveCol("entreesNp", setEntreesNp, orderBy("createdAt","desc")),
      safeLiveCol("sortiesNp", setSortiesNp, orderBy("createdAt","desc")),
      safeLiveCol("stock2InventoriesNp", setStock2InventoriesNp, orderBy("createdAt","desc")),
      safeLiveCol("sortiesFonct", setSortiesFonct, orderBy("createdAt","desc")),
      // batches : nécessaire à l'assistant IA (péremptions) qui peut être ouvert
      // depuis n'importe quelle page, donc pas de chargement "à la demande"
      // possible ici sans perdre cette capacité — reste en écoute permanente.
      // Les lots totalement épuisés (qtyRemaining=0 — consommés, annulés ou
      // neutralisés lors d'une réversion) ne sont jamais affichés nulle part
      // (péremptions, assistant IA filtrent déjà qtyRemaining>0 côté client) —
      // autant ne pas les transférer du tout, ce qui réduit fortement le volume
      // au fil du temps puisque la plupart des lots finissent épuisés.
      // NB : Firestore exige que le champ filtré par inégalité (qtyRemaining>0)
      // soit AUSSI le premier critère de tri — sinon la requête est invalide et
      // échoue silencieusement (c'était le bug : orderBy("expiry") seul, sans
      // orderBy("qtyRemaining") d'abord, rejetait la requête). Le tri final par
      // péremption se fait donc côté client (voir PeremptionsTab.sort()).
      safeLiveCol("batches",      setBatches,     where("qtyRemaining",">",0), orderBy("qtyRemaining","asc"), orderBy("expiry","asc")),
    ];

    // Listener svcStock avec gestion d'erreur
    let unsubSvcStock = ()=>{};
    try {
      unsubSvcStock = onSnapshot(collection(db,"svcStock"), snap=>{
        const map={};
        snap.docs.forEach(d=>{ map[d.id]=d.data().qty||0; });
        setSvcStock(map);
      }, err=>console.warn("svcStock listener error:", err));
    } catch(e) { console.warn("svcStock init error:", e); }

    // Slides du carrousel — document unique partagé (settings/carousel), pas
    // une collection. Stocké dans Firestore (et non localStorage comme avant)
    // pour être visible par TOUS les utilisateurs, pas seulement celui qui l'a
    // modifié sur son propre appareil.
    let unsubCarousel = ()=>{};
    try {
      unsubCarousel = onSnapshot(doc(db,"settings","carousel"), snap=>{
        setCarouselSlides(snap.exists() && snap.data().slides ? snap.data().slides : DEFAULT_CAROUSEL_SLIDES);
      }, err=>{ console.warn("carousel listener error:", err); setCarouselSlides(DEFAULT_CAROUSEL_SLIDES); });
    } catch(e) { console.warn("carousel init error:", e); setCarouselSlides(DEFAULT_CAROUSEL_SLIDES); }

    const unsubProd = onSnapshot(
      query(collection(db,"products"), orderBy("name")),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProducts(data);
        const s = {};
        data.forEach(p => { s[p.id] = p.stockQty || 0; });
        setStock(s);
        setLoading(false);
      }
    );
    unsubs.push(unsubProd);
    return () => { unsubs.forEach(u => u()); unsubSvcStock(); unsubCarousel(); };
  }, [userId]);

  // Chargement À LA DEMANDE (pas au démarrage de l'app) pour le Journal
  // d'activité — utilisé sur UNE SEULE page (admin uniquement), et jamais par
  // l'assistant IA (contrairement à batches/messages, qui doivent donc rester
  // en écoute permanente pour rester disponibles depuis n'importe quelle page).
  // Avant ce correctif, cet écouteur tournait en permanence pour tout le monde
  // dès la connexion, même sans jamais visiter cette page — source majeure de
  // lectures Firestore inutiles, "activities" grossissant d'une entrée à
  // quasiment chaque action de l'application. Se détache en quittant la page.
  useEffect(() => {
    if (!userId || page !== "activites") return;
    const unsub = onSnapshot(
      query(collection(db,"activities"), orderBy("createdAt","desc"), limit(500)),
      snap => setActivities(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
      err => console.warn("activities listener error:", err)
    );
    return () => unsub();
  }, [userId, page]);

  // ── PV de réception (Procès-Verbaux) — création automatique ──
  // Appelé après la création d'un Bon d'Entrée (Fonctionnement/Non-Pharma) :
  // si le montant total atteint le seuil configuré pour ce circuit, génère
  // automatiquement le PV correspondant, avec un numéro séquentiel propre au
  // circuit et à l'année, et une COPIE (pas une référence) de la commission
  // fixe actuelle — pour que le PV garde la composition telle qu'elle était
  // au moment de la réception, même si la commission change plus tard.
  async function createPvIfNeeded(circuit, entreeId, entreeData) {
    // Garde anti-doublon : un PV existe-t-il déjà pour ce bon d'entrée ? (les
    // deux chemins — automatique à la création, et manuel via le bouton —
    // passent par cette même vérification.)
    if ((procesVerbaux||[]).some(pv=>pv.entreeId===entreeId)) return;
    const settings = (pvSettings||[]).find(s=>s.id===circuit || s.circuit===circuit);
    const seuil = Number(settings?.seuil)||0;
    if (!seuil) return; // pas de seuil configuré pour ce circuit -> pas de PV automatique
    const totalMontant = (entreeData.items||[]).reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.unitPrice)||0),0);
    if (totalMontant < seuil) return;
    await buildAndSavePv(circuit, entreeId, entreeData, settings, "PV de réception généré automatiquement");
  }

  // Génération manuelle — pour régulariser un Bon d'Entrée déjà créé qui
  // aurait dû recevoir un PV (seuil réglé après coup, par exemple). Mêmes
  // règles que l'automatique : seuil obligatoire, montant atteint, et
  // jamais de doublon si un PV existe déjà pour ce bon.
  async function createPvManually(circuit, entreeId) {
    if ((procesVerbaux||[]).some(pv=>pv.entreeId===entreeId)) throw new Error("Un PV existe déjà pour ce bon d'entrée.");
    const entreeData = circuit==="fonctionnement"
      ? (entreesFonct||[]).find(e=>e.id===entreeId)
      : (entreesNp||[]).find(e=>e.id===entreeId);
    if (!entreeData) throw new Error("Bon d'entrée introuvable.");
    const settings = (pvSettings||[]).find(s=>s.id===circuit || s.circuit===circuit);
    const seuil = Number(settings?.seuil)||0;
    if (!seuil) throw new Error("Aucun seuil n'est configuré pour ce circuit (voir Paramètres).");
    const totalMontant = (entreeData.items||[]).reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.unitPrice)||0),0);
    if (totalMontant < seuil) throw new Error(`Ce bon (${totalMontant.toLocaleString("fr-FR")} FCFA) n'atteint pas le seuil configuré (${seuil.toLocaleString("fr-FR")} FCFA).`);
    await buildAndSavePv(circuit, entreeId, entreeData, settings, "PV de réception généré manuellement");
  }

  async function buildAndSavePv(circuit, entreeId, entreeData, settings, activityLabel) {
    const totalMontant = (entreeData.items||[]).reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.unitPrice)||0),0);
    const totalUnites = (entreeData.items||[]).reduce((s,it)=>s+(Number(it.qty)||0),0);
    const year = new Date().getFullYear();
    const counterId = circuit+"_"+year;
    const counterRef = doc(db,"pvCounters",counterId);
    const counterSnap = await getDoc(counterRef);
    const nextSeq = (counterSnap.exists()?Number(counterSnap.data().seq||0):0) + 1;
    await setDoc(counterRef, { circuit, year, seq:nextSeq }, { merge:true });
    const prefix = settings?.prefix || (circuit==="fonctionnement"?"PH":"NP");
    const numero = `${prefix}/${nextSeq}/${year}`;
    const itemsWithCdt = (entreeData.items||[]).map(it => {
      const prod = (products||[]).find(p=>p.id===it.productId);
      return { ...it, conditionnement: prod?.conditionnement||"" };
    });
    const commission = (pvResponsables||[]).filter(r=>r.circuit===circuit).map(r=>({
      fonctionName:r.fonctionName||"", personName:r.personName||"", interimName:r.interimName||"",
    }));
    await addDoc(collection(db,"procesVerbaux"), {
      circuit, numero, entreeId, entreeRef:entreeData.reference||"", supplierName:entreeData.supplierName||"", supplierId:entreeData.supplierId||"",
      dateReception:entreeData.date||"", items:itemsWithCdt, totalMontant, totalUnites,
      commission, status:"attente", bcNumero:"", blNumero:"", factureNumero:"",
      createdBy:userId, createdByName:userName, createdAt:serverTimestamp(),
    });
    await addDoc(collection(db,"activities"), {
      action:"create", entity:"pv", entityId:numero,
      details:`${activityLabel} : ${numero} (${totalMontant.toLocaleString("fr-FR")} FCFA)`,
      userId, userName, createdAt:serverTimestamp(),
    });
  }

  // Renseigne les pièces justificatives (N° BC/BL/Facture) et fige le choix
  // des intérimaires AVANT impression — le PV reste "en attente" tant qu'il
  // n'est pas explicitement validé (après signature physique).
  async function preparePvForPrint(pvId, { bcNumero, blNumero, factureNumero, commission }) {
    const data = { bcNumero:bcNumero||"", blNumero:blNumero||"", factureNumero:factureNumero||"" };
    if (commission) data.commission = commission;
    await updateDoc(doc(db,"procesVerbaux",pvId), data);
  }
  async function validatePv(pvId) {
    const snap = await getDoc(doc(db,"procesVerbaux",pvId));
    if (!snap.exists()) throw new Error("PV introuvable");
    const pv = snap.data();
    if (pv.status === "valide") throw new Error("Ce PV est déjà validé.");
    await updateDoc(doc(db,"procesVerbaux",pvId), { status:"valide", validatedBy:userId, validatedByName:userName, validatedAt:serverTimestamp() });
    await addDoc(collection(db,"activities"), { action:"update", entity:"pv", entityId:pv.numero||pvId, details:`PV validé : ${pv.numero}`, userId, userName, createdAt:serverTimestamp() });
  }

  return {
    preparePvForPrint, validatePv, createPvManually,
    suppliers, depots, products, users,
    entries, returns, inventories, invoices, messages, activities,
    services, transfers, consumptions, svcReturns, receptions, svcStock, batches, carouselSlides, stock2Inventories, entreesFonct, sortiesFonct, stock2InventoriesFonct, productTypesFonct, circuitsRegistry, demandes, entreesNp, sortiesNp, stock2InventoriesNp, pvFonctions, pvResponsables, pvSettings, procesVerbaux,
    stock, loading,

    addSupplier:    s    => addDoc(collection(db,"suppliers"), { ...s, createdBy:userId, createdByName:userName, createdAt: serverTimestamp() }), // retourne Promise<DocumentReference>
    updateSupplier: (id,s)=> updateDoc(doc(db,"suppliers",id), s),

    addDepot:    d    => addDoc(collection(db,"depots"), { ...d, createdBy:userId, createdByName:userName, createdAt: serverTimestamp() }),
    updateDepot: (id,d)=> updateDoc(doc(db,"depots",id), d),

    addEntry: async e => {
      const ref = await addDoc(collection(db,"entries"), {
        ...e, type:"entry", createdBy:userId, createdByName:userName, createdAt: serverTimestamp(),
      });
      await adjustStockFB(e.items, +1);
      await addDoc(collection(db,"activities"), { action:"create", entity:"entry", entityId:ref.id, details:`Bon d'entrée créé : ${e.reference} (${e.items?.length||0} article(s))`, userId, userName, createdAt:serverTimestamp() });
      return { id: ref.id, ...e, date: new Date().toISOString() };
    },

    addReturn: async r => {
      const ref = await addDoc(collection(db,"returns"), {
        ...r, type:"return", createdBy:userId, createdByName:userName, createdAt: serverTimestamp(),
      });
      await adjustStockFB(r.items, -1);
      await addDoc(collection(db,"activities"), { action:"create", entity:"return", entityId:ref.id, details:`Bon de retour créé : ${r.reference} (${r.items?.length||0} article(s))`, userId, userName, createdAt:serverTimestamp() });
      return { id: ref.id, ...r, date: new Date().toISOString() };
    },

    addInventory: async inv => {
      const ref = await addDoc(collection(db,"inventories"), {
        ...inv, createdBy:userId, createdByName:userName, createdAt: serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"create", entity:"inventory", entityId:ref.id, details:`Inventaire créé : ${inv.month} — ${inv.totalSold||0} unité(s) vendue(s)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    addInvoice: async inv => {
      const ref = await addDoc(collection(db,"invoices"), {
        ...inv, status:"en attente", createdBy:userId, createdByName:userName, createdAt: serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"create", entity:"invoice", entityId:ref.id, details:`Facture créée : ${inv.reference} — ${Number(inv.total||0).toLocaleString("fr-FR")} FCFA`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    addProduct: async p => {
      const ref = await addDoc(collection(db,"products"), {
        ...p, stockQty: 0, createdBy:userId, createdByName:userName, createdAt: serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"create", entity:"product", entityId:ref.id, details:`Produit créé : ${p.name}`, userId, userName, createdAt:serverTimestamp() });
      return ref.id;
    },
    updateProduct: async (id,p) => {
      // Récupérer l'ancien nom avant modification
      let oldName = id;
      try { const snap = await getDoc(doc(db,"products",id)); oldName = snap.data()?.name||id; } catch(e){}
      await updateDoc(doc(db,"products",id), p);
      const details = oldName !== (p.name||id)
        ? `Produit modifié : "${oldName}" → "${p.name||id}"`
        : `Produit modifié : "${p.name||id}"`;
      await addDoc(collection(db,"activities"), { action:"update", entity:"product", entityId:id, details, oldName, newName:p.name||id, userId, userName, createdAt:serverTimestamp() });
    },

    // Utilisée par la rubrique "Seuil" — un agent de service n'a pas le droit
    // général d'édition produit (permission "produits"), mais peut, via cette
    // fonction dédiée, définir le seuil de réapprovisionnement DE SON SERVICE
    // (reorderThresholds.<serviceId>, distinct du seuil pharmacie global) et
    // ajouter/corriger un code-barre. Volontairement limitée à ces champs pour
    // que les règles Firestore puissent les distinguer d'une édition produit
    // complète (nom, prix, fournisseur...) et n'autoriser qu'eux.
    updateProductThreshold: async (productId, serviceId, { threshold, barcode1, barcode2, barcode3 }) => {
      const patch = {};
      if (threshold !== undefined) patch["reorderThresholds." + serviceId] = threshold===""||threshold==null ? null : Number(threshold);
      if (barcode1 !== undefined) patch.barcode1 = barcode1;
      if (barcode2 !== undefined) patch.barcode2 = barcode2;
      if (barcode3 !== undefined) patch.barcode3 = barcode3;
      await updateDoc(doc(db,"products",productId), patch);
      await addDoc(collection(db,"activities"), {
        action:"update", entity:"product", entityId:productId,
        details:`Seuil/code-barre mis à jour (service) : ${productId}`,
        userId, userName, createdAt:serverTimestamp(),
      });
    },

    deleteEntry: async id => {
      await addDoc(collection(db,"activities"), { action:"delete", entity:"entry", entityId:id, details:`Bon d'entrée supprimé : ${id}`, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"entries",id));
    },
    deleteReturn: async id => {
      await addDoc(collection(db,"activities"), { action:"delete", entity:"return", entityId:id, details:`Bon de retour supprimé : ${id}`, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"returns",id));
    },
    deleteInventory: async id => {
      await addDoc(collection(db,"activities"), { action:"delete", entity:"inventory", entityId:id, details:`Inventaire supprimé : ${id}`, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"inventories",id));
    },
    deleteInvoice: async id => {
      await addDoc(collection(db,"activities"), { action:"delete", entity:"invoice", entityId:id, details:`Facture supprimée : ${id}`, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"invoices",id));
    },
    deleteProduct: async id => {
      let oldName = id;
      try { const snap = await getDoc(doc(db,"products",id)); oldName = snap.data()?.name||id; } catch(e){}
      await addDoc(collection(db,"activities"), { action:"delete", entity:"product", entityId:id, details:`Produit supprimé : "${oldName}"`, oldName, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"products",id));
    },
    deleteSupplier: async id => {
      await addDoc(collection(db,"activities"), { action:"delete", entity:"supplier", entityId:id, details:`Fournisseur supprimé : ${id}`, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"suppliers",id));
    },

    markRead: id => updateDoc(doc(db,"messages",id), { read: true }),

    addUser: async u => {
      const password = (u.tempPw && u.tempPw.length >= 6) ? u.tempPw : "PharmaStock2025!";
      try {
        // Utiliser l'instance Auth secondaire pour NE PAS déconnecter l'admin
        const cred = await createUserWithEmailAndPassword(authSecondary, u.email, password);
        const newUid = cred.user.uid;

        // Déconnecter immédiatement l'instance secondaire
        await signOut(authSecondary);

        // Écrire le document Firestore avec l'UID Auth comme clé
        await setDoc(doc(db, "users", newUid), {
          name:         u.name,
          email:        u.email,
          role:         u.role,
          serviceId:    u.serviceId || null,
          allowedServices:  u.allowedServices  || [],
          allowedSuppliers: u.allowedSuppliers || [],
          mustChangePw: true,
          createdAt:    serverTimestamp(),
        });

        // Log activité
        await addDoc(collection(db,"activities"), {
          action:"create", entity:"user",
          details:`Utilisateur créé : ${u.name} (${ROLES[u.role]?.label||u.role})`,
          userId, userName, createdAt:serverTimestamp(),
        });

        return { success:true, uid:newUid };
      } catch(e) {
        // Déconnecter l'instance secondaire en cas d'erreur aussi
        try { await signOut(authSecondary); } catch(_){}
        if(e.code === "auth/email-already-in-use")
          throw new Error("Cet email est déjà utilisé.");
        if(e.code === "auth/invalid-email")
          throw new Error("Adresse email invalide.");
        if(e.code === "auth/weak-password")
          throw new Error("Mot de passe trop faible (min. 6 caractères).");
        throw new Error(e.message || "Erreur inconnue");
      }
    },
    updateUser: async (id,u) => {
      let oldData = {};
      try { const snap = await getDoc(doc(db,"users",id)); oldData = snap.data()||{}; } catch(e){}
      await updateDoc(doc(db,"users",id), u);
      // Construire un message de modification détaillé
      const changes = [];
      if(u.name && u.name !== oldData.name) changes.push(`Nom : "${oldData.name||"—"}" → "${u.name}"`);
      if(u.role && u.role !== oldData.role) changes.push(`Rôle : "${ROLES[oldData.role]?.label||oldData.role||"—"}" → "${ROLES[u.role]?.label||u.role}"`);
      if(u.provisionalPw) changes.push("Mot de passe provisoire défini");
      if(u.permissions) changes.push("Permissions modifiées");
      const details = changes.length > 0
        ? `Utilisateur modifié : "${oldData.name||id}" — ${changes.join(", ")}`
        : `Utilisateur modifié : "${oldData.name||id}"`;
      if(changes.length > 0 || u.name || u.role){
        await addDoc(collection(db,"activities"), { action:"update", entity:"user", entityId:id, details, oldName:oldData.name, newName:u.name||oldData.name, oldRole:oldData.role, newRole:u.role||oldData.role, userId, userName, createdAt:serverTimestamp() });
      }
    },
    deleteUser: async id => {
      let oldData = {};
      try { const snap = await getDoc(doc(db,"users",id)); oldData = snap.data()||{}; } catch(e){}
      const oldName = oldData.name||id;
      const oldRole = ROLES[oldData.role]?.label||oldData.role||"—";
      await addDoc(collection(db,"activities"), { action:"delete", entity:"user", entityId:id, details:`Utilisateur supprimé : "${oldName}" (${oldRole})`, oldName, oldRole, userId, userName, createdAt:serverTimestamp() });
      return deleteDoc(doc(db,"users",id));
    },

    deleteMessage:  (id) => deleteDoc(doc(db,"messages",id)),
    deleteDepot:    (id) => deleteDoc(doc(db,"depots",id)),

    updateEntry:    (id,d) => updateDoc(doc(db,"entries",id),d),
    updateReturn:   (id,d) => updateDoc(doc(db,"returns",id),d),
    updateInventory:(id,d) => updateDoc(doc(db,"inventories",id),d),
    updateInvoice:  (id,d) => updateDoc(doc(db,"invoices",id),d),

    setStockForProduct: (pid,qty) => updateDoc(doc(db,"products",pid), { stockQty: qty }),

    // ── Services hospitaliers ──
    addService:    s => addDoc(collection(db,"services"), { ...s, createdBy:userId, createdAt:serverTimestamp() }),
    updateService: (id,s) => updateDoc(doc(db,"services",id), s),
    deleteService: id => deleteDoc(doc(db,"services",id)),

    // ── Transferts Pharmacie → Service ──
    addTransfer: async t => {
      // Statut "en_attente" : le transfert débite immédiatement le Stock (2)
      // pharmacie (le produit part physiquement), mais ne crédite le Stock (2)
      // service qu'après confirmation de réception (voir confirmTransfer).
      // qtyConfirmed:null tant que la ligne n'a pas été contrôlée par le service.
      const itemsInit = (t.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0, expiry:it.expiry||"", lot:it.lot||"" }));
      const ref = await addDoc(collection(db,"transfers"), { ...t, items:itemsInit, transferredBy:userId, transferredByName:userName, status:"en_attente", createdAt:serverTimestamp() });
      // NB : le Stock (1) — products.stockQty — n'est PAS touché ici : un transfert
      // pharmacie→service relève uniquement du Stock (2), qui se déduit des
      // collections receptions/transfers/consumptions/svcReturns (voir StockServicePage
      // et helpers/stock2.js), sans compteur dédié.
      const itemExpiries = {}; // productId -> date de péremption la plus proche parmi les lots consommés
      for(const it of (t.items||[])){
        if(!it.productId||!it.qty) continue;
        // FEFO : on retire d'abord des lots pharmacie dont la péremption est la plus
        // proche, et on fait "voyager" ces mêmes lots vers l'emplacement du service
        // destinataire, pour que la traçabilité (et un futur FEFO côté service) suive.
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locPharmacy());
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locService(t.serviceId), source: "transfer", sourceRef: ref.id,
            userId, userName,
          });
          // La date la plus proche (premier lot pris par FEFO) sert de référence
          // affichée sur le transfert — traçabilité + correction possible si erreur.
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
        // NB : le Stock (2) service (svcStock) n'est PAS incrémenté ici — il ne le
        // sera qu'à la confirmation de réception par le service (confirmTransfer).
      }
      // Reporter la date de péremption trouvée sur les articles du transfert.
      if (Object.keys(itemExpiries).length > 0) {
        const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
        await updateDoc(doc(db,"transfers",ref.id), { items: finalItems });
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"transfer", entityId:ref.id, details:`Transfert envoyé vers ${t.serviceName} : ${t.items?.length||0} produit(s) (en attente de confirmation)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // Corrige la date de péremption (et le lot) affichée sur un article d'un
    // transfert — pour une erreur de saisie constatée après coup. Modifiable
    // par la pharmacie ET par le service au moment du contrôle. Répercute la
    // correction sur le(s) lot(s) réellement créés par ce transfert (même
    // sourceRef), pour que le suivi des péremptions reste juste.
    updateTransferItemExpiry: async (transferId, productId, newExpiry) => {
      const tSnap = await getDoc(doc(db,"transfers",transferId));
      if (!tSnap.exists()) throw new Error("Transfert introuvable");
      const t = tSnap.data();
      const newItems = (t.items||[]).map(it => it.productId===productId ? { ...it, expiry:newExpiry } : it);
      await updateDoc(doc(db,"transfers",transferId), { items:newItems });
      const batchesSnap = await getDocs(query(collection(db,"batches"), where("source","==","transfer"), where("sourceRef","==",transferId), where("productId","==",productId)));
      for (const b of batchesSnap.docs) {
        await updateDoc(doc(db,"batches",b.id), { expiry:newExpiry });
      }
      await addDoc(collection(db,"activities"), { action:"update", entity:"transfer", entityId:transferId, details:`Date de péremption corrigée (${productId}) : ${newExpiry}`, userId, userName, createdAt:serverTimestamp() });
    },

    // Même correction de péremption, pour un bon de sortie du circuit
    // fonctionnement (mêmes emplacements de lots séparés, source "sortieFonct").
    updateSortieFonctItemExpiry: async (sortieId, productId, newExpiry) => {
      const sSnap = await getDoc(doc(db,"sortiesFonct",sortieId));
      if (!sSnap.exists()) throw new Error("Bon de sortie introuvable");
      const s = sSnap.data();
      const newItems = (s.items||[]).map(it => it.productId===productId ? { ...it, expiry:newExpiry } : it);
      await updateDoc(doc(db,"sortiesFonct",sortieId), { items:newItems });
      const batchesSnap = await getDocs(query(collection(db,"batches"), where("source","==","sortieFonct"), where("sourceRef","==",sortieId), where("productId","==",productId)));
      for (const b of batchesSnap.docs) {
        await updateDoc(doc(db,"batches",b.id), { expiry:newExpiry });
      }
      await addDoc(collection(db,"activities"), { action:"update", entity:"sortieFonct", entityId:sortieId, details:`Date de péremption corrigée (${productId}) : ${newExpiry}`, userId, userName, createdAt:serverTimestamp() });
    },

    // Confirmation de réception par le service : contrôle ligne par ligne
    // (contrôle ligne par ligne : écart signé — négatif = manquant, positif =
    // surplus reçu, 0 = conforme). Seule la quantité confirmée est créditée au
    // Stock (2) du service — l'écart négatif reste "perdu en transit" tant que
    // la pharmacie n'a pas repris/corrigé le transfert.
    confirmTransfer: async (transferId, lineResults) => {
      // lineResults: [{ productId, ecart:number }]  (ecart peut être négatif ou positif)
      const tSnap = await getDoc(doc(db,"transfers",transferId));
      if (!tSnap.exists()) throw new Error("Transfert introuvable");
      const t = tSnap.data();
      const byProduct = Object.fromEntries(lineResults.map(l => [l.productId, l]));
      let allConforme = true;
      const checked = (t.items||[]).map(it => {
        const res = byProduct[it.productId];
        if (!res) return it;
        const ecart = Number(res.ecart)||0;
        const conforme = ecart === 0;
        if (!conforme) allConforme = false;
        return { ...it, conforme, ecart };
      });
      // Si l'ensemble n'est PAS conforme, aucune quantité n'entre dans le stock
      // du service — qtyConfirmed reste null pour TOUS les articles (même ceux
      // individuellement corrects), tant que la pharmacie n'a pas révisé et
      // corrigé le transfert (voir updateTransfer, désormais aussi autorisé sur
      // un transfert "non_conforme"). Seul un contrôle intégralement conforme
      // crédite le stock destinataire.
      const newItems = checked.map(it => ({ ...it, qtyConfirmed: allConforme ? Number(it.qty) : null }));
      await updateDoc(doc(db,"transfers",transferId), {
        items: newItems,
        status: allConforme ? "confirme" : "non_conforme",
        confirmedBy: userId, confirmedByName: userName, confirmedAt: serverTimestamp(),
      });
      // Crédit du Stock (2) service — uniquement si l'ensemble est conforme
      if (allConforme) {
        for (const it of newItems) {
          if (!it.productId || !it.qtyConfirmed) continue;
          const sKey = t.serviceId+"_"+it.productId;
          const sSnap = await getDoc(doc(db,"svcStock",sKey));
          const sCur = sSnap.data()?.qty || 0;
          await setDoc(doc(db,"svcStock",sKey), { serviceId:t.serviceId, productId:it.productId, qty: sCur + Number(it.qtyConfirmed) }, { merge:true });
        }
      }
      await addDoc(collection(db,"activities"), {
        action:"update", entity:"transfer", entityId:transferId,
        details: allConforme
          ? `Réception confirmée conforme : transfert vers ${t.serviceName}`
          : `Réception avec écart(s) signalée : transfert vers ${t.serviceName}`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return { allConforme };
    },

    // Annule le CONTRÔLE (confirmation) d'un transfert, côté service — préalable
    // obligatoire avant que la pharmacie puisse modifier/annuler le transfert
    // d'origine. Retire le crédit donné au Stock (2) service et remet le
    // transfert "en_attente" (le lot reste physiquement chez le service tant
    // que la pharmacie ne l'a pas repris).
    cancelTransferConfirmation: async (transferId) => {
      const tSnap = await getDoc(doc(db,"transfers",transferId));
      if (!tSnap.exists()) throw new Error("Transfert introuvable");
      const t = tSnap.data();
      if (t.status !== "confirme" && t.status !== "non_conforme") throw new Error("Ce transfert n'a pas encore été contrôlé.");
      if (t.repris) throw new Error("Ce transfert a déjà été repris par la pharmacie — sa réception ne peut plus être annulée.");
      // Vérifier qu'aucune partie de la quantité créditée n'a déjà été
      // consommée par le service — sinon impossible de tout retirer proprement.
      for (const it of (t.items||[])) {
        if (!it.productId || !it.qtyConfirmed) continue;
        const sKey = t.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        if (sCur < Number(it.qtyConfirmed)) {
          throw new Error(`Impossible d'annuler la réception : "${it.productName||"produit"}" a déjà été (au moins en partie) consommé par le service.`);
        }
      }
      for (const it of (t.items||[])) {
        if (!it.productId || !it.qtyConfirmed) continue;
        const sKey = t.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:t.serviceId, productId:it.productId, qty: Math.max(0, sCur - Number(it.qtyConfirmed)) }, { merge:true });
      }
      const resetItems = (t.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0 }));
      await updateDoc(doc(db,"transfers",transferId), {
        items: resetItems, status:"en_attente",
        confirmedBy:null, confirmedByName:null, confirmedAt:null,
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"transfer", entityId:transferId, details:`Réception annulée (service) : transfert vers ${t.serviceName} redevient modifiable`, userId, userName, createdAt:serverTimestamp() });
    },

    // Marque un transfert non conforme comme "repris" par la pharmacie et
    // réconcilie le Stock (2) pharmacie : la quantité manquante (écart négatif)
    // n'a en réalité jamais quitté la pharmacie, donc on corrige rétroactivement
    // la quantité "envoyée" (item.qty) du transfert d'origine pour qu'elle
    // corresponde à ce qui a vraiment été confirmé reçu. Comme la formule
    // Stock(2) pharmacie soustrait Σ transferts.qty, cette correction fait
    // automatiquement "revenir" la quantité manquante dans le stock — sans
    // toucher qtyConfirmed/ecart, qui restent l'historique de ce qui s'est passé.
    // Un transfert déjà repris ne peut pas l'être une seconde fois.
    reprendreTransfer: async (transferId) => {
      const tSnap = await getDoc(doc(db,"transfers",transferId));
      if (!tSnap.exists()) throw new Error("Transfert introuvable");
      const t = tSnap.data();
      if (t.repris) throw new Error("Ce transfert a déjà été repris.");
      if (t.status !== "non_conforme") throw new Error("Seul un transfert non conforme peut être repris.");
      const reconciledItems = (t.items||[]).map(it => {
        if (it.ecart < 0) {
          // La quantité réellement partie = ce qui a été confirmé reçu par le service.
          // On garde qtyOriginal pour l'affichage/traçabilité (ce qui avait été
          // annoncé comme envoyé avant la réconciliation).
          return { ...it, qtyOriginal: it.qty, qty: it.qtyConfirmed };
        }
        return it;
      });
      await updateDoc(doc(db,"transfers",transferId), {
        items: reconciledItems,
        repris: true, reprisBy: userId, reprisByName: userName, reprisAt: serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), {
        action:"update", entity:"transfer", entityId:transferId,
        details: `Transfert repris : quantité manquante réconciliée avec le stock pharmacie (vers ${t.serviceName})`,
        userId, userName, createdAt:serverTimestamp(),
      });
    },

    // Annule un transfert "en_attente" (pas encore contrôlé). Fait revenir les
    // lots physiquement à la pharmacie. Jamais de suppression : status:"annule".
    cancelTransfer: async (transferId) => {
      const tSnap = await getDoc(doc(db,"transfers",transferId));
      if (!tSnap.exists()) throw new Error("Transfert introuvable");
      const t = tSnap.data();
      if (t.status === "annule") throw new Error("Ce transfert est déjà annulé.");
      if (t.status !== "en_attente" && t.status !== "non_conforme") throw new Error("Ce transfert a déjà été confirmé conforme par le service — demandez-lui d'abord d'annuler le contrôle.");
      await reverseBatchesOf("transfer", transferId, locPharmacy(), userId, userName);
      await updateDoc(doc(db,"transfers",transferId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"transfer", entityId:transferId, details:`Transfert annulé (vers ${t.serviceName}) — quantités retournées au stock pharmacie`, userId, userName, createdAt:serverTimestamp() });
    },

    // Modifie les articles d'un transfert "en_attente" : on annule d'abord
    // proprement l'effet stock du transfert existant (lots restitués à la
    // pharmacie), puis on réapplique la nouvelle liste d'articles comme un
    // nouvel envoi — méthode simple et robuste plutôt qu'un delta fragile.
    updateTransfer: async (transferId, newData) => {
      const tSnap = await getDoc(doc(db,"transfers",transferId));
      if (!tSnap.exists()) throw new Error("Transfert introuvable");
      const t = tSnap.data();
      // Modifiable si "en_attente" (pas encore contrôlé) OU "non_conforme" (le
      // service a signalé un écart — rien n'a été crédité côté service, c'est
      // à la pharmacie de corriger les quantités anormales et resoumettre).
      if (t.status !== "en_attente" && t.status !== "non_conforme") throw new Error("Ce transfert a déjà été confirmé conforme par le service — demandez-lui d'abord d'annuler le contrôle.");
      await reverseBatchesOf("transfer", transferId, locPharmacy(), userId, userName);
      const itemsInit = (newData.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0, expiry:"", lot:"" }));
      const itemExpiries = {};
      for (const it of (newData.items||[])) {
        if (!it.productId || !it.qty) continue;
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locPharmacy());
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locService(t.serviceId), source: "transfer", sourceRef: transferId,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
      await updateDoc(doc(db,"transfers",transferId), {
        items: finalItems, notes: newData.notes ?? t.notes,
        status:"en_attente", confirmedBy:null, confirmedByName:null, confirmedAt:null,
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"transfer", entityId:transferId, details:`Transfert modifié (vers ${t.serviceName})`, userId, userName, createdAt:serverTimestamp() });
    },

    // Dossier patient persistant (indépendant de chaque consommation) — clé =
    // Patient ID directement, pour un accès direct sans requête. Utilisé pour
    // la suggestion de filiation à la ressaisie d'un Patient ID déjà connu.
    getPatient: async (patientId) => {
      const pid = (patientId||"").trim();
      if (!pid) return null;
      const snap = await getDoc(doc(db,"patients",pid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },
    // Slides du carrousel — document unique partagé (settings/carousel),
    // visible par tous dès l'écriture (écoute temps réel comme le reste).
    saveCarouselSlides: async (slides) => {
      await setDoc(doc(db,"settings","carousel"), { slides, updatedBy:userId, updatedByName:userName, updatedAt:serverTimestamp() });
    },

    upsertPatient: async (patientId, { name, birthDate }) => {
      const pid = (patientId||"").trim();
      if (!pid) return;
      await setDoc(doc(db,"patients",pid), {
        patientId: pid, name: name||"", birthDate: birthDate||"",
        updatedBy:userId, updatedByName:userName, updatedAt:serverTimestamp(),
      }, { merge:true });
    },

    addConsumption: async c => {
      const ref = await addDoc(collection(db,"consumptions"), { ...c, consumedBy:userId, consumedByName:userName, status:"actif", createdAt:serverTimestamp() });
      // Décrémenter stock service, en gardant la trace des lots FEFO consommés
      // (consumedBatches) pour pouvoir les restaurer exactement en cas d'annulation.
      const consumedBatches = [];
      for(const it of (c.items||[])){
        if(!it.productId||!it.qty) continue;
        const sKey = c.serviceId+"_"+it.productId;
        const snap = await getDoc(doc(db,"svcStock",sKey));
        const cur = snap.data()?.qty||0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:c.serviceId, productId:it.productId, qty:Math.max(0,cur-Number(it.qty)) }, { merge:true });
        // FEFO : on consomme d'abord les lots du service dont la péremption est la plus proche
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locService(c.serviceId));
        consumedBatches.push({ productId: it.productId, batches: consumed });
      }
      await updateDoc(ref, { consumedBatches });
      await addDoc(collection(db,"activities"), { action:"create", entity:"consumption", entityId:ref.id, details:`Consommation ${c.serviceName} : ${c.items?.length||0} produit(s)${c.patientName?" — Patient: "+c.patientName:""}`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // Annule une consommation : jamais supprimée (status:"annule"), le stock
    // service ET les lots FEFO exactement consommés sont restaurés.
    cancelConsumption: async (consumptionId) => {
      const cSnap = await getDoc(doc(db,"consumptions",consumptionId));
      if (!cSnap.exists()) throw new Error("Consommation introuvable");
      const c = cSnap.data();
      if (c.status === "annule") throw new Error("Cette consommation est déjà annulée.");
      await restoreConsumptionStock(c);
      await updateDoc(doc(db,"consumptions",consumptionId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"consumption", entityId:consumptionId, details:`Consommation annulée (${c.serviceName}) — quantités restituées au stock service`, userId, userName, createdAt:serverTimestamp() });
    },

    // Modifie une consommation : on restaure d'abord l'effet stock existant,
    // puis on réapplique les nouveaux articles (même logique "annule + réapplique"
    // que pour les transferts/retours).
    updateConsumption: async (consumptionId, newData) => {
      const cSnap = await getDoc(doc(db,"consumptions",consumptionId));
      if (!cSnap.exists()) throw new Error("Consommation introuvable");
      const c = cSnap.data();
      if (c.status === "annule") throw new Error("Cette consommation est annulée — impossible de la modifier.");
      await restoreConsumptionStock(c);
      const consumedBatches = [];
      for (const it of (newData.items||[])) {
        if(!it.productId||!it.qty) continue;
        const sKey = c.serviceId+"_"+it.productId;
        const snap = await getDoc(doc(db,"svcStock",sKey));
        const cur = snap.data()?.qty||0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:c.serviceId, productId:it.productId, qty:Math.max(0,cur-Number(it.qty)) }, { merge:true });
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locService(c.serviceId));
        consumedBatches.push({ productId: it.productId, batches: consumed });
      }
      await updateDoc(doc(db,"consumptions",consumptionId), {
        items:newData.items, patientId:newData.patientId, patientName:newData.patientName,
        patientBirthDate:newData.patientBirthDate, patientAge:newData.patientAge,
        note:newData.note, consumedBatches,
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"consumption", entityId:consumptionId, details:`Consommation modifiée (${c.serviceName})`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Retours Service → Pharmacie ──
    addSvcReturn: async r => {
      const itemsInit = (r.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0, expiry:it.expiry||"", lot:it.lot||"" }));
      const ref = await addDoc(collection(db,"svcReturns"), { ...r, items:itemsInit, returnedBy:userId, returnedByName:userName, status:"en_attente", createdAt:serverTimestamp() });
      // NB : le Stock (1) n'est PAS touché ici — un retour service→pharmacie relève
      // uniquement du Stock (2) (voir remarque dans addTransfer). Comme pour les
      // transferts, le côté émetteur (ici le service) est débité immédiatement ;
      // le côté receveur (la pharmacie) n'est crédité qu'après confirmation
      // (voir confirmSvcReturn) — getPharmacyStock2 ne compte que qtyConfirmed.
      const itemExpiries = {};
      for(const it of (r.items||[])){
        if(!it.productId||!it.qty) continue;
        // Décrémenter stock service
        const sKey = r.serviceId+"_"+it.productId;
        const snap = await getDoc(doc(db,"svcStock",sKey));
        const cur = snap.data()?.qty||0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty:Math.max(0,cur-Number(it.qty)) }, { merge:true });
        // FEFO : on retire d'abord des lots du service dont la péremption est la plus
        // proche, et on les fait "revenir" vers l'emplacement pharmacie.
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locService(r.serviceId));
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locPharmacy(), source: "svcReturn", sourceRef: ref.id,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      if (Object.keys(itemExpiries).length > 0) {
        const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
        await updateDoc(doc(db,"svcReturns",ref.id), { items: finalItems });
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"svcReturn", entityId:ref.id, details:`Retour de ${r.serviceName} vers pharmacie : ${r.items?.length||0} produit(s) (en attente de contrôle)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // Corrige la date de péremption (et le lot) affichée sur un article d'un
    // retour service — modifiable par le service ET par la pharmacie au moment
    // du contrôle. Répercute la correction sur le(s) lot(s) créés par ce retour.
    updateSvcReturnItemExpiry: async (returnId, productId, newExpiry) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      const newItems = (r.items||[]).map(it => it.productId===productId ? { ...it, expiry:newExpiry } : it);
      await updateDoc(doc(db,"svcReturns",returnId), { items:newItems });
      const batchesSnap = await getDocs(query(collection(db,"batches"), where("source","==","svcReturn"), where("sourceRef","==",returnId), where("productId","==",productId)));
      for (const b of batchesSnap.docs) {
        await updateDoc(doc(db,"batches",b.id), { expiry:newExpiry });
      }
      await addDoc(collection(db,"activities"), { action:"update", entity:"svcReturn", entityId:returnId, details:`Date de péremption corrigée (${productId}) : ${newExpiry}`, userId, userName, createdAt:serverTimestamp() });
    },

    // Contrôle de réception d'un retour service, par la pharmacie. Même logique
    // que confirmTransfer : écart signé (négatif=manquant, positif=surplus, 0=conforme).
    confirmSvcReturn: async (returnId, lineResults) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      const byProduct = Object.fromEntries(lineResults.map(l => [l.productId, l]));
      let allConforme = true;
      const checked = (r.items||[]).map(it => {
        const res = byProduct[it.productId];
        if (!res) return it;
        const ecart = Number(res.ecart)||0;
        const conforme = ecart === 0;
        if (!conforme) allConforme = false;
        return { ...it, conforme, ecart };
      });
      // Si l'ensemble n'est PAS conforme, aucune quantité n'entre dans le stock
      // pharmacie — qtyConfirmed reste null pour tous les articles tant que le
      // service n'a pas révisé et corrigé le retour (updateSvcReturn, désormais
      // aussi autorisé sur un retour "non_conforme").
      const newItems = checked.map(it => ({ ...it, qtyConfirmed: allConforme ? Number(it.qty) : null }));
      await updateDoc(doc(db,"svcReturns",returnId), {
        items: newItems,
        status: allConforme ? "confirme" : "non_conforme",
        confirmedBy: userId, confirmedByName: userName, confirmedAt: serverTimestamp(),
      });
      // Pas d'écriture supplémentaire nécessaire côté stock : getPharmacyStock2
      // se base directement sur qtyConfirmed pour le terme "retour".
      await addDoc(collection(db,"activities"), {
        action:"update", entity:"svcReturn", entityId:returnId,
        details: allConforme
          ? `Réception du retour confirmée conforme : de ${r.serviceName}`
          : `Réception du retour avec écart(s) signalée : de ${r.serviceName}`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return { allConforme };
    },

    // Annule le CONTRÔLE (confirmation) d'un retour, côté pharmacie — préalable
    // obligatoire avant que le service puisse modifier/annuler le retour
    // d'origine. Le crédit "retour" côté Stock (2) pharmacie disparaît
    // automatiquement dès que qtyConfirmed repasse à null (getPharmacyStock2
    // ne compte que les retours confirmés).
    cancelSvcReturnConfirmation: async (returnId) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      if (r.status !== "confirme" && r.status !== "non_conforme") throw new Error("Ce retour n'a pas encore été contrôlé.");
      if (r.repris) throw new Error("Ce retour a déjà été repris par le service — son contrôle ne peut plus être annulé.");
      const resetItems = (r.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0 }));
      await updateDoc(doc(db,"svcReturns",returnId), {
        items: resetItems, status:"en_attente",
        confirmedBy:null, confirmedByName:null, confirmedAt:null,
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"svcReturn", entityId:returnId, details:`Contrôle annulé (pharmacie) : retour de ${r.serviceName} redevient modifiable`, userId, userName, createdAt:serverTimestamp() });
    },

    // Marque un retour non conforme comme "repris" par le service et réconcilie
    // le Stock (2) service : la quantité manquante (écart négatif) n'a en
    // réalité jamais quitté le service, donc on corrige rétroactivement la
    // quantité "retournée" (item.qty) du retour d'origine, et on la recrédite
    // à svcStock (le compteur dénormalisé utilisé par Consommations/Retours).
    reprendreSvcReturn: async (returnId) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      if (r.repris) throw new Error("Ce retour a déjà été repris.");
      if (r.status !== "non_conforme") throw new Error("Seul un retour non conforme peut être repris.");
      const reconciledItems = (r.items||[]).map(it => {
        if (it.ecart < 0) {
          return { ...it, qtyOriginal: it.qty, qty: it.qtyConfirmed };
        }
        return it;
      });
      for (const it of (r.items||[])) {
        if (it.ecart < 0 && it.productId) {
          const manque = Math.abs(it.ecart);
          const sKey = r.serviceId+"_"+it.productId;
          const sSnap = await getDoc(doc(db,"svcStock",sKey));
          const sCur = sSnap.data()?.qty || 0;
          await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty: sCur + manque }, { merge:true });
        }
      }
      await updateDoc(doc(db,"svcReturns",returnId), {
        items: reconciledItems,
        repris: true, reprisBy: userId, reprisByName: userName, reprisAt: serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), {
        action:"update", entity:"svcReturn", entityId:returnId,
        details: `Retour repris : quantité manquante recréditée au stock service (${r.serviceName})`,
        userId, userName, createdAt:serverTimestamp(),
      });
    },

    // Annule un retour "en_attente" (pas encore contrôlé). Fait revenir les
    // lots physiquement au service et recrédite svcStock. Jamais de suppression.
    cancelSvcReturn: async (returnId) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Ce retour est déjà annulé.");
      if (r.status !== "en_attente" && r.status !== "non_conforme") throw new Error("Ce retour a déjà été confirmé conforme par la pharmacie — demandez-lui d'abord d'annuler le contrôle.");
      await reverseBatchesOf("svcReturn", returnId, locService(r.serviceId), userId, userName);
      for (const it of (r.items||[])) {
        if (!it.productId || !it.qty) continue;
        const sKey = r.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty: sCur + Number(it.qty) }, { merge:true });
      }
      await updateDoc(doc(db,"svcReturns",returnId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"svcReturn", entityId:returnId, details:`Retour annulé (${r.serviceName}) — quantités restituées au stock service`, userId, userName, createdAt:serverTimestamp() });
    },

    // Modifie les articles d'un retour "en_attente" — même principe qu'updateTransfer.
    updateSvcReturn: async (returnId, newData) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      // Modifiable si "en_attente" OU "non_conforme" (rien n'a été crédité côté
      // pharmacie — c'est au service de corriger les quantités anormales).
      if (r.status !== "en_attente" && r.status !== "non_conforme") throw new Error("Ce retour a déjà été confirmé conforme par la pharmacie — demandez-lui d'abord d'annuler le contrôle.");
      await reverseBatchesOf("svcReturn", returnId, locService(r.serviceId), userId, userName);
      for (const it of (r.items||[])) {
        if (!it.productId || !it.qty) continue;
        const sKey = r.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty: sCur + Number(it.qty) }, { merge:true });
      }
      const itemsInit = (newData.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0, expiry:"", lot:"" }));
      const itemExpiries = {};
      for (const it of (newData.items||[])) {
        if (!it.productId || !it.qty) continue;
        const sKey = r.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty: Math.max(0,sCur - Number(it.qty)) }, { merge:true });
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locService(r.serviceId));
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locPharmacy(), source: "svcReturn", sourceRef: returnId,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
      await updateDoc(doc(db,"svcReturns",returnId), {
        items: finalItems, notes: newData.notes ?? r.notes,
        status:"en_attente", confirmedBy:null, confirmedByName:null, confirmedAt:null,
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"svcReturn", entityId:returnId, details:`Retour modifié (${r.serviceName})`, userId, userName, createdAt:serverTimestamp() });
    },

    getSvcStock: (serviceId, productId) => {
      // Retourner depuis le state local (mis à jour par listener)
      return 0; // sera calculé depuis svcStock
    },

    // ── Réceptions Service (Fournisseur → Pharmacie pour traçabilité service) ──
    addReception: async r => {
      const ref = await addDoc(collection(db,"receptions"), {
        ...r, receivedBy:userId, receivedByName:userName,
        status:"reçu", createdAt:serverTimestamp(),
      });
      // Un lot est créé pour chaque article réceptionné (même sans date de
      // péremption renseignée — il sera alors consommé en dernier par FEFO),
      // à l'emplacement "pharmacy". C'est le point d'entrée du Stock (2).
      for (const it of (r.items||[])) {
        if (!it.productId || !Number(it.qty)) continue;
        await createBatch({
          productId: it.productId, productName: it.productName,
          lot: it.lot, expiry: it.expiry, qty: it.qty,
          location: locPharmacy(), source: "reception", sourceRef: ref.id,
          userId, userName,
        });
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"reception", entityId:ref.id,
        details:`Réception : ${r.reference} — ${r.supplierName||""} (${r.items?.length||0} produit(s))`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return ref;
    },

    // Annule une réception : bloqué si une partie a déjà été transférée
    // ailleurs (le lot correspondant a alors qtyRemaining < qtyInitial).
    // Jamais de suppression : status:"annule", lots neutralisés (mis à zéro).
    cancelReception: async (receptionId) => {
      const rSnap = await getDoc(doc(db,"receptions",receptionId));
      if (!rSnap.exists()) throw new Error("Réception introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Cette réception est déjà annulée.");
      const batches = await getBatchesFor("reception", receptionId);
      for (const b of batches) {
        if (b.qtyRemaining < b.qtyInitial) {
          throw new Error(`Impossible d'annuler : quantité insuffisante (${b.productName||"produit"} déjà transférée).`);
        }
      }
      for (const b of batches) {
        await updateDoc(doc(db,"batches",b.id), { qtyRemaining:0, qtyInitial:0 });
      }
      await updateDoc(doc(db,"receptions",receptionId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"reception", entityId:receptionId, details:`Réception annulée : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    // Modifie les articles d'une réception : bloqué article par article si la
    // nouvelle quantité est inférieure à ce qui a déjà été transféré depuis le
    // lot correspondant (même contrainte que l'annulation, mais localisée).
    updateReception: async (receptionId, newData) => {
      const rSnap = await getDoc(doc(db,"receptions",receptionId));
      if (!rSnap.exists()) throw new Error("Réception introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Cette réception est annulée — impossible de la modifier.");
      const batches = await getBatchesFor("reception", receptionId);
      const newItems = newData.items||[];
      for (const b of batches) {
        const consumedSoFar = b.qtyInitial - b.qtyRemaining;
        const target = newItems.find(i=>i.productId===b.productId);
        const targetQty = target ? Number(target.qty||0) : 0;
        if (consumedSoFar > targetQty) {
          throw new Error(`Impossible de modifier "${b.productName||"produit"}" : quantité insuffisante (déjà transférée).`);
        }
      }
      // Ajuster chaque lot existant au nouveau montant ; créer un lot pour un
      // article ajouté qui n'existait pas dans la réception d'origine.
      for (const it of newItems) {
        if (!it.productId) continue;
        const b = batches.find(x=>x.productId===it.productId);
        const newQty = Number(it.qty||0);
        if (b) {
          const consumedSoFar = b.qtyInitial - b.qtyRemaining;
          await updateDoc(doc(db,"batches",b.id), { qtyInitial:newQty, qtyRemaining: newQty - consumedSoFar, lot:it.lot||b.lot, expiry:it.expiry||b.expiry });
        } else if (newQty > 0) {
          await createBatch({ productId:it.productId, productName:it.productName, lot:it.lot, expiry:it.expiry, qty:newQty, location:locPharmacy(), source:"reception", sourceRef:receptionId, userId, userName });
        }
      }
      // Article retiré de la réception (absent des newItems) : neutraliser son lot.
      for (const b of batches) {
        if (!newItems.some(i=>i.productId===b.productId)) {
          await updateDoc(doc(db,"batches",b.id), { qtyInitial:0, qtyRemaining:0 });
        }
      }
      await updateDoc(doc(db,"receptions",receptionId), {
        items:newItems, notes:newData.notes ?? r.notes,
        attachmentUrl: newData.attachmentUrl ?? r.attachmentUrl ?? "",
        attachmentName: newData.attachmentName ?? r.attachmentName ?? "",
        attachmentType: newData.attachmentType ?? r.attachmentType ?? "",
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"reception", entityId:receptionId, details:`Réception modifiée : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Bon d'Entrée — circuit fonctionnement (Comptabilité Matières) ──
    // Copie fidèle du modèle addReception/cancelReception/updateReception
    // ci-dessus, mais collection et emplacements de lots séparés (circuit
    // totalement indépendant du circuit vente).
    addEntreeFonct: async r => {
      const ref = await addDoc(collection(db,"entreesFonct"), {
        ...r, receivedBy:userId, receivedByName:userName,
        status:"reçu", createdAt:serverTimestamp(),
      });
      for (const it of (r.items||[])) {
        if (!it.productId || !Number(it.qty)) continue;
        await createBatch({
          productId: it.productId, productName: it.productName,
          lot: it.lot, expiry: it.expiry, qty: it.qty,
          location: locFonctPharmacy(), source: "entreeFonct", sourceRef: ref.id,
          userId, userName,
        });
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"entreeFonct", entityId:ref.id,
        details:`Bon d'entrée (fonctionnement) : ${r.reference} — ${r.supplierName||""} (${r.items?.length||0} produit(s))`,
        userId, userName, createdAt:serverTimestamp(),
      });
      await createPvIfNeeded("fonctionnement", ref.id, r);
      return ref;
    },

    cancelEntreeFonct: async (entreeId) => {
      const rSnap = await getDoc(doc(db,"entreesFonct",entreeId));
      if (!rSnap.exists()) throw new Error("Bon d'entrée introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Ce bon d'entrée est déjà annulé.");
      const batches = await getBatchesFor("entreeFonct", entreeId);
      for (const b of batches) {
        if (b.qtyRemaining < b.qtyInitial) {
          throw new Error(`Impossible d'annuler : quantité insuffisante (${b.productName||"produit"} déjà sortie).`);
        }
      }
      for (const b of batches) {
        await updateDoc(doc(db,"batches",b.id), { qtyRemaining:0, qtyInitial:0 });
      }
      await updateDoc(doc(db,"entreesFonct",entreeId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"entreeFonct", entityId:entreeId, details:`Bon d'entrée (fonctionnement) annulé : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    updateEntreeFonct: async (entreeId, newData) => {
      const rSnap = await getDoc(doc(db,"entreesFonct",entreeId));
      if (!rSnap.exists()) throw new Error("Bon d'entrée introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Ce bon d'entrée est annulé — impossible de le modifier.");
      const batches = await getBatchesFor("entreeFonct", entreeId);
      const newItems = newData.items||[];
      for (const b of batches) {
        const consumedSoFar = b.qtyInitial - b.qtyRemaining;
        const target = newItems.find(i=>i.productId===b.productId);
        const targetQty = target ? Number(target.qty||0) : 0;
        if (consumedSoFar > targetQty) {
          throw new Error(`Impossible de modifier "${b.productName||"produit"}" : quantité insuffisante (déjà sortie).`);
        }
      }
      for (const it of newItems) {
        if (!it.productId) continue;
        const b = batches.find(x=>x.productId===it.productId);
        const newQty = Number(it.qty||0);
        if (b) {
          const consumedSoFar = b.qtyInitial - b.qtyRemaining;
          await updateDoc(doc(db,"batches",b.id), { qtyInitial:newQty, qtyRemaining: newQty - consumedSoFar, lot:it.lot||b.lot, expiry:it.expiry||b.expiry });
        } else if (newQty > 0) {
          await createBatch({ productId:it.productId, productName:it.productName, lot:it.lot, expiry:it.expiry, qty:newQty, location:locFonctPharmacy(), source:"entreeFonct", sourceRef:entreeId, userId, userName });
        }
      }
      for (const b of batches) {
        if (!newItems.some(i=>i.productId===b.productId)) {
          await updateDoc(doc(db,"batches",b.id), { qtyInitial:0, qtyRemaining:0 });
        }
      }
      await updateDoc(doc(db,"entreesFonct",entreeId), {
        items:newItems, notes:newData.notes ?? r.notes,
        attachmentUrl: newData.attachmentUrl ?? r.attachmentUrl ?? "",
        attachmentName: newData.attachmentName ?? r.attachmentName ?? "",
        attachmentType: newData.attachmentType ?? r.attachmentType ?? "",
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"entreeFonct", entityId:entreeId, details:`Bon d'entrée (fonctionnement) modifié : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Bon de Sortie — circuit fonctionnement (Comptabilité Matières) ──
    // Envoi DIRECT vers le service, sans étape de contrôle/confirmation côté
    // service (convenu explicitement — à la différence des Transferts du
    // circuit vente). Le stock du service est donc crédité immédiatement.
    addSortieFonct: async s => {
      const itemsInit = (s.items||[]).map(it => ({ ...it, expiry:it.expiry||"", lot:it.lot||"" }));
      const ref = await addDoc(collection(db,"sortiesFonct"), {
        ...s, items:itemsInit, sentBy:userId, sentByName:userName, status:"envoye", createdAt:serverTimestamp(),
      });
      const itemExpiries = {};
      for (const it of (s.items||[])) {
        if (!it.productId || !Number(it.qty)) continue;
        // FEFO côté pharmacie fonctionnement, puis les mêmes lots "voyagent"
        // vers l'emplacement du service — même mécanique que les transferts.
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locFonctPharmacy());
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locFonctService(s.serviceId), source: "sortieFonct", sourceRef: ref.id,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      if (Object.keys(itemExpiries).length > 0) {
        const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
        await updateDoc(doc(db,"sortiesFonct",ref.id), { items: finalItems });
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"sortieFonct", entityId:ref.id,
        details:`Bon de sortie (fonctionnement) vers ${s.serviceName} : ${s.items?.length||0} produit(s)`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return ref;
    },

    cancelSortieFonct: async (sortieId) => {
      const sSnap = await getDoc(doc(db,"sortiesFonct",sortieId));
      if (!sSnap.exists()) throw new Error("Bon de sortie introuvable");
      const s = sSnap.data();
      if (s.status === "annule") throw new Error("Ce bon de sortie est déjà annulé.");
      await reverseBatchesOf("sortieFonct", sortieId, locFonctPharmacy(), userId, userName);
      await updateDoc(doc(db,"sortiesFonct",sortieId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"sortieFonct", entityId:sortieId, details:`Bon de sortie (fonctionnement) annulé : vers ${s.serviceName}`, userId, userName, createdAt:serverTimestamp() });
    },

    updateSortieFonct: async (sortieId, newData) => {
      const sSnap = await getDoc(doc(db,"sortiesFonct",sortieId));
      if (!sSnap.exists()) throw new Error("Bon de sortie introuvable");
      const s = sSnap.data();
      if (s.status === "annule") throw new Error("Ce bon de sortie est annulé — impossible de le modifier.");
      await reverseBatchesOf("sortieFonct", sortieId, locFonctPharmacy(), userId, userName);
      const itemsInit = (newData.items||[]).map(it => ({ ...it, expiry:"", lot:"" }));
      const itemExpiries = {};
      for (const it of (newData.items||[])) {
        if (!it.productId || !it.qty) continue;
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locFonctPharmacy());
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locFonctService(s.serviceId), source: "sortieFonct", sourceRef: sortieId,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
      await updateDoc(doc(db,"sortiesFonct",sortieId), { items: finalItems, notes: newData.notes ?? s.notes });
      await addDoc(collection(db,"activities"), { action:"update", entity:"sortieFonct", entityId:sortieId, details:`Bon de sortie (fonctionnement) modifié : vers ${s.serviceName}`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Bon d'Entrée — circuit non pharmaceutique ──
    // Copie fidèle du modèle Entrée Fonctionnement, collection et emplacements
    // de lots séparés (circuit totalement indépendant).
    addEntreeNp: async r => {
      const ref = await addDoc(collection(db,"entreesNp"), {
        ...r, receivedBy:userId, receivedByName:userName,
        status:"reçu", createdAt:serverTimestamp(),
      });
      for (const it of (r.items||[])) {
        if (!it.productId || !Number(it.qty)) continue;
        await createBatch({
          productId: it.productId, productName: it.productName,
          lot: it.lot, expiry: it.expiry, qty: it.qty,
          location: locNpPharmacy(), source: "entreeNp", sourceRef: ref.id,
          userId, userName,
        });
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"entreeNp", entityId:ref.id,
        details:`Bon d'entrée (non pharmaceutique) : ${r.reference} — ${r.supplierName||""} (${r.items?.length||0} produit(s))`,
        userId, userName, createdAt:serverTimestamp(),
      });
      await createPvIfNeeded("non_pharmaceutique", ref.id, r);
      return ref;
    },

    cancelEntreeNp: async (entreeId) => {
      const rSnap = await getDoc(doc(db,"entreesNp",entreeId));
      if (!rSnap.exists()) throw new Error("Bon d'entrée introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Ce bon d'entrée est déjà annulé.");
      const batches = await getBatchesFor("entreeNp", entreeId);
      for (const b of batches) {
        if (b.qtyRemaining < b.qtyInitial) {
          throw new Error(`Impossible d'annuler : quantité insuffisante (${b.productName||"produit"} déjà sortie).`);
        }
      }
      for (const b of batches) {
        await updateDoc(doc(db,"batches",b.id), { qtyRemaining:0, qtyInitial:0 });
      }
      await updateDoc(doc(db,"entreesNp",entreeId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"entreeNp", entityId:entreeId, details:`Bon d'entrée (non pharmaceutique) annulé : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    updateEntreeNp: async (entreeId, newData) => {
      const rSnap = await getDoc(doc(db,"entreesNp",entreeId));
      if (!rSnap.exists()) throw new Error("Bon d'entrée introuvable");
      const r = rSnap.data();
      if (r.status === "annule") throw new Error("Ce bon d'entrée est annulé — impossible de le modifier.");
      const batches = await getBatchesFor("entreeNp", entreeId);
      const newItems = newData.items||[];
      for (const b of batches) {
        const consumedSoFar = b.qtyInitial - b.qtyRemaining;
        const target = newItems.find(i=>i.productId===b.productId);
        const targetQty = target ? Number(target.qty||0) : 0;
        if (consumedSoFar > targetQty) {
          throw new Error(`Impossible de modifier "${b.productName||"produit"}" : quantité insuffisante (déjà sortie).`);
        }
      }
      for (const it of newItems) {
        if (!it.productId) continue;
        const b = batches.find(x=>x.productId===it.productId);
        const newQty = Number(it.qty||0);
        if (b) {
          const consumedSoFar = b.qtyInitial - b.qtyRemaining;
          await updateDoc(doc(db,"batches",b.id), { qtyInitial:newQty, qtyRemaining: newQty - consumedSoFar, lot:it.lot||b.lot, expiry:it.expiry||b.expiry });
        } else if (newQty > 0) {
          await createBatch({ productId:it.productId, productName:it.productName, lot:it.lot, expiry:it.expiry, qty:newQty, location:locNpPharmacy(), source:"entreeNp", sourceRef:entreeId, userId, userName });
        }
      }
      for (const b of batches) {
        if (!newItems.some(i=>i.productId===b.productId)) {
          await updateDoc(doc(db,"batches",b.id), { qtyInitial:0, qtyRemaining:0 });
        }
      }
      await updateDoc(doc(db,"entreesNp",entreeId), {
        items:newItems, notes:newData.notes ?? r.notes,
        attachmentUrl: newData.attachmentUrl ?? r.attachmentUrl ?? "",
        attachmentName: newData.attachmentName ?? r.attachmentName ?? "",
        attachmentType: newData.attachmentType ?? r.attachmentType ?? "",
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"entreeNp", entityId:entreeId, details:`Bon d'entrée (non pharmaceutique) modifié : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Bon de Sortie — circuit non pharmaceutique ──
    // Envoi direct, comme le circuit fonctionnement. Peut en plus répondre à
    // une Demande d'un service (s.demandeId) : dans ce cas, la demande est
    // marquée "traitée" et gardera la trace demandé/envoyé par produit — y
    // compris les articles que le comptable a retirés (qtyEnvoyee:0).
    addSortieNp: async s => {
      const itemsInit = (s.items||[]).map(it => ({ ...it, expiry:it.expiry||"", lot:it.lot||"" }));
      const ref = await addDoc(collection(db,"sortiesNp"), {
        ...s, items:itemsInit, sentBy:userId, sentByName:userName, status:"envoye", createdAt:serverTimestamp(),
      });
      const itemExpiries = {};
      for (const it of (s.items||[])) {
        if (!it.productId || !Number(it.qty)) continue;
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locNpPharmacy());
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locNpService(s.serviceId), source: "sortieNp", sourceRef: ref.id,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      if (Object.keys(itemExpiries).length > 0) {
        const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
        await updateDoc(doc(db,"sortiesNp",ref.id), { items: finalItems });
      }
      // Répond à une demande, le cas échéant : trace demandé/envoyé par
      // produit, y compris les articles retirés (présents dans la demande
      // d'origine mais absents de s.items ici → qtyEnvoyee 0).
      if (s.demandeId) {
        const dSnap = await getDoc(doc(db,"demandes",s.demandeId));
        if (dSnap.exists() && dSnap.data().status==="attente") {
          const d = dSnap.data();
          const sentByProduct = {};
          (s.items||[]).forEach(it => { sentByProduct[it.productId] = Number(it.qty)||0; });
          const finalDemandeItems = (d.items||[]).map(it => {
            const qtyEnvoyee = sentByProduct[it.productId] ?? 0;
            return { productId:it.productId, productName:it.productName, qtyDemandee:it.qtyDemandee, qtyEnvoyee, fourni: qtyEnvoyee>0 };
          });
          await updateDoc(doc(db,"demandes",s.demandeId), {
            items: finalDemandeItems, status:"traite", sortieRef: ref.id,
            processedBy:userId, processedByName:userName, processedAt:serverTimestamp(),
          });
        }
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"sortieNp", entityId:ref.id,
        details:`Bon de sortie (non pharmaceutique) vers ${s.serviceName} : ${s.items?.length||0} produit(s)`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return ref;
    },

    cancelSortieNp: async (sortieId) => {
      const sSnap = await getDoc(doc(db,"sortiesNp",sortieId));
      if (!sSnap.exists()) throw new Error("Bon de sortie introuvable");
      const s = sSnap.data();
      if (s.status === "annule") throw new Error("Ce bon de sortie est déjà annulé.");
      await reverseBatchesOf("sortieNp", sortieId, locNpPharmacy(), userId, userName);
      await updateDoc(doc(db,"sortiesNp",sortieId), { status:"annule", cancelledBy:userId, cancelledByName:userName, cancelledAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"sortieNp", entityId:sortieId, details:`Bon de sortie (non pharmaceutique) annulé : vers ${s.serviceName}`, userId, userName, createdAt:serverTimestamp() });
    },

    updateSortieNp: async (sortieId, newData) => {
      const sSnap = await getDoc(doc(db,"sortiesNp",sortieId));
      if (!sSnap.exists()) throw new Error("Bon de sortie introuvable");
      const s = sSnap.data();
      if (s.status === "annule") throw new Error("Ce bon de sortie est annulé — impossible de le modifier.");
      await reverseBatchesOf("sortieNp", sortieId, locNpPharmacy(), userId, userName);
      const itemsInit = (newData.items||[]).map(it => ({ ...it, expiry:"", lot:"" }));
      const itemExpiries = {};
      for (const it of (newData.items||[])) {
        if (!it.productId || !it.qty) continue;
        const { consumed } = await consumeFEFO(it.productId, Number(it.qty), locNpPharmacy());
        for (const c of consumed) {
          await createBatch({
            productId: it.productId, productName: it.productName,
            lot: c.lot, expiry: c.expiry, qty: c.qty,
            location: locNpService(s.serviceId), source: "sortieNp", sourceRef: sortieId,
            userId, userName,
          });
          if (!itemExpiries[it.productId] || (c.expiry && c.expiry < itemExpiries[it.productId].expiry)) {
            itemExpiries[it.productId] = { expiry: c.expiry||"", lot: c.lot||"" };
          }
        }
      }
      const finalItems = itemsInit.map(it => itemExpiries[it.productId] ? { ...it, ...itemExpiries[it.productId] } : it);
      await updateDoc(doc(db,"sortiesNp",sortieId), { items: finalItems, notes: newData.notes ?? s.notes });
      await addDoc(collection(db,"activities"), { action:"update", entity:"sortieNp", entityId:sortieId, details:`Bon de sortie (non pharmaceutique) modifié : vers ${s.serviceName}`, userId, userName, createdAt:serverTimestamp() });
    },

    updateSortieNpItemExpiry: async (sortieId, productId, newExpiry) => {
      const sSnap = await getDoc(doc(db,"sortiesNp",sortieId));
      if (!sSnap.exists()) throw new Error("Bon de sortie introuvable");
      const s = sSnap.data();
      const newItems = (s.items||[]).map(it => it.productId===productId ? { ...it, expiry:newExpiry } : it);
      await updateDoc(doc(db,"sortiesNp",sortieId), { items:newItems });
      const batchesSnap = await getDocs(query(collection(db,"batches"), where("source","==","sortieNp"), where("sourceRef","==",sortieId), where("productId","==",productId)));
      for (const b of batchesSnap.docs) {
        await updateDoc(doc(db,"batches",b.id), { expiry:newExpiry });
      }
      await addDoc(collection(db,"activities"), { action:"update", entity:"sortieNp", entityId:sortieId, details:`Date de péremption corrigée (${productId}) : ${newExpiry}`, userId, userName, createdAt:serverTimestamp() });
    },

    createStock2InventoryNp: async (scope, lines) => {
      const isPharmacy = scope === "np-pharmacy";
      const refs = [];
      for (const l of lines) {
        if (!l.productId) continue;
        const ecart = Number(l.countedQty) - Number(l.computedQty);
        const ref = await addDoc(collection(db,"stock2InventoriesNp"), {
          scope, productId:l.productId, productName:l.productName||"",
          computedQty:Number(l.computedQty)||0, countedQty:Number(l.countedQty)||0, ecart,
          status: isPharmacy ? "confirme" : "attente",
          createdBy:userId, createdByName:userName, createdAt:serverTimestamp(),
          confirmedBy: isPharmacy ? userId : null, confirmedByName: isPharmacy ? userName : null,
          confirmedAt: isPharmacy ? serverTimestamp() : null,
        });
        refs.push(ref.id);
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"stock2InventoryNp", entityId:refs.join(","),
        details: `Inventaire Non Pharmaceutique ${isPharmacy?"Pharmacie":"— "+scope} : ${lines.length} produit(s) compté(s)`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return refs;
    },

    // ── Paramètres PV (Procès-Verbaux de réception) ──
    // Fonctions : liste partagée de titres (ex: "Comptable Matière Principal").
    addPvFonction: async (name) => {
      const n = (name||"").trim();
      if (!n) throw new Error("Le nom de la fonction est obligatoire.");
      const ref = await addDoc(collection(db,"pvFonctions"), { name:n, createdBy:userId, createdByName:userName, createdAt:serverTimestamp() });
      return ref.id;
    },
    renamePvFonction: async (id, name) => {
      const n = (name||"").trim();
      if (!n) throw new Error("Le nom de la fonction est obligatoire.");
      await updateDoc(doc(db,"pvFonctions",id), { name:n });
    },
    deletePvFonction: async (id) => { await deleteDoc(doc(db,"pvFonctions",id)); },

    // Responsables : la commission FIXE d'un circuit (personne + fonction +
    // intérimaire éventuel), dans l'ordre d'affichage/signature souhaité.
    addPvResponsable: async (circuit, fonctionName, personName, interimName) => {
      if (!personName?.trim()) throw new Error("Le nom du responsable est obligatoire.");
      const order = (pvResponsables||[]).filter(r=>r.circuit===circuit).length;
      const ref = await addDoc(collection(db,"pvResponsables"), {
        circuit, fonctionName:fonctionName||"", personName:personName.trim(), interimName:interimName||"",
        order, createdBy:userId, createdByName:userName, createdAt:serverTimestamp(),
      });
      return ref.id;
    },
    updatePvResponsable: async (id, data) => {
      await updateDoc(doc(db,"pvResponsables",id), {
        fonctionName: data.fonctionName||"", personName:(data.personName||"").trim(), interimName:data.interimName||"",
      });
    },
    deletePvResponsable: async (id) => { await deleteDoc(doc(db,"pvResponsables",id)); },
    // Échange l'ordre d'affichage de deux responsables du même circuit — sert
    // aux flèches ↑/↓ dans Paramètres. L'ordre déterminé ici est celui du
    // tableau imprimé sur le PV (1, 2, 3...).
    movePvResponsable: async (circuit, id, direction) => {
      const list = (pvResponsables||[]).filter(r=>r.circuit===circuit).sort((a,b)=>(a.order||0)-(b.order||0));
      const idx = list.findIndex(r=>r.id===id);
      const swapIdx = direction==="up" ? idx-1 : idx+1;
      if (idx===-1 || swapIdx<0 || swapIdx>=list.length) return;
      const a = list[idx], b = list[swapIdx];
      await updateDoc(doc(db,"pvResponsables",a.id), { order: b.order??swapIdx });
      await updateDoc(doc(db,"pvResponsables",b.id), { order: a.order??idx });
    },

    // Réglages par circuit (seuil de déclenchement, préfixe du numéro de PV)
    // — un seul document par circuit, identifié par sa clé de circuit.
    setPvSettings: async (circuit, { seuil, prefix, label, icon }) => {
      const data = { circuit, updatedBy:userId, updatedByName:userName, updatedAt:serverTimestamp() };
      if (seuil !== undefined) data.seuil = Number(seuil)||0;
      if (prefix !== undefined) data.prefix = (prefix||"").trim();
      if (label !== undefined) data.label = (label||"").trim();
      if (icon !== undefined) data.icon = (icon||"").trim();
      await setDoc(doc(db,"pvSettings",circuit), data, { merge:true });
    },

    // ── Inventaire Stock (2) ──
    // Un ajustement par produit compté, jamais un "gros document" avec une
    // liste imbriquée — cohérent avec le reste (batches, etc.), plus simple à
    // confirmer/rejeter ligne par ligne. scope = "pharmacy" ou "service:<id>".
    // Côté pharmacie : confirmé immédiatement (l'agent qui compte est déjà
    // légitime sur son propre domaine). Côté service : reste "attente" tant
    // qu'un agent DE CE SERVICE (et lui seul) n'a pas confirmé — voir
    // confirmStock2Inventory, dont la permission est vérifiée par les règles
    // Firestore (userServiceId doit correspondre au service de la ligne).
    createStock2Inventory: async (scope, lines) => {
      const isPharmacy = scope === "pharmacy";
      // Un sessionId commun regroupe les lignes d'un même passage d'inventaire
      // (une session = plusieurs produits comptés en une fois) — sans lui,
      // impossible d'afficher "la liste des inventaires" plutôt que "la liste
      // des produits" (chaque produit reste un document séparé pour permettre
      // à un service de confirmer/rejeter ligne par ligne).
      const sessionId = Date.now().toString(36)+Math.random().toString(36).slice(2,8);
      const refs = [];
      for (const l of lines) {
        if (!l.productId) continue;
        const ecart = Number(l.countedQty) - Number(l.computedQty);
        const ref = await addDoc(collection(db,"stock2Inventories"), {
          sessionId, scope, productId:l.productId, productName:l.productName||"",
          computedQty:Number(l.computedQty)||0, countedQty:Number(l.countedQty)||0, ecart,
          status: isPharmacy ? "confirme" : "attente",
          createdBy:userId, createdByName:userName, createdAt:serverTimestamp(),
          confirmedBy: isPharmacy ? userId : null, confirmedByName: isPharmacy ? userName : null,
          confirmedAt: isPharmacy ? serverTimestamp() : null,
        });
        refs.push(ref.id);
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"stock2Inventory", entityId:refs.join(","),
        details: `Inventaire Stock (2) ${isPharmacy?"Pharmacie":"— "+scope} : ${lines.length} produit(s) compté(s)${isPharmacy?"":" (en attente de confirmation par le service)"}`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return refs;
    },
    confirmStock2Inventory: async (id) => {
      const snap = await getDoc(doc(db,"stock2Inventories",id));
      if (!snap.exists()) throw new Error("Ligne d'inventaire introuvable");
      const d = snap.data();
      if (d.status !== "attente") throw new Error("Cette ligne a déjà été traitée.");
      await updateDoc(doc(db,"stock2Inventories",id), {
        status:"confirme", confirmedBy:userId, confirmedByName:userName, confirmedAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"stock2Inventory", entityId:id, details:`Inventaire Stock (2) confirmé : ${d.productName} (écart ${d.ecart>0?"+":""}${d.ecart})`, userId, userName, createdAt:serverTimestamp() });
    },
    rejectStock2Inventory: async (id) => {
      const snap = await getDoc(doc(db,"stock2Inventories",id));
      if (!snap.exists()) throw new Error("Ligne d'inventaire introuvable");
      const d = snap.data();
      if (d.status !== "attente") throw new Error("Cette ligne a déjà été traitée.");
      // Jamais de suppression : on marque "rejete", sans effet sur le stock
      // (comme si le comptage n'avait pas eu lieu).
      await updateDoc(doc(db,"stock2Inventories",id), {
        status:"rejete", confirmedBy:userId, confirmedByName:userName, confirmedAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"stock2Inventory", entityId:id, details:`Inventaire Stock (2) rejeté : ${d.productName}`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Inventaire — circuit fonctionnement (Comptabilité Matières) ──
    // Collection séparée de stock2Inventories (circuit vente), mais logique
    // identique : côté pharmacie fonctionnement, confirmé immédiatement ;
    // côté service fonctionnement, "attente" jusqu'à confirmation par un agent
    // DE CE SERVICE. scope vaut "fonct-pharmacy" ou "fonct-service:<id>".
    createStock2InventoryFonct: async (scope, lines) => {
      const isPharmacy = scope === "fonct-pharmacy";
      const refs = [];
      for (const l of lines) {
        if (!l.productId) continue;
        const ecart = Number(l.countedQty) - Number(l.computedQty);
        const ref = await addDoc(collection(db,"stock2InventoriesFonct"), {
          scope, productId:l.productId, productName:l.productName||"",
          computedQty:Number(l.computedQty)||0, countedQty:Number(l.countedQty)||0, ecart,
          status: isPharmacy ? "confirme" : "attente",
          createdBy:userId, createdByName:userName, createdAt:serverTimestamp(),
          confirmedBy: isPharmacy ? userId : null, confirmedByName: isPharmacy ? userName : null,
          confirmedAt: isPharmacy ? serverTimestamp() : null,
        });
        refs.push(ref.id);
      }
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"stock2InventoryFonct", entityId:refs.join(","),
        details: `Inventaire Fonctionnement ${isPharmacy?"Pharmacie":"— "+scope} : ${lines.length} produit(s) compté(s)${isPharmacy?"":" (en attente de confirmation par le service)"}`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return refs;
    },
    confirmStock2InventoryFonct: async (id) => {
      const snap = await getDoc(doc(db,"stock2InventoriesFonct",id));
      if (!snap.exists()) throw new Error("Ligne d'inventaire introuvable");
      const d = snap.data();
      if (d.status !== "attente") throw new Error("Cette ligne a déjà été traitée.");
      await updateDoc(doc(db,"stock2InventoriesFonct",id), {
        status:"confirme", confirmedBy:userId, confirmedByName:userName, confirmedAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"stock2InventoryFonct", entityId:id, details:`Inventaire Fonctionnement confirmé : ${d.productName} (écart ${d.ecart>0?"+":""}${d.ecart})`, userId, userName, createdAt:serverTimestamp() });
    },
    rejectStock2InventoryFonct: async (id) => {
      const snap = await getDoc(doc(db,"stock2InventoriesFonct",id));
      if (!snap.exists()) throw new Error("Ligne d'inventaire introuvable");
      const d = snap.data();
      if (d.status !== "attente") throw new Error("Cette ligne a déjà été traitée.");
      await updateDoc(doc(db,"stock2InventoriesFonct",id), {
        status:"rejete", confirmedBy:userId, confirmedByName:userName, confirmedAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"stock2InventoryFonct", entityId:id, details:`Inventaire Fonctionnement rejeté : ${d.productName}`, userId, userName, createdAt:serverTimestamp() });
    },

    // ── Types de produits — circuit fonctionnement ──
    // Liste libre, créée et modifiable par le Comptable Matière (pas une
    // nomenclature officielle à reproduire) — sert à classer/filtrer ses
    // produits (Inventaire, Statistiques). Suppression réelle possible ici
    // (contrairement aux documents de mouvement) : ce n'est qu'une étiquette
    // de classement, pas un enregistrement comptable.
    addProductTypeFonct: async (name) => {
      const n = (name||"").trim();
      if (!n) throw new Error("Le nom du type est obligatoire.");
      const ref = await addDoc(collection(db,"productTypesFonct"), { name:n, createdBy:userId, createdByName:userName, createdAt:serverTimestamp() });
      return ref.id;
    },
    renameProductTypeFonct: async (id, name) => {
      const n = (name||"").trim();
      if (!n) throw new Error("Le nom du type est obligatoire.");
      await updateDoc(doc(db,"productTypesFonct",id), { name:n });
    },
    deleteProductTypeFonct: async (id) => {
      await deleteDoc(doc(db,"productTypesFonct",id));
    },

    // ── Registre des circuits — préparation pour de futures "comptabilités" ──
    // "vente" et "fonctionnement" restent codés en dur (ils ont leurs propres
    // pages, formules de stock et rôles dédiés) ; ce registre sert à ajouter
    // un TROISIÈME (ou plus) circuit qui n'a pas encore cette infrastructure
    // dédiée, en attendant qu'elle soit construite — la case à cocher existe
    // déjà sur chaque produit dès l'ajout ici, prête à être exploitée plus
    // tard. Réservé à l'admin principal (la portée d'un nouveau circuit —
    // quel rôle le gère, quelles pages, quelles règles — reste à définir cas
    // par cas, donc pas de délégation automatique comme pour vente/fonct.).
    addCircuit: async (key, label, icon) => {
      const k = (key||"").trim().toLowerCase().replace(/[^a-z0-9_]/g,"_");
      if (!k) throw new Error("La clé du circuit est obligatoire (lettres/chiffres/underscore).");
      if (["vente","fonctionnement"].includes(k)) throw new Error("Cette clé est déjà utilisée par un circuit existant.");
      const existing = (await getDocs(query(collection(db,"circuitsRegistry"), where("key","==",k)))).docs;
      if (existing.length>0) throw new Error("Un circuit avec cette clé existe déjà.");
      const ref = await addDoc(collection(db,"circuitsRegistry"), {
        key:k, label:(label||k).trim(), icon:icon||"📁",
        createdBy:userId, createdByName:userName, createdAt:serverTimestamp(),
      });
      return ref.id;
    },
    renameCircuit: async (id, label, icon) => {
      await updateDoc(doc(db,"circuitsRegistry",id), { label:(label||"").trim(), icon:icon||"📁" });
    },
    deleteCircuit: async (id) => {
      // NB : ne retire pas ce circuit des produits qui l'avaient déjà coché
      // (leur champ "circuits" garde la clé) — seulement de la liste des
      // circuits proposés pour de nouveaux produits.
      await deleteDoc(doc(db,"circuitsRegistry",id));
    },

    // ── Demandes — commun à tous les circuits qui en ont besoin ──
    // Un service crée une demande (liste de produits + quantités souhaités)
    // pour UN circuit précis (jamais "vente", jamais "fonctionnement" — géré
    // par un logiciel externe pour ce dernier). Le comptable du circuit
    // concerné la traite : il peut ajuster les quantités, retirer des
    // produits qu'il ne donne pas — mais la demande GARDE la trace complète
    // de ce qui a été demandé à l'origine, avec ce qui a été réellement
    // fourni pour chaque ligne (jamais de perte de traçabilité, même pour un
    // produit finalement retiré : qtyEnvoyee passe à 0, fourni à false, la
    // ligne reste visible).
    addDemande: async (circuit, serviceId, serviceName, items, notes) => {
      const itemsInit = (items||[]).map(it => ({
        productId: it.productId, productName: it.productName, qtyDemandee: Number(it.qty)||0,
        qtyEnvoyee: null, fourni: null,
      }));
      const ref = await addDoc(collection(db,"demandes"), {
        circuit, serviceId, serviceName, items: itemsInit, notes: notes||"",
        status: "attente",
        requestedBy: userId, requestedByName: userName, createdAt: serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"create", entity:"demande", entityId:ref.id, details:`Demande de ${serviceName} (${circuit}) : ${itemsInit.length} produit(s)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // resultItems: [{productId, productName, qtyDemandee, qtyEnvoyee}] — TOUS
    // les articles d'origine, y compris ceux retirés (qtyEnvoyee:0). sortieRef
    // = l'id du bon de sortie créé en réponse, pour naviguer de l'un à l'autre.
    processDemande: async (demandeId, resultItems, sortieRef) => {
      const dSnap = await getDoc(doc(db,"demandes",demandeId));
      if (!dSnap.exists()) throw new Error("Demande introuvable");
      const d = dSnap.data();
      if (d.status !== "attente") throw new Error("Cette demande a déjà été traitée.");
      const finalItems = (resultItems||[]).map(it => ({
        productId: it.productId, productName: it.productName,
        qtyDemandee: Number(it.qtyDemandee)||0, qtyEnvoyee: Number(it.qtyEnvoyee)||0,
        fourni: Number(it.qtyEnvoyee)>0,
      }));
      await updateDoc(doc(db,"demandes",demandeId), {
        items: finalItems, status:"traite", sortieRef: sortieRef||null,
        processedBy:userId, processedByName:userName, processedAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"demande", entityId:demandeId, details:`Demande de ${d.serviceName} traitée`, userId, userName, createdAt:serverTimestamp() });
    },
    rejectDemande: async (demandeId, reason) => {
      const dSnap = await getDoc(doc(db,"demandes",demandeId));
      if (!dSnap.exists()) throw new Error("Demande introuvable");
      const d = dSnap.data();
      if (d.status !== "attente") throw new Error("Cette demande a déjà été traitée.");
      await updateDoc(doc(db,"demandes",demandeId), {
        status:"rejete", rejectReason: reason||"",
        processedBy:userId, processedByName:userName, processedAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), { action:"update", entity:"demande", entityId:demandeId, details:`Demande de ${d.serviceName} rejetée`, userId, userName, createdAt:serverTimestamp() });
    },
    // Le service peut retirer SA PROPRE demande tant qu'elle est en attente.
    cancelDemande: async (demandeId) => {
      const dSnap = await getDoc(doc(db,"demandes",demandeId));
      if (!dSnap.exists()) throw new Error("Demande introuvable");
      const d = dSnap.data();
      if (d.status !== "attente") throw new Error("Cette demande a déjà été traitée — impossible de l'annuler.");
      await updateDoc(doc(db,"demandes",demandeId), { status:"annulee", processedBy:userId, processedByName:userName, processedAt:serverTimestamp() });
      await addDoc(collection(db,"activities"), { action:"update", entity:"demande", entityId:demandeId, details:`Demande de ${d.serviceName} annulée par le service`, userId, userName, createdAt:serverTimestamp() });
    },

    logActivity: (action, details) =>
      addDoc(collection(db,"activities"), {
        action, details, userId, userName, createdAt: serverTimestamp(),
      }),
  };
}
