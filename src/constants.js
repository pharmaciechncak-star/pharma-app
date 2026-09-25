export const ROLES = {
  admin:          { label: "Administrateur",   color: "#7c3aed" },
  admin_pharmacie:{ label: "Admin Pharmacie",  color: "#9333ea" },
  gestionnaire:   { label: "Gestionnaire",     color: "#0891b2" },
  pharmacien:     { label: "Pharmacien",       color: "#0d9488" },
  magasinier:     { label: "Magasinier",       color: "#059669" },
  comptable:      { label: "Comptable",        color: "#d97706" },
  admin_service:  { label: "Admin Service",    color: "#dc2626" },
  agent_service:  { label: "Agent Service",    color: "#ea580c" },
  comptable_matiere:          { label: "Comptable Matière",          color: "#b45309" },
  comptable_matiere_principal:{ label: "Comptable Matière Principal", color: "#92400e" },
  comptable_non_pharma:          { label: "Comptable Non Pharmaceutique",          color: "#0e7490" },
  comptable_non_pharma_principal:{ label: "Comptable Non Pharmaceutique Principal", color: "#155e75" },
};

export const SECTIONS = [
  // Pharmacie
  { id:"entrees",         label:"Bons d'Entrée",          group:"pharmacie" },
  { id:"retours",         label:"Bons de Retour",          group:"pharmacie" },
  // Sortie directe (perte, casse, usage interne...) — coexiste avec les
  // Transferts (qui restent le circuit normal vers un service, avec
  // contrôle/confirmation) ; celle-ci n'a ni l'un ni l'autre.
  { id:"sorties-depot",   label:"Bon de Sortie (Dépôt)",   group:"pharmacie" },
  { id:"inventaire",      label:"Inventaire",              group:"pharmacie" },
  { id:"factures",        label:"Situations",                group:"pharmacie" },
  { id:"hist-inv",        label:"Historique Inventaires",  group:"pharmacie" },
  { id:"hist-fact",       label:"Historique Situations",     group:"pharmacie" },
  { id:"messagerie",      label:"Messagerie",              group:"pharmacie" },
  // Services
  { id:"services",        label:"Services",                group:"services" },
  { id:"transferts",      label:"Transferts",              group:"services" },
  { id:"controle-transfert", label:"Contrôle Transfert",   group:"services" },
  { id:"consommations",   label:"Consommations",           group:"services" },
  { id:"retours-service", label:"Retours Service",         group:"services" },
  { id:"controle-retour", label:"Contrôle Retour",         group:"services" },
  { id:"seuil",           label:"Seuil",                   group:"services" },
  { id:"receptions",      label:"Réceptions Service",      group:"services" },
  { id:"stock-service",   label:"Stock Services",          group:"services" },
  { id:"inventaire-stock2", label:"Inventaire Stock 2",     group:"services" },
  // Circuit "fonctionnement" (distinct du circuit "vente" ci-dessus) — géré
  // par le Comptable Matière. Mêmes mécaniques que Bon d'Entrée/Transferts,
  // mais des documents et un stock totalement séparés.
  { id:"entrees-fonct",   label:"Bon d'Entrée (Fonct.)",   group:"comptabilite-matieres" },
  { id:"retours-fonct",   label:"Bon de Retour (Fonct.)",  group:"comptabilite-matieres" },
  { id:"sorties-fonct",   label:"Bon de Sortie (Fonct.)",  group:"comptabilite-matieres" },
  { id:"stock-fonct",     label:"Stock Fonctionnement",    group:"comptabilite-matieres" },
  { id:"inventaire-fonct", label:"Inventaire Fonctionnement", group:"comptabilite-matieres" },
  { id:"statistiques-fonct", label:"Statistiques Fonctionnement", group:"comptabilite-matieres" },
  // Circuit "non pharmaceutique" — fournisseurs différents, même démarche que
  // le circuit fonctionnement, géré par un comptable distinct.
  { id:"entrees-np",   label:"Bon d'Entrée (Non Pharma.)",   group:"comptabilite-non-pharma" },
  { id:"retours-np",   label:"Bon de Retour (Non Pharma.)",  group:"comptabilite-non-pharma" },
  { id:"sorties-np",   label:"Bon de Sortie (Non Pharma.)",  group:"comptabilite-non-pharma" },
  { id:"stock-np",     label:"Stock Non Pharmaceutique",     group:"comptabilite-non-pharma" },
  { id:"inventaire-np", label:"Inventaire Non Pharmaceutique", group:"comptabilite-non-pharma" },
  { id:"statistiques-np", label:"Statistiques Non Pharmaceutique", group:"comptabilite-non-pharma" },
  // Demandes — commun à tous les circuits qui en ont besoin (pas le circuit
  // vente, ni fonctionnement — géré par un logiciel externe). Un service crée
  // une demande, un comptable la traite (ajuste/retire des produits, avec
  // traçabilité) en créant le bon de sortie qui en découle.
  { id:"demandes", label:"Demandes", group:"services" },
  // Paramètres des PV (Procès-Verbaux de réception) — fonctions, commission
  // fixe par circuit, seuil de déclenchement. Groupe "admin" car c'est un
  // réglage structurel, pas une opération courante.
  { id:"parametres-pv", label:"Paramètres", group:"admin" },
  { id:"statistiques",    label:"Statistiques",            group:"services" },
  // Catalogue
  { id:"produits",        label:"Produits",                group:"catalogue" },
  { id:"fournisseurs",    label:"Fournisseurs",            group:"catalogue" },
  { id:"depots",          label:"Dépôts",                  group:"catalogue" },
  // Admin
  { id:"utilisateurs",     label:"Utilisateurs",            group:"admin" },
  { id:"activites",       label:"Journal d'activité",      group:"admin", adminOnly:true },
  { id:"assistant_ia",    label:"Assistant IA",            group:"admin" },
];

export const P0={r:0,w:0,d:0}, P1={r:1,w:0,d:0}, P2={r:1,w:1,d:0}, P3={r:1,w:1,d:1};

export const DEFAULT_PERMS = {
  admin:         { utilisateurs:P3, entrees:P3,"sorties-depot":P3,retours:P3,inventaire:P3,factures:P3,"hist-inv":P3,"hist-fact":P3,messagerie:P3,produits:P3,fournisseurs:P3,depots:P3,activites:P3,assistant_ia:P2,services:P3,transferts:P3,"controle-transfert":P3,consommations:P3,"retours-service":P3,"controle-retour":P3,seuil:P3,receptions:P3,"stock-service":P1,"inventaire-stock2":P3,statistiques:P1,"entrees-fonct":P3,"retours-fonct":P3,"sorties-fonct":P3,"stock-fonct":P3,"inventaire-fonct":P3,"statistiques-fonct":P3,"entrees-np":P3,"retours-np":P3,"sorties-np":P3,"stock-np":P1,"inventaire-np":P3,"statistiques-np":P1,"demandes":P3,"parametres-pv":P3 },
  admin_pharmacie:{ utilisateurs:P2, entrees:P3,"sorties-depot":P3,retours:P3,inventaire:P3,factures:P3,"hist-inv":P3,"hist-fact":P3,messagerie:P3,produits:P3,fournisseurs:P3,depots:P3,activites:P0,assistant_ia:P1,services:P0,transferts:P2,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P2,seuil:P0,receptions:P2,"stock-service":P2,"inventaire-stock2":P2,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P0 },
  gestionnaire:  { utilisateurs:P0, entrees:P2,"sorties-depot":P2,retours:P2,inventaire:P2,factures:P2,"hist-inv":P1,"hist-fact":P1,messagerie:P2,produits:P2,fournisseurs:P2,depots:P2,activites:P0,assistant_ia:P1,services:P0,transferts:P2,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P2,seuil:P0,receptions:P2,"stock-service":P1,"inventaire-stock2":P2,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P0 },
  pharmacien:    { utilisateurs:P0, entrees:P2,"sorties-depot":P2,retours:P2,inventaire:P2,factures:P2,"hist-inv":P2,"hist-fact":P2,messagerie:P2,produits:P2,fournisseurs:P2,depots:P2,activites:P0,assistant_ia:P1,services:P0,transferts:P2,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P2,seuil:P0,receptions:P2,"inventaire-stock2":P2,"stock-service":P1,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P0 },
  magasinier:    { utilisateurs:P0, entrees:P2,"sorties-depot":P2,retours:P2,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P0,produits:P1,fournisseurs:P0,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P0,consommations:P0,"retours-service":P0,"controle-retour":P1,seuil:P0,receptions:P0,"inventaire-stock2":P1,"stock-service":P1,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P0 },
  comptable:     { utilisateurs:P0, entrees:P1,"sorties-depot":P1,retours:P1,inventaire:P2,factures:P2,"hist-inv":P1,"hist-fact":P1,messagerie:P2,produits:P1,fournisseurs:P1,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P1,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P1,seuil:P0,receptions:P1,"inventaire-stock2":P2,"stock-service":P1,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P0 },
  admin_service: { utilisateurs:P2, entrees:P0,"sorties-depot":P0,retours:P0,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P2,produits:P1,fournisseurs:P0,depots:P0,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P3,consommations:P3,"retours-service":P2,"controle-retour":P0,seuil:P2,receptions:P1,"inventaire-stock2":P2,"stock-service":P1,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P2,"parametres-pv":P0 },
  agent_service: { utilisateurs:P0, entrees:P0,"sorties-depot":P0,retours:P0,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P2,produits:P1,fournisseurs:P0,depots:P0,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P2,consommations:P2,"retours-service":P2,"controle-retour":P0,seuil:P2,receptions:P0,"inventaire-stock2":P2,"stock-service":P1,statistiques:P1,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P2,"parametres-pv":P0 },
  // Comptable Matière : gère le circuit "fonctionnement" (Bon d'Entrée/Bon de
  // Sortie/Stock distincts du circuit "vente"), avec accès en LECTURE seule
  // sur le circuit vente déjà existant (visibilité, pas d'intervention).
  comptable_matiere: { utilisateurs:P0, entrees:P1,"sorties-depot":P1,retours:P1,inventaire:P1,factures:P1,"hist-inv":P1,"hist-fact":P1,messagerie:P1,produits:P2,fournisseurs:P1,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P1,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P0,seuil:P0,receptions:P1,"inventaire-stock2":P0,"stock-service":P1,statistiques:P1,"entrees-fonct":P2,"retours-fonct":P2,"sorties-fonct":P2,"stock-fonct":P2,"inventaire-fonct":P2,"statistiques-fonct":P1,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P0 },
  // Comptable Matière Principal : même périmètre, avec droits pleins sur le
  // circuit fonctionnement (y compris suppression) et accès à l'ensemble des
  // situations, comme demandé.
  comptable_matiere_principal: { utilisateurs:P0, entrees:P1,"sorties-depot":P1,retours:P1,inventaire:P1,factures:P1,"hist-inv":P1,"hist-fact":P1,messagerie:P1,produits:P2,fournisseurs:P1,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P1,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P0,seuil:P0,receptions:P1,"inventaire-stock2":P1,"stock-service":P1,statistiques:P1,"entrees-fonct":P3,"retours-fonct":P3,"sorties-fonct":P3,"stock-fonct":P3,"inventaire-fonct":P3,"statistiques-fonct":P1,"entrees-np":P0,"retours-np":P0,"sorties-np":P0,"stock-np":P0,"inventaire-np":P0,"statistiques-np":P0,"demandes":P0,"parametres-pv":P2 },
  // Comptable Non Pharmaceutique : même principe que Comptable Matière, mais
  // pour le circuit non pharmaceutique (fournisseurs différents). Traite les
  // demandes des services pour SON circuit (contrairement au Comptable
  // Matière, dont les demandes passent par un logiciel externe).
  comptable_non_pharma: { utilisateurs:P0, entrees:P0,"sorties-depot":P0,retours:P0,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P1,produits:P2,fournisseurs:P1,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P0,consommations:P0,"retours-service":P0,"controle-retour":P0,seuil:P0,receptions:P0,"inventaire-stock2":P0,"stock-service":P0,statistiques:P0,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P2,"retours-np":P2,"sorties-np":P2,"stock-np":P2,"inventaire-np":P2,"statistiques-np":P1,"demandes":P2,"parametres-pv":P0 },
  comptable_non_pharma_principal: { utilisateurs:P0, entrees:P0,"sorties-depot":P0,retours:P0,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P1,produits:P2,fournisseurs:P1,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P0,consommations:P0,"retours-service":P0,"controle-retour":P0,seuil:P0,receptions:P0,"inventaire-stock2":P0,"stock-service":P0,statistiques:P0,"entrees-fonct":P0,"retours-fonct":P0,"sorties-fonct":P0,"stock-fonct":P0,"inventaire-fonct":P0,"statistiques-fonct":P0,"entrees-np":P3,"retours-np":P3,"sorties-np":P3,"stock-np":P3,"inventaire-np":P3,"statistiques-np":P1,"demandes":P3,"parametres-pv":P2 },
};

export const PAGE_LABELS = {
  "dashboard":       "Tableau de bord",
  "entrees":         "Bons d'Entrée",
  "sorties-depot":   "Bon de Sortie (Dépôt Vente)",
  "retours":         "Bons de Retour",
  "inventaire":      "Inventaire",
  "factures":        "Situations",
  "hist-inv":        "Historique Inventaires",
  "hist-fact":       "Historique Situations",
  "messagerie":      "Messagerie",
  "produits":        "Produits",
  "fournisseurs":    "Fournisseurs",
  "utilisateurs":    "Utilisateurs",
  "activites":       "Journal d'activité",
  "services":        "Services Hospitaliers",
  "transferts":      "Transferts",
  "controle-transfert": "Contrôle Transfert",
  "consommations":   "Consommations",
  "retours-service": "Retours Service",
  "controle-retour": "Contrôle Retour",
  "seuil":           "Seuil",
  "receptions":      "Réceptions Service",
  "stock-service":   "Stock Services",
  "inventaire-stock2": "Inventaire Stock 2",
  "entrees-fonct":   "Bon d'Entrée (Fonctionnement)",
  "retours-fonct":   "Bon de Retour (Fonctionnement)",
  "pv": "Procès-Verbaux de Réception",
  "sorties-fonct":   "Bon de Sortie (Fonctionnement)",
  "stock-fonct":     "Stock Fonctionnement",
  "inventaire-fonct": "Inventaire Fonctionnement",
  "statistiques-fonct": "Statistiques Fonctionnement",
  "entrees-np":   "Bon d'Entrée (Non Pharmaceutique)",
  "retours-np":   "Bon de Retour (Non Pharmaceutique)",
  "sorties-np":   "Bon de Sortie (Non Pharmaceutique)",
  "stock-np":     "Stock Non Pharmaceutique",
  "inventaire-np": "Inventaire Non Pharmaceutique",
  "statistiques-np": "Statistiques Non Pharmaceutique",
  "demandes": "Demandes",
  "parametres-pv": "Paramètres",
  "statistiques":    "Statistiques",
};

export const NAV_ITEMS = [
  { id: "dashboard",    label: "Tableau de bord",        icon: "📊" },
  { id: "entrees",      label: "Bons d'Entrée",          icon: "📥", perm: "entrees" },
  { id: "retours",      label: "Bons de Retour",         icon: "↩️", perm: "retours" },
  { id: "inventaire",   label: "Inventaire",             icon: "🗂️", perm: "inventaire" },
  { id: "factures",     label: "Factures",               icon: "🧾", perm: "factures" },
  { id: "hist-inv",     label: "Historique Inventaires", icon: "📋", perm: "hist-inv" },
  { id: "hist-fact",    label: "Historique Situations",    icon: "📁", perm: "hist-fact" },
  { id: "messagerie",   label: "Messagerie",             icon: "✉️", perm: "messagerie" },
  { id: "produits",     label: "Produits",               icon: "💊", perm: "produits" },
  { id: "fournisseurs", label: "Fournisseurs",           icon: "🏢", perm: "fournisseurs" },
  { id: "depots",       label: "Dépôts",                 icon: "🏭", perm: "depots" },
  { id: "activites",    label: "Journal d'activité",     icon: "📜", adminOnly: true },
  { id: "utilisateurs", label: "Utilisateurs",           icon: "👥", adminOnly: true },
];

export const genId = () => Math.random().toString(36).substr(2,9).toUpperCase();

export const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "";

export const monthLabel = () => new Date().toLocaleDateString("fr-FR",{month:"long",year:"numeric"});

export const fmtFCFA = n => Number(n||0).toLocaleString("fr-FR") + " FCFA";

export const PAGE_COLORS = {
  "dashboard":    { bg:"linear-gradient(135deg,#0f172a,#0c4a6e)", accent:"#38bdf8", icon:"📊" },
  "entrees":      { bg:"linear-gradient(135deg,#064e3b,#065f46)", accent:"#34d399", icon:"📥" },
  "sorties-depot": { bg:"linear-gradient(135deg,#7f1d1d,#991b1b)", accent:"#fca5a5", icon:"📤" },
  "retours":      { bg:"linear-gradient(135deg,#78350f,#92400e)", accent:"#fbbf24", icon:"↩️" },
  "inventaire":   { bg:"linear-gradient(135deg,#312e81,#3730a3)", accent:"#a5b4fc", icon:"🗂️" },
  "factures":     { bg:"linear-gradient(135deg,#164e63,#155e75)", accent:"#67e8f9", icon:"📊" },
  "hist-inv":     { bg:"linear-gradient(135deg,#1e3a5f,#1e40af)", accent:"#93c5fd", icon:"📋" },
  "hist-fact":    { bg:"linear-gradient(135deg,#3b0764,#581c87)", accent:"#d8b4fe", icon:"📊" },
  "messagerie":   { bg:"linear-gradient(135deg,#0c4a6e,#075985)", accent:"#7dd3fc", icon:"✉️" },
  "produits":     { bg:"linear-gradient(135deg,#14532d,#166534)", accent:"#86efac", icon:"💊" },
  "depots":       { bg:"linear-gradient(135deg,#1c1917,#292524)", accent:"#d6d3d1", icon:"🏭" },
  "activites":    { bg:"linear-gradient(135deg,#1e1b4b,#312e81)", accent:"#a5b4fc", icon:"📜" },
  "services":        { bg:"linear-gradient(135deg,#7f1d1d,#991b1b)", accent:"#fca5a5", icon:"🏥" },
  "transferts":      { bg:"linear-gradient(135deg,#14532d,#166534)", accent:"#86efac", icon:"🔄" },
  "controle-transfert": { bg:"linear-gradient(135deg,#7c2d12,#9a3412)", accent:"#fdba74", icon:"🔍" },
  "consommations":   { bg:"linear-gradient(135deg,#1e1b4b,#3730a3)", accent:"#c7d2fe", icon:"💉" },
  "retours-service": { bg:"linear-gradient(135deg,#78350f,#92400e)", accent:"#fcd34d", icon:"↩️" },
  "controle-retour": { bg:"linear-gradient(135deg,#134e4a,#0f766e)", accent:"#5eead4", icon:"🔍" },
  "seuil":           { bg:"linear-gradient(135deg,#581c87,#7e22ce)", accent:"#d8b4fe", icon:"🎚️" },
  "receptions":      { bg:"linear-gradient(135deg,#065f46,#047857)", accent:"#6ee7b7", icon:"📦" },
  "stock-service":   { bg:"linear-gradient(135deg,#1e3a5f,#1d4ed8)", accent:"#93c5fd", icon:"📊" },
  "inventaire-stock2": { bg:"linear-gradient(135deg,#3730a3,#4338ca)", accent:"#c4b5fd", icon:"🗒️" },
  "entrees-fonct":   { bg:"linear-gradient(135deg,#78350f,#92400e)", accent:"#fcd34d", icon:"📥" },
  "retours-fonct":   { bg:"linear-gradient(135deg,#7f1d1d,#991b1b)", accent:"#fca5a5", icon:"↩️" },
  "pv": { bg:"linear-gradient(135deg,#1e3a8a,#1e40af)", accent:"#93c5fd", icon:"🗂️" },
  "sorties-fonct":   { bg:"linear-gradient(135deg,#7c2d12,#9a3412)", accent:"#fdba74", icon:"📤" },
  "stock-fonct":     { bg:"linear-gradient(135deg,#713f12,#854d0e)", accent:"#fde68a", icon:"📊" },
  "inventaire-fonct": { bg:"linear-gradient(135deg,#451a03,#5c2c06)", accent:"#fdba74", icon:"🗒️" },
  "statistiques-fonct": { bg:"linear-gradient(135deg,#57534e,#78716c)", accent:"#fde68a", icon:"📚" },
  "entrees-np":   { bg:"linear-gradient(135deg,#155e75,#0e7490)", accent:"#67e8f9", icon:"📥" },
  "retours-np":   { bg:"linear-gradient(135deg,#7f1d1d,#991b1b)", accent:"#fca5a5", icon:"↩️" },
  "sorties-np":   { bg:"linear-gradient(135deg,#164e63,#0891b2)", accent:"#a5f3fc", icon:"📤" },
  "stock-np":     { bg:"linear-gradient(135deg,#134e4a,#0f766e)", accent:"#5eead4", icon:"📊" },
  "inventaire-np": { bg:"linear-gradient(135deg,#083344,#155e75)", accent:"#67e8f9", icon:"🗒️" },
  "statistiques-np": { bg:"linear-gradient(135deg,#374151,#4b5563)", accent:"#67e8f9", icon:"📚" },
  "demandes": { bg:"linear-gradient(135deg,#4c1d95,#6d28d9)", accent:"#c4b5fd", icon:"📝" },
  "parametres-pv": { bg:"linear-gradient(135deg,#334155,#1e293b)", accent:"#94a3b8", icon:"⚙️" },
  "statistiques":    { bg:"linear-gradient(135deg,#312e81,#4f46e5)", accent:"#a5b4fc", icon:"📈" },
  "fournisseurs": { bg:"linear-gradient(135deg,#0f172a,#1e293b)", accent:"#94a3b8", icon:"🏢" },
  "utilisateurs": { bg:"linear-gradient(135deg,#4c0519,#9f1239)", accent:"#fda4af", icon:"👥" },
};

export const DEFAULT_CAROUSEL_SLIDES = [
  {
    bg:"linear-gradient(135deg,#0c4a6e 0%,#0f172a 100%)",
    emoji:"🏥", title:"Centre Hospitalier National Cheikh Ahmadoul Khadim",
    sub:"PharmaStock — Système de gestion des inventaires pharmaceutiques", accent:"#38bdf8",
  },
  {
    bg:"linear-gradient(135deg,#312e81 0%,#1e1b4b 100%)",
    emoji:"🗂️", title:"Inventaires Mensuels Automatisés",
    sub:"Scannez vos documents, calculez vos ventes, générez vos factures en quelques clics", accent:"#a5b4fc",
  },
  {
    bg:"linear-gradient(135deg,#064e3b 0%,#022c22 100%)",
    emoji:"💊", title:"Gestion du Stock en Temps Réel",
    sub:"Médicaments et consommables suivis en permanence, alertes de stock bas automatiques", accent:"#34d399",
  },
  {
    bg:"linear-gradient(135deg,#78350f 0%,#431407 100%)",
    emoji:"🤝", title:"Collaboration Fournisseurs Simplifiée",
    sub:"Envoyez vos factures et bons directement par email depuis l'application", accent:"#fbbf24",
  },
  {
    bg:"linear-gradient(135deg,#4c0519 0%,#1e0010 100%)",
    emoji:"🤖", title:"Assistant IA Intégré",
    sub:"Scannez vos documents Excel, PDF et images pour importer données automatiquement", accent:"#f9a8d4",
  },
];
