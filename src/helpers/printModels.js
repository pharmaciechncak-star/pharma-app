// Modèles des imprimés de la Comptabilité Matières — n° de modèle,
// instruction, articles de référence et intitulés des signataires, réglables
// dans Paramètres › Modèles des imprimés (collection printModels, document
// "config"). Rien n'est figé dans le code : on peut suivre les modèles en
// usage (CHNU de Fann) ou la numérotation de l'Instruction générale n°04 du
// 08 mars 1988 (documentation de formation), ou saisir la sienne.

// signers : intitulés des signataires, dans l'ordre où ils apparaissent sur
// l'imprimé. Ils servent aussi de clés pour les noms saisis avant impression.
export const PRINT_MODEL_DOCS = [
  { key:"entree",        label:"Bon d'entrée",             signerRoles:["Certification","Augmentation des prises en charge"] },
  { key:"sortie_def",    label:"Bon de sortie définitive", signerRoles:["Certification","Diminution des prises en charge","Récépissé"] },
  { key:"sortie_prov",   label:"Bon de sortie provisoire", signerRoles:["Certification","Engagement du comptable","Récépissé"] },
  { key:"retour",        label:"Bon de retour",            signerRoles:["Certification","Diminution des prises en charge"] },
  { key:"pv",            label:"PV de réception",          signerRoles:[] },
  { key:"livre_journal", label:"Livre-journal",            signerRoles:[] },
  { key:"grand_livre",   label:"Grand livre des comptes",  signerRoles:[] },
  { key:"fiche_stock",   label:"Fiche de stock",           signerRoles:["Signataire de gauche","Signataire de droite"] },
  { key:"balance",       label:"Balance périodique",       signerRoles:[] },
  { key:"consommation",  label:"Consommation matières",    signerRoles:["Certification","Diminution des prises en charge","Récépissé"] },
  { key:"releve",        label:"Relevé récapitulatif",     signerRoles:["Comptable"] },
  { key:"pv_recensement",label:"PV de recensement",        signerRoles:[] },
  { key:"certificat",    label:"Certificat administratif", signerRoles:["Demande (administrateur)","Autorisation (ordonnateur)"] },
  { key:"compte_gestion",label:"Compte de gestion",        signerRoles:["Comptable"] },
  { key:"fiche_detenteur",label:"Fiche d'inventaire individuel", signerRoles:["Comptable","Détenteur"] },
];

const E = (modele="", articles="", signers=[], instruction="Instruction générale") => ({ modele, instruction: modele?instruction:"", articles, signers });

// Valeurs actuellement imprimées (modèles du CHNU de Fann fournis par l'utilisateur).
export const PRESET_FANN = {
  entree:        E("Modèle N° 2", "Art. 43a, 43c, 50, 68", ["L'Ordonnateur des Matières","Le Comptable des matières"]),
  sortie_def:    E("Modèle N° 3", "Art. 55a, 55b1, 55b2", ["L'Ordonnateur des Matières","Le Comptable des matières","Le réceptionnaire"]),
  sortie_prov:   E("Modèle N° 4", "Art 54c 68", ["L'Ordonnateur des Matières","Le Comptable des matières","Le réceptionnaire"]),
  retour:        E("", "", ["L'Ordonnateur des Matières","Le Comptable des Matières"]),
  pv:            E(),
  livre_journal: E(),
  grand_livre:   E("Modèle N°7", "Art. 18a"),
  fiche_stock:   E("", "", ["L'administrateur des Matières","Le Comptable des matières"]),
  balance:       E(),
  consommation:  E("", "", ["L'Ordonnateur des Matières","Le Comptable des matières","Le réceptionnaire"]),
  releve:        E("Modèle n°9", "Art. 17b, 18c", ["Le Comptable des matières"]),                                          // diapo 124
  pv_recensement:E("Modèle n°10", "Art. 7a, 10c, 13b, 16, 17, 18"),                                                         // diapo 127
  certificat:    E("Modèle n°9", "Art. 17b, 18c", ["L'Administrateur des matières","L'Ordonnateur des matières"]),          // diapo 130
  compte_gestion:E("", "", ["Le Comptable des matières"]),
  fiche_detenteur:E("Modèle n°6", "Art. 15b, 17b", ["Le Comptable des matières","Le Détenteur"]),                         // diapo 94
};

// Numérotation de l'Instruction générale n°04 du 08/03/1988, telle que
// reprise dans « Formation en comptabilité des matières » (diapositives citées).
export const PRESET_IG04 = {
  entree:        E("Modèle n°1", "Art. 12a, 12c, 19a", ["L'Administrateur des matières","Le Comptable des matières"]),        // diapo 82
  sortie_def:    E("Modèle n°2", "Art. 12a, 12c, 19a", ["L'Administrateur des matières","Le Comptable des matières","Le Réceptionnaire"]), // diapo 92
  sortie_prov:   E("Modèle n°2 bis", "Art. 12a, 12c, 19a", ["L'Administrateur des matières","Le Comptable des matières","Le Réceptionniste"]), // diapo 113
  retour:        E("", "", ["L'Administrateur des matières","Le Comptable des matières"]),
  pv:            E("Modèle n°3", "Art. 2b, 7b, 7c, 19b"),                                                                    // diapo 79
  livre_journal: E("Modèle n°6", "Art. 18a"),                                                                                // diapo 84
  grand_livre:   E("Modèle n°7", "Art. 18a"),                                                                                // diapo 87
  fiche_stock:   E("", "", ["L'Administrateur des matières","Le Comptable des matières"]),
  balance:       E(),
  consommation:  E("Modèle n°4", "Art. 5c, 12b", ["L'Administrateur des matières","Le Comptable des matières","Le Réceptionnaire"]), // fiche de consommation de stock, diapo 105
  releve:        E("Modèle n°9", "Art. 17b, 18c", ["Le Comptable des matières"]),                                          // diapo 124
  pv_recensement:E("Modèle n°10", "Art. 7a, 10c, 13b, 16, 17, 18"),                                                         // diapo 127
  certificat:    E("Modèle n°9", "Art. 17b, 18c", ["L'Administrateur des matières","L'Ordonnateur des matières"]),          // diapo 130
  compte_gestion:E("", "", ["Le Comptable des matières"]),
  fiche_detenteur:E("Modèle n°6", "Art. 15b, 17b", ["Le Comptable des matières","Le Détenteur"]),                         // diapo 94
};

export const PRINT_MODEL_PRESETS = [
  { id:"fann", label:"Modèles en usage (CHNU de Fann)", values:PRESET_FANN },
  { id:"ig04", label:"Instruction générale n°04 (documentation de formation)", values:PRESET_IG04 },
];

// Configuration effective d'un imprimé : réglage enregistré, sinon valeurs
// en usage. Les signataires manquants retombent un par un sur la valeur par défaut.
export function getPrintModel(store, key){
  const cfg = (store?.printModels||[]).find(d=>d.id==="config")?.docs || {};
  const def = PRESET_FANN[key] || E();
  const saved = cfg[key] || {};
  const signers = (def.signers||[]).map((s,i)=> (saved.signers && saved.signers[i]) ? saved.signers[i] : s);
  return {
    modele: saved.modele!==undefined ? saved.modele : def.modele,
    instruction: saved.instruction!==undefined ? saved.instruction : def.instruction,
    articles: saved.articles!==undefined ? saved.articles : def.articles,
    signers,
  };
}

export function getAllPrintModels(store){
  const out={};
  PRINT_MODEL_DOCS.forEach(d=>{ out[d.key]=getPrintModel(store,d.key); });
  return out;
}
