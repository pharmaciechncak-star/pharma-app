import { createFirestoreService } from "./firestoreService";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";

export const bordereauxService = createFirestoreService("bordereaux");
export const chargesService = createFirestoreService("charges");
export const dmTypesService = createFirestoreService("dmTypes");
export const compositionsService = createFirestoreService("compositions");
export const stockSterileService = createFirestoreService("stockSterile");
export const nonConformitesService = createFirestoreService("nonConformites");
export const utilisateursService = createFirestoreService("utilisateurs");
export const servicesService = createFirestoreService("services");
export const autoclavesService = createFirestoreService("autoclaves");

// historiqueEtapes a des besoins spécifiques (append-only, requêtes par
// bordereauId triées chronologiquement), donc un petit service dédié plutôt
// que le générique seul.
const historiqueRef = collection(db, "historiqueEtapes");

export const historiqueEtapesService = {
  async ajouterEtape({ bordereauId, chargeId = null, etape, agentId, donnees = {}, commentaire = "" }) {
    return addDoc(historiqueRef, {
      bordereauId,
      chargeId,
      etape,
      agentId,
      donnees,
      commentaire,
      dateHeure: serverTimestamp(),
    });
  },

  async getParBordereau(bordereauId) {
    const q = query(
      historiqueRef,
      where("bordereauId", "==", bordereauId),
      orderBy("dateHeure", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async getParCharge(chargeId) {
    const q = query(
      historiqueRef,
      where("chargeId", "==", chargeId),
      orderBy("dateHeure", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};
