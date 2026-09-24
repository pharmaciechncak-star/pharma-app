// Configuration partagée par les pages de Comptabilité Matières qui
// fonctionnent pour plusieurs circuits (Fonctionnement, Non-Pharmaceutique)
// — un seul composant, paramétré par circuit, plutôt que des fichiers
// dupliqués. N'inclut QUE les circuits ayant une infrastructure dédiée
// (collections, permissions) — pas les circuits du registre libre, qui ne
// sont que des étiquettes sur les produits sans pages propres.
import { can } from "../permissions";

export const COMPTA_CIRCUITS = {
  fonctionnement: {
    key: "fonctionnement",
    label: "Fonctionnement",
    icon: "📦",
    accentColor: "#065f46",
    comptableLabel: "Comptable Matière",
    acceptsDemandes: false,
    refPrefix: "FONCT",
  },
  non_pharmaceutique: {
    key: "non_pharmaceutique",
    label: "Non-Pharmaceutique",
    icon: "🧰",
    accentColor: "#0e7490",
    comptableLabel: "Comptable Non Pharmaceutique",
    acceptsDemandes: true,
    refPrefix: "NP",
  },
};

// Le label et l'icône de Fonctionnement/Non-Pharmaceutique sont modifiables
// depuis Paramètres (enregistrés dans pvSettings, comme le seuil et le
// préfixe) — tout le reste (clé technique, couleur, préfixe de numéro PV,
// acceptsDemandes...) reste fixe : en dépendent les collections Firestore,
// les permissions et la logique métier, pas seulement l'affichage.
export function getComptaCircuits(store) {
  const settings = store?.pvSettings || [];
  const merged = {};
  for (const key of Object.keys(COMPTA_CIRCUITS)) {
    const override = settings.find(s => s.id===key || s.circuit===key);
    merged[key] = {
      ...COMPTA_CIRCUITS[key],
      label: override?.label || COMPTA_CIRCUITS[key].label,
      icon: override?.icon || COMPTA_CIRCUITS[key].icon,
    };
  }
  return merged;
}

// Circuits que CET utilisateur peut lire pour ce domaine (entrees, sorties,
// stock, inventaire, statistiques) — sert à savoir s'il faut proposer un
// sélecteur (accès aux deux) ou choisir directement l'unique circuit
// accessible, sans rien demander.
export function availableCircuits(currentUser, domain) {
  const list = [];
  if (can(currentUser, domain + "-fonct", "r")) list.push("fonctionnement");
  if (can(currentUser, domain + "-np", "r")) list.push("non_pharmaceutique");
  return list;
}
