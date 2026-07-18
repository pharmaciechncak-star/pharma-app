export const ROLES = {
  admin:          { label: "Administrateur",   color: "#7c3aed" },
  admin_pharmacie:{ label: "Admin Pharmacie",  color: "#9333ea" },
  gestionnaire:   { label: "Gestionnaire",     color: "#0891b2" },
  pharmacien:     { label: "Pharmacien",       color: "#0d9488" },
  magasinier:     { label: "Magasinier",       color: "#059669" },
  comptable:      { label: "Comptable",        color: "#d97706" },
  admin_service:  { label: "Admin Service",    color: "#dc2626" },
  agent_service:  { label: "Agent Service",    color: "#ea580c" },
};

export const SECTIONS = [
  // Pharmacie
  { id:"entrees",         label:"Bons d'Entrée",          group:"pharmacie" },
  { id:"retours",         label:"Bons de Retour",          group:"pharmacie" },
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
  admin:         { utilisateurs:P3, entrees:P3,retours:P3,inventaire:P3,factures:P3,"hist-inv":P3,"hist-fact":P3,messagerie:P3,produits:P3,fournisseurs:P3,depots:P3,activites:P3,assistant_ia:P2,services:P3,transferts:P3,"controle-transfert":P3,consommations:P3,"retours-service":P3,"controle-retour":P3,seuil:P3,receptions:P3,"stock-service":P1,statistiques:P1 },
  admin_pharmacie:{ utilisateurs:P2, entrees:P3,retours:P3,inventaire:P3,factures:P3,"hist-inv":P3,"hist-fact":P3,messagerie:P3,produits:P3,fournisseurs:P3,depots:P3,activites:P0,assistant_ia:P1,services:P0,transferts:P2,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P2,seuil:P0,receptions:P2,"stock-service":P2,statistiques:P1 },
  gestionnaire:  { utilisateurs:P0, entrees:P2,retours:P2,inventaire:P2,factures:P2,"hist-inv":P1,"hist-fact":P1,messagerie:P2,produits:P2,fournisseurs:P2,depots:P2,activites:P0,assistant_ia:P1,services:P0,transferts:P2,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P2,seuil:P0,receptions:P2,"stock-service":P1,statistiques:P1 },
  pharmacien:    { utilisateurs:P0, entrees:P2,retours:P2,inventaire:P2,factures:P2,"hist-inv":P2,"hist-fact":P2,messagerie:P2,produits:P2,fournisseurs:P2,depots:P2,activites:P0,assistant_ia:P1,services:P0,transferts:P2,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P2,seuil:P0,receptions:P2,"stock-service":P1,statistiques:P0 },
  magasinier:    { utilisateurs:P0, entrees:P2,retours:P2,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P0,produits:P1,fournisseurs:P0,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P0,consommations:P0,"retours-service":P0,"controle-retour":P1,seuil:P0,receptions:P0,"stock-service":P0 },
  comptable:     { utilisateurs:P0, entrees:P1,retours:P1,inventaire:P2,factures:P2,"hist-inv":P1,"hist-fact":P1,messagerie:P2,produits:P1,fournisseurs:P1,depots:P1,activites:P0,assistant_ia:P1,services:P0,transferts:P1,"controle-transfert":P0,consommations:P1,"retours-service":P1,"controle-retour":P1,seuil:P0,receptions:P1,"stock-service":P1,statistiques:P1 },
  admin_service: { utilisateurs:P2, entrees:P0,retours:P0,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P2,produits:P1,fournisseurs:P0,depots:P0,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P3,consommations:P3,"retours-service":P2,"controle-retour":P0,seuil:P2,receptions:P1,"stock-service":P1,statistiques:P1 },
  agent_service: { utilisateurs:P0, entrees:P0,retours:P0,inventaire:P0,factures:P0,"hist-inv":P0,"hist-fact":P0,messagerie:P2,produits:P1,fournisseurs:P0,depots:P0,activites:P0,assistant_ia:P1,services:P0,transferts:P0,"controle-transfert":P2,consommations:P2,"retours-service":P2,"controle-retour":P0,seuil:P2,receptions:P0,"stock-service":P1 },
};

export const PAGE_LABELS = {
  "dashboard":       "Tableau de bord",
  "entrees":         "Bons d'Entrée",
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

export const fmtDate = d => new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});

export const monthLabel = () => new Date().toLocaleDateString("fr-FR",{month:"long",year:"numeric"});

export const fmtFCFA = n => Number(n||0).toLocaleString("fr-FR") + " FCFA";

export const PAGE_COLORS = {
  "dashboard":    { bg:"linear-gradient(135deg,#0f172a,#0c4a6e)", accent:"#38bdf8", icon:"📊" },
  "entrees":      { bg:"linear-gradient(135deg,#064e3b,#065f46)", accent:"#34d399", icon:"📥" },
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
