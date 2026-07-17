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

// Stock (2) pharmacie = Σ réceptionné − Σ transféré (vers service) + Σ retourné CONFIRMÉ (reçu et contrôlé, par la pharmacie)
export function getPharmacyStock2(store, productId) {
  const recu   = sumItemsQty(store.receptions, productId);
  const transf = sumItemsQty(store.transfers, productId);
  const retour = sumConfirmedQty(store.svcReturns, productId);
  return recu - transf + retour;
}

// Stock (2) service = Σ transféré CONFIRMÉ (reçu et contrôlé) − Σ consommé − Σ retourné (à la pharmacie)
export function getServiceStock2(store, productId, serviceId) {
  const byService = docs => (docs || []).filter(d => d.serviceId === serviceId);
  const transf = sumConfirmedQty(byService(store.transfers), productId);
  const conso  = sumItemsQty(byService(store.consumptions), productId);
  const retour = sumItemsQty(byService(store.svcReturns), productId);
  return transf - conso - retour;
}
