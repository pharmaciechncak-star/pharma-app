import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Variables d'environnement Firebase Admin manquantes." });
  }

  try {
    const { name, email, role, tempPw } = req.body || {};

    if (!email || !name || !role) {
      return res.status(400).json({ error: "Champs requis : name, email, role" });
    }

    const password = (tempPw && tempPw.length >= 6) ? tempPw : "PharmaStock2025!";
    const adminAuth = getAuth();
    const db = getFirestore();

    // 1. Créer ou mettre à jour dans Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({ email, password, displayName: name });
    } catch (authErr) {
      if (authErr.code === "auth/email-already-exists") {
        userRecord = await adminAuth.getUserByEmail(email);
        await adminAuth.updateUser(userRecord.uid, { password, displayName: name });
      } else {
        return res.status(400).json({ error: "Erreur Auth : " + authErr.message });
      }
    }

    // 2. Écrire dans Firestore — utiliser set() avec l'UID comme clé
    const userDoc = db.collection("users").doc(userRecord.uid);
    await userDoc.set({
      name:         name,
      email:        email,
      role:         role,
      mustChangePw: true,
      createdAt:    new Date().toISOString(),
    }, { merge: true });

    // 3. Vérifier que le document a bien été créé
    const snap = await userDoc.get();
    if (!snap.exists) {
      return res.status(500).json({ error: "Document Firestore non créé malgré l'appel set()" });
    }

    return res.status(200).json({
      success: true,
      uid:     userRecord.uid,
      message: `Utilisateur "${name}" créé avec succès (Auth + Firestore).`,
    });

  } catch (error) {
    console.error("Erreur create-user:", error);
    return res.status(500).json({ error: error.message || "Erreur interne" });
  }
}