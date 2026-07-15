import { DEFAULT_PERMS } from "./constants";

export function getUserPerms(user) {
  if (!user) return {};
  if (user.role === "admin") return DEFAULT_PERMS.admin;
  // Permissions personnalisées stockées dans le profil Firestore
  return user.permissions || DEFAULT_PERMS[user.role] || {};
}

export function can(user, section, right) {
  if (user?.role === "admin") return true;
  const perms = getUserPerms(user);
  return !!(perms[section]?.[right]);
}

// ─────────────────────────────────────────────
// Restriction par service / fournisseur
// ─────────────────────────────────────────────
// user.allowedServices / user.allowedSuppliers : tableau d'ids, ou absent/vide
// = pas de restriction (accès à tous). L'admin général bypass toujours.
// Permet par exemple de limiter un "Admin Service" à un seul service
// (Cardiologie) ou un "Admin Pharmacie" aux produits d'un fournisseur donné.

export function hasServiceAccess(user, serviceId) {
  if (!serviceId) return true;
  if (user?.role === "admin") return true;
  const allowed = user?.allowedServices;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(serviceId);
}

export function hasSupplierAccess(user, supplierId) {
  if (!supplierId) return true;
  if (user?.role === "admin") return true;
  const allowed = user?.allowedSuppliers;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(supplierId);
}

// Filtre une liste de services/fournisseurs selon les droits de l'utilisateur
// (pratique pour peupler des sélecteurs sans exposer les entités non autorisées).
export function visibleServices(user, allServices) {
  return (allServices || []).filter(s => hasServiceAccess(user, s.id));
}

export function visibleSuppliers(user, allSuppliers) {
  return (allSuppliers || []).filter(s => hasSupplierAccess(user, s.id));
}
