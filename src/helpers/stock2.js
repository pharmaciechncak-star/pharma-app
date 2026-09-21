// Stock (2) — suivi temps réel (réception → transfert → service), distinct du
// Stock (1) agrégé (products.stockQty, alimenté par bons d'entrée/retour/inventaire).
// Ce module est la source de vérité unique pour ce calcul : toute page qui a
// besoin de savoir "combien de X sont réellement disponibles à la pharmacie
// pour être transférés" ou "combien de X reste-t-il dans tel service" doit
// passer par ici plutôt que ré-implémenter la formule (risque de divergence).

export function sumItemsQty(docs, productId) {
  return (docs || []).reduce((s, d) => {
    if (d.status === "annule") return s; // jamais compté, quel que soit son contenu
    const it = (d.items || []).find(i => i.productId === productId);
    return s + (it ? Number(it.qty || 0) : 0);
  }, 0);
}

// Comme sumItemsQty, mais somme la quantité CONFIRMÉE à réception
// (qtyConfirmed), pas la quantité envoyée/annoncée (qty). Trois cas possibles
// pour un article :
//  - qtyConfirmed est un nombre  -> déjà contrôlé, on prend cette valeur
//  - qtyConfirmed === null       -> en attente de contrôle (nouveau workflow),
//                                    contribue pour 0 : le produit est "en
//                                    transit", ni d'un côté ni de l'autre
//  - qtyConfirmed absent (undefined) -> document créé AVANT l'introduction du
//                                    contrôle (l'ancien système créditait tout
//                                    immédiatement) : traité comme déjà
//                                    confirmé pour ne pas faire "disparaître"
//                                    du stock historique existant
export function sumConfirmedQty(docs, productId) {
  return (docs || []).reduce((s, d) => {
    if (d.status === "annule") return s;
    const it = (d.items || []).find(i => i.productId === productId);
    if (!it) return s;
    if (it.qtyConfirmed === undefined) return s + Number(it.qty || 0);
    if (it.qtyConfirmed === null) return s;
    return s + Number(it.qtyConfirmed);
  }, 0);
}

// Ajustements issus d'un inventaire Stock (2) — un écart n'est compté que s'il
// est CONFIRMÉ (côté pharmacie : confirmé immédiatement à la validation par
// l'agent qui compte ; côté service : confirmé seulement par un agent DE ce
// service, jamais par la pharmacie ou un autre service). scope vaut "pharmacy"
// ou "service:<id>".
export function sumInventoryAdjustments(inventories, productId, scope) {
  return (inventories || []).reduce((s, d) => {
    if (d.status !== "confirme") return s;
    if (d.productId !== productId || d.scope !== scope) return s;
    return s + Number(d.ecart || 0);
  }, 0);
}

// Stock (2) pharmacie = Σ réceptionné − Σ transféré (vers service) + Σ retourné CONFIRMÉ (reçu et contrôlé, par la pharmacie) + ajustements d'inventaire confirmés
export function getPharmacyStock2(store, productId) {
  const recu   = sumItemsQty(store.receptions, productId);
  const transf = sumItemsQty(store.transfers, productId);
  const retour = sumConfirmedQty(store.svcReturns, productId);
  const ajust  = sumInventoryAdjustments(store.stock2Inventories, productId, "pharmacy");
  return recu - transf + retour + ajust;
}

// Stock (2) service = Σ transféré CONFIRMÉ (reçu et contrôlé) − Σ consommé − Σ retourné (à la pharmacie) + ajustements d'inventaire confirmés PAR CE SERVICE
export function getServiceStock2(store, productId, serviceId) {
  const byService = docs => (docs || []).filter(d => d.serviceId === serviceId);
  const transf = sumConfirmedQty(byService(store.transfers), productId);
  const conso  = sumItemsQty(byService(store.consumptions), productId);
  const retour = sumItemsQty(byService(store.svcReturns), productId);
  const ajust  = sumInventoryAdjustments(store.stock2Inventories, productId, "service:"+serviceId);
  return transf - conso - retour + ajust;
}

// ── Circuit "fonctionnement" (Comptabilité Matières) ──
// Domaine totalement séparé du Stock (2) "vente" ci-dessus : collections
// dédiées (entreesFonct/sortiesFonct), pas de contrôle/confirmation côté
// service (le bon de sortie envoie directement, comme convenu). Le stock
// pharmacie se déduit simplement des entrées moins les sorties, et le stock
// par service est la somme cumulée de ce qui lui a été remis.

// Stock fonctionnement pharmacie = Σ entrées − Σ sorties + ajustements d'inventaire confirmés
export function getFonctPharmacyStock2(store, productId) {
  const entrees = sumItemsQty(store.entreesFonct, productId);
  const sorties = sumItemsQty(store.sortiesFonct, productId);
  const ajust   = sumInventoryAdjustments(store.stock2InventoriesFonct, productId, "fonct-pharmacy");
  return entrees - sorties + ajust;
}

// Stock fonctionnement d'un service = Σ des sorties qui lui ont été remises +
// ajustements d'inventaire confirmés PAR CE SERVICE (pas de consommation
// trackée ici — un produit de fonctionnement, une fois remis au service, sort
// du périmètre suivi par cette application).
export function getFonctServiceStock2(store, productId, serviceId) {
  const byService = (store.sortiesFonct||[]).filter(d => d.serviceId === serviceId);
  const ajust = sumInventoryAdjustments(store.stock2InventoriesFonct, productId, "fonct-service:"+serviceId);
  return sumItemsQty(byService, productId) + ajust;
}

// ── Circuit "non pharmaceutique" — même principe que le circuit
// fonctionnement, collections dédiées (entreesNp/sortiesNp), autre comptable.

export function getNpPharmacyStock2(store, productId) {
  const entrees = sumItemsQty(store.entreesNp, productId);
  const sorties = sumItemsQty(store.sortiesNp, productId);
  const ajust   = sumInventoryAdjustments(store.stock2InventoriesNp, productId, "np-pharmacy");
  return entrees - sorties + ajust;
}

export function getNpServiceStock2(store, productId, serviceId) {
  const byService = (store.sortiesNp||[]).filter(d => d.serviceId === serviceId);
  const ajust = sumInventoryAdjustments(store.stock2InventoriesNp, productId, "np-service:"+serviceId);
  return sumItemsQty(byService, productId) + ajust;
}
