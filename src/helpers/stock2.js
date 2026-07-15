// Stock (2) — suivi temps réel (réception → transfert → service), distinct du
// Stock (1) agrégé (products.stockQty, alimenté par bons d'entrée/retour/inventaire).
// Ce module est la source de vérité unique pour ce calcul : toute page qui a
// besoin de savoir "combien de X sont réellement disponibles à la pharmacie
// pour être transférés" ou "combien de X reste-t-il dans tel service" doit
// passer par ici plutôt que ré-implémenter la formule (risque de divergence).

export function sumItemsQty(docs, productId) {
  return (docs || []).reduce((s, d) => {
    const it = (d.items || []).find(i => i.productId === productId);
    return s + (it ? Number(it.qty || 0) : 0);
  }, 0);
}

// Comme sumItemsQty, mais somme la quantité CONFIRMÉE par le service à
// réception (qtyConfirmed), pas la quantité envoyée par la pharmacie (qty).
// Tant qu'un transfert n'a pas été contrôlé (qtyConfirmed:null), il contribue
// pour 0 : le produit est "en transit", ni à la pharmacie ni encore au service.
export function sumConfirmedQty(docs, productId) {
  return (docs || []).reduce((s, d) => {
    const it = (d.items || []).find(i => i.productId === productId);
    return s + (it && it.qtyConfirmed != null ? Number(it.qtyConfirmed) : 0);
  }, 0);
}

// Stock (2) pharmacie = Σ réceptionné − Σ transféré (vers service) + Σ retourné (par le service)
export function getPharmacyStock2(store, productId) {
  const recu   = sumItemsQty(store.receptions, productId);
  const transf = sumItemsQty(store.transfers, productId);
  const retour = sumItemsQty(store.svcReturns, productId);
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
