import { useState, useEffect } from "react";
import { signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db, authSecondary } from "../firebase";
import { ROLES } from "../constants";

export function liveCol(collName, setter, ...constraints) {
  const q = constraints.length
    ? query(collection(db, collName), ...constraints)
    : collection(db, collName);
  return onSnapshot(q, snap =>
    setter(snap.docs.map(d => ({
      id: d.id, ...d.data(),
      date: d.data().createdAt?.toDate?.()?.toISOString() || d.data().date || new Date().toISOString()
    })))
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

export function useStore(userId, userName) {
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
  const [patients,     setPatients]     = useState([]);
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
      safeLiveCol("activities",   setActivities,  orderBy("createdAt","desc")),
      safeLiveCol("services",     setServices,    orderBy("name")),
      safeLiveCol("transfers",    setTransfers,   orderBy("createdAt","desc")),
      safeLiveCol("consumptions", setConsumptions,orderBy("createdAt","desc")),
      safeLiveCol("svcReturns",   setSvcReturns,  orderBy("createdAt","desc")),
      safeLiveCol("receptions",   setReceptions,  orderBy("createdAt","desc")),
      safeLiveCol("batches",      setBatches,     orderBy("expiry","asc")),
      safeLiveCol("patients",     setPatients),
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
    return () => { unsubs.forEach(u => u()); unsubSvcStock(); };
  }, [userId]);

  return {
    suppliers, depots, products, users,
    entries, returns, inventories, invoices, messages, activities,
    services, transfers, consumptions, svcReturns, receptions, svcStock, batches, patients,
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
      const itemsInit = (t.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0 }));
      const ref = await addDoc(collection(db,"transfers"), { ...t, items:itemsInit, transferredBy:userId, transferredByName:userName, status:"en_attente", createdAt:serverTimestamp() });
      // NB : le Stock (1) — products.stockQty — n'est PAS touché ici : un transfert
      // pharmacie→service relève uniquement du Stock (2), qui se déduit des
      // collections receptions/transfers/consumptions/svcReturns (voir StockServicePage
      // et helpers/stock2.js), sans compteur dédié.
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
        }
        // NB : le Stock (2) service (svcStock) n'est PAS incrémenté ici — il ne le
        // sera qu'à la confirmation de réception par le service (confirmTransfer).
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"transfer", entityId:ref.id, details:`Transfert envoyé vers ${t.serviceName} : ${t.items?.length||0} produit(s) (en attente de confirmation)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
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
      const newItems = (t.items||[]).map(it => {
        const res = byProduct[it.productId];
        if (!res) return it;
        const ecart = Number(res.ecart)||0;
        const conforme = ecart === 0;
        const qtyConfirmed = Math.max(0, Number(it.qty) + ecart);
        if (!conforme) allConforme = false;
        return { ...it, qtyConfirmed, conforme, ecart };
      });
      await updateDoc(doc(db,"transfers",transferId), {
        items: newItems,
        status: allConforme ? "confirme" : "non_conforme",
        confirmedBy: userId, confirmedByName: userName, confirmedAt: serverTimestamp(),
      });
      // Crédit du Stock (2) service — uniquement la quantité confirmée
      for (const it of newItems) {
        if (!it.productId || !it.qtyConfirmed) continue;
        const sKey = t.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:t.serviceId, productId:it.productId, qty: sCur + Number(it.qtyConfirmed) }, { merge:true });
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
      if (t.repris) throw new Error("Ce transfert a déjà été repris par la pharmacie — son contrôle ne peut plus être annulé.");
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
      await addDoc(collection(db,"activities"), { action:"update", entity:"transfer", entityId:transferId, details:`Contrôle annulé (service) : transfert vers ${t.serviceName} redevient modifiable`, userId, userName, createdAt:serverTimestamp() });
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
      if (t.status !== "en_attente") throw new Error("Ce transfert a déjà été contrôlé par le service — demandez-lui d'abord d'annuler le contrôle.");
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
      if (t.status !== "en_attente") throw new Error("Ce transfert a déjà été contrôlé par le service — demandez-lui d'abord d'annuler le contrôle.");
      await reverseBatchesOf("transfer", transferId, locPharmacy(), userId, userName);
      const itemsInit = (newData.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0 }));
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
        }
      }
      await updateDoc(doc(db,"transfers",transferId), { items: itemsInit, notes: newData.notes ?? t.notes });
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
      const itemsInit = (r.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0 }));
      const ref = await addDoc(collection(db,"svcReturns"), { ...r, items:itemsInit, returnedBy:userId, returnedByName:userName, status:"en_attente", createdAt:serverTimestamp() });
      // NB : le Stock (1) n'est PAS touché ici — un retour service→pharmacie relève
      // uniquement du Stock (2) (voir remarque dans addTransfer). Comme pour les
      // transferts, le côté émetteur (ici le service) est débité immédiatement ;
      // le côté receveur (la pharmacie) n'est crédité qu'après confirmation
      // (voir confirmSvcReturn) — getPharmacyStock2 ne compte que qtyConfirmed.
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
        }
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"svcReturn", entityId:ref.id, details:`Retour de ${r.serviceName} vers pharmacie : ${r.items?.length||0} produit(s) (en attente de contrôle)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // Contrôle de réception d'un retour service, par la pharmacie. Même logique
    // que confirmTransfer : écart signé (négatif=manquant, positif=surplus, 0=conforme).
    confirmSvcReturn: async (returnId, lineResults) => {
      const rSnap = await getDoc(doc(db,"svcReturns",returnId));
      if (!rSnap.exists()) throw new Error("Retour introuvable");
      const r = rSnap.data();
      const byProduct = Object.fromEntries(lineResults.map(l => [l.productId, l]));
      let allConforme = true;
      const newItems = (r.items||[]).map(it => {
        const res = byProduct[it.productId];
        if (!res) return it;
        const ecart = Number(res.ecart)||0;
        const conforme = ecart === 0;
        const qtyConfirmed = Math.max(0, Number(it.qty) + ecart);
        if (!conforme) allConforme = false;
        return { ...it, qtyConfirmed, conforme, ecart };
      });
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
      if (r.status !== "en_attente") throw new Error("Ce retour a déjà été contrôlé par la pharmacie — demandez-lui d'abord d'annuler le contrôle.");
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
      if (r.status !== "en_attente") throw new Error("Ce retour a déjà été contrôlé par la pharmacie — demandez-lui d'abord d'annuler le contrôle.");
      await reverseBatchesOf("svcReturn", returnId, locService(r.serviceId), userId, userName);
      for (const it of (r.items||[])) {
        if (!it.productId || !it.qty) continue;
        const sKey = r.serviceId+"_"+it.productId;
        const sSnap = await getDoc(doc(db,"svcStock",sKey));
        const sCur = sSnap.data()?.qty || 0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty: sCur + Number(it.qty) }, { merge:true });
      }
      const itemsInit = (newData.items||[]).map(it => ({ ...it, qtyConfirmed:null, conforme:null, ecart:0 }));
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
        }
      }
      await updateDoc(doc(db,"svcReturns",returnId), { items: itemsInit, notes: newData.notes ?? r.notes });
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
      await updateDoc(doc(db,"receptions",receptionId), { items:newItems, notes:newData.notes ?? r.notes });
      await addDoc(collection(db,"activities"), { action:"update", entity:"reception", entityId:receptionId, details:`Réception modifiée : ${r.reference}`, userId, userName, createdAt:serverTimestamp() });
    },

    logActivity: (action, details) =>
      addDoc(collection(db,"activities"), {
        action, details, userId, userName, createdAt: serverTimestamp(),
      }),
  };
}
