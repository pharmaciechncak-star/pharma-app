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
