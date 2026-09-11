// Statuts possibles d'un bordereau, dans l'ordre du circuit
export const STATUTS_BORDEREAU = [
  "recu",
  "lave",
  "conditionne",
  "sterilisation",
  "controle",
  "stocke",
  "distribue",
  "non_conforme",
];

export const LABELS_STATUT = {
  recu: "Reçu",
  lave: "Lavé",
  conditionne: "Conditionné",
  sterilisation: "En stérilisation",
  controle: "Contrôle",
  stocke: "Stocké",
  distribue: "Distribué",
  non_conforme: "Non conforme",
};

// Types d'étapes enregistrées dans historiqueEtapes
export const ETAPES = {
  RECEPTION: "reception",
  LAVAGE: "lavage",
  CONDITIONNEMENT: "conditionnement",
  STERILISATION: "sterilisation",
  CONTROLE: "controle",
  LIBERATION: "liberation",
  DISTRIBUTION: "distribution",
  NON_CONFORMITE: "non_conformite",
};

// Permissions par action — un utilisateur peut cumuler plusieurs permissions
// (système flexible : pas de rôle figé par étape)
export const PERMISSIONS = {
  RECEPTIONNER: "receptionner",
  VALIDER_LAVAGE: "valider_lavage",
  VALIDER_CONDITIONNEMENT: "valider_conditionnement",
  CHARGER_AUTOCLAVE: "charger_autoclave",
  VALIDER_CONTROLE: "valider_controle",
  LIBERER_CHARGE: "liberer_charge",
  DISTRIBUER: "distribuer",
  GERER_NON_CONFORMITES: "gerer_non_conformites",
  ADMIN: "admin",
};

export const STATUTS_LIBERATION_CHARGE = ["attente", "liberee", "rejetee"];

export const STATUTS_STOCK = ["disponible", "reserve", "distribue", "perime"];
