import { DEFAULT_PERMS } from "./constants";

// Fusionne les permissions personnalisées de l'utilisateur avec les valeurs
// par défaut de son rôle, SECTION PAR SECTION (pas en tout-ou-rien). C'est
// important : quand un admin enregistre les permissions d'un utilisateur, un
// instantané complet est sauvegardé (voir UsersPage.jsx > savePerms). Si une
// nouvelle section est ajoutée plus tard à DEFAULT_PERMS (ex: "utilisateurs",
// "seuil"...), elle est absente de cet instantané figé — sans ce repli par
// section, l'utilisateur perdrait tout accès aux nouvelles sections tant que
// l'admin ne rouvre pas et ne réenregistre pas ses permissions. Reproduit
// exactement la logique déjà utilisée côté règles Firestore (getPerm()).
export function getUserPerms(user) {
  if (!user) return {};
  const def = DEFAULT_PERMS[user.role] || {};
  const custom = user.permissions || {};
  const merged = {};
  new Set([...Object.keys(def), ...Object.keys(custom)]).forEach(section => {
    merged[section] = custom[section] || def[section] || {};
  });
  return merged;
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
