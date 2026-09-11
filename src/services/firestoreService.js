import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";

// Fabrique un service CRUD basique pour une collection donnée.
// Garde les appels Firestore isolés ici : si on migre vers PostgreSQL plus
// tard, seul ce fichier (et ses équivalents par collection) doit changer,
// pas les composants qui les consomment.
export function createFirestoreService(collectionName) {
  const colRef = collection(db, collectionName);

  return {
    async getAll() {
      const snap = await getDocs(colRef);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async getById(id) {
      const ref = doc(db, collectionName, id);
      const snap = await getDoc(ref);
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async getWhere(field, operator, value) {
      const q = query(colRef, where(field, operator, value));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async create(dataObj) {
      const ref = await addDoc(colRef, {
        ...dataObj,
        dateCreation: serverTimestamp(),
      });
      return ref.id;
    },

    async update(id, dataObj) {
      const ref = doc(db, collectionName, id);
      await updateDoc(ref, { ...dataObj, dateDernierMaj: serverTimestamp() });
    },

    async remove(id) {
      const ref = doc(db, collectionName, id);
      await deleteDoc(ref);
    },

    // Écoute en temps réel, triée par champ optionnel
    subscribe(callback, { field, direction = "desc" } = {}) {
      const q = field ? query(colRef, orderBy(field, direction)) : colRef;
      return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    },
  };
}
