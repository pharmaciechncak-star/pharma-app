// Calcule l'âge en années révolues à partir d'une date de naissance (ISO
// "YYYY-MM-DD"), par rapport à AUJOURD'HUI — jamais une valeur figée au
// moment de la saisie : un patient enregistré en 2026 verra son âge
// recalculé correctement si on le revoit en 2027.
export function computeAge(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}

// Reconstruit une date de naissance APPROXIMATIVE à partir d'un âge saisi
// (utilisé quand l'utilisateur ne connaît que l'âge, pas la date exacte) —
// on prend "aujourd'hui moins N années", au 1er janvier de l'année de
// naissance obtenue pour rester cohérent même si l'âge est ré-affiché plus tard.
export function birthDateFromAge(age) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 0 || n > 130) return "";
  const year = new Date().getFullYear() - n;
  return year + "-01-01";
}
