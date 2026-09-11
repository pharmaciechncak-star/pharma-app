import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { app } from "./config";

// Instance Firebase secondaire, utilisee uniquement pour creer de nouveaux
// comptes utilisateurs sans deconnecter la session de l'administrateur en
// cours. On la cree a la demande, on l'utilise, puis on la detruit.
export async function creerUtilisateurSansDeconnexion(email, motDePasse) {
  const nomApp = "secondaire-" + Date.now();
  const appSecondaire = initializeApp(app.options, nomApp);
  const authSecondaire = getAuth(appSecondaire);

  try {
    const resultat = await createUserWithEmailAndPassword(authSecondaire, email, motDePasse);
    const uid = resultat.user.uid;
    await signOut(authSecondaire);
    return uid;
  } finally {
    await deleteApp(appSecondaire);
  }
}
