import { useState, useEffect } from "react";
import { signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, addDoc, getDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
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
    services, transfers, consumptions, svcReturns, receptions, svcStock,
    stock, loading,

    addSupplier:    s    => addDoc(collection(db,"suppliers"), { ...s, createdBy:userId, createdByName:userName, createdAt: serverTimestamp() }), // retourne Promise<DocumentReference>
    updateSupplier: (id,s)=> updateDoc(doc(db,"suppliers",id), s),

    addDepot:    d    => addDoc(collection(db,"depots"), { ...d, createdBy:userId, createdByName:userName, createdAt: serverTimestamp() }),
    updateDepot: (id,d)=> updateDoc(doc(db,"depots",id), d),

    addProduct: async p => {
      const ref = await addDoc(collection(db,"products"), {
        ...p, stockQty: 0, createdBy:userId, createdByName:userName, createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    updateProduct: (id,p) => updateDoc(doc(db,"products",id), p),

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
      const ref = await addDoc(collection(db,"transfers"), { ...t, transferredBy:userId, transferredByName:userName, status:"done", createdAt:serverTimestamp() });
      // Décrémenter stock pharmacie + incrémenter stock service
      for(const it of (t.items||[])){
        if(!it.productId||!it.qty) continue;
        const curSnap = await getDoc(doc(db,"products",it.productId));
        const curQty = curSnap.data()?.stockQty || 0;
        await updateDoc(doc(db,"products",it.productId), { stockQty: Math.max(0,curQty - Number(it.qty)) });
        // Stock service : clé composite serviceId_productId
        const sKey = t.serviceId+"_"+it.productId;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:t.serviceId, productId:it.productId, qty:(await getDoc(doc(db,"svcStock",sKey))).data()?.qty||0 + Number(it.qty) }, { merge:true });
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"transfer", entityId:ref.id, details:`Transfert vers ${t.serviceName} : ${t.items?.length||0} produit(s)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // ── Consommations Service ──
    addConsumption: async c => {
      const ref = await addDoc(collection(db,"consumptions"), { ...c, consumedBy:userId, consumedByName:userName, createdAt:serverTimestamp() });
      // Décrémenter stock service
      for(const it of (c.items||[])){
        if(!it.productId||!it.qty) continue;
        const sKey = c.serviceId+"_"+it.productId;
        const snap = await getDoc(doc(db,"svcStock",sKey));
        const cur = snap.data()?.qty||0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:c.serviceId, productId:it.productId, qty:Math.max(0,cur-Number(it.qty)) }, { merge:true });
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"consumption", entityId:ref.id, details:`Consommation ${c.serviceName} : ${c.items?.length||0} produit(s)${c.patientName?" — Patient: "+c.patientName:""}`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    // ── Retours Service → Pharmacie ──
    addSvcReturn: async r => {
      const ref = await addDoc(collection(db,"svcReturns"), { ...r, returnedBy:userId, returnedByName:userName, createdAt:serverTimestamp() });
      for(const it of (r.items||[])){
        if(!it.productId||!it.qty) continue;
        // Décrémenter stock service
        const sKey = r.serviceId+"_"+it.productId;
        const snap = await getDoc(doc(db,"svcStock",sKey));
        const cur = snap.data()?.qty||0;
        await setDoc(doc(db,"svcStock",sKey), { serviceId:r.serviceId, productId:it.productId, qty:Math.max(0,cur-Number(it.qty)) }, { merge:true });
        // Incrémenter stock pharmacie
        const pSnap = await getDoc(doc(db,"products",it.productId));
        const pQty = pSnap.data()?.stockQty||0;
        await updateDoc(doc(db,"products",it.productId), { stockQty: pQty+Number(it.qty) });
      }
      await addDoc(collection(db,"activities"), { action:"create", entity:"svcReturn", entityId:ref.id, details:`Retour de ${r.serviceName} vers pharmacie : ${r.items?.length||0} produit(s)`, userId, userName, createdAt:serverTimestamp() });
      return ref;
    },

    getSvcStock: (serviceId, productId) => {
      // Retourner depuis le state local (mis à jour par listener)
      return 0; // sera calculé depuis svcStock
    },

    // ── Listener stock service (dans App) ──
    // ── Réceptions Service (Fournisseur → Pharmacie pour traçabilité service) ──
    addReception: async r => {
      const ref = await addDoc(collection(db,"receptions"), {
        ...r, receivedBy:userId, receivedByName:userName,
        status:"reçu", createdAt:serverTimestamp(),
      });
      await addDoc(collection(db,"activities"), {
        action:"create", entity:"reception", entityId:ref.id,
        details:`Réception : ${r.reference} — ${r.supplierName||""} (${r.items?.length||0} produit(s))`,
        userId, userName, createdAt:serverTimestamp(),
      });
      return ref;
    },
    updateReception: (id,data) => updateDoc(doc(db,"receptions",id), data),
    deleteReception: id => deleteDoc(doc(db,"receptions",id)),

    // ── Méthodes manquantes store ──
    deleteTransfer: id => deleteDoc(doc(db,"transfers",id)),
    updateTransfer: (id,data) => updateDoc(doc(db,"transfers",id), data),

    logActivity: (action, details) =>
      addDoc(collection(db,"activities"), {
        action, details, userId, userName, createdAt: serverTimestamp(),
      }),
  };
}
