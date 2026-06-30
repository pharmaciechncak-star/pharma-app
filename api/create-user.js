import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Initialiser Firebase Admin (une seule fois)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { name, email, role, tempPw } = req.body;

    if (!email || !name || !role) {
      return res.status(400).json({ error: "Champs requis : name, email, role" });
    }

    const password = tempPw || "PharmaStock2025!";
    const adminAuth = getAuth();
    const db = getFirestore();

    // 1. Créer l'utilisateur dans Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: name,
      });
    } catch (authErr) {
      // Si l'utilisateur existe déjà dans Auth, mettre à jour son mot de passe
      if (authErr.code === "auth/email-already-exists") {
        const existing = await adminAuth.getUserByEmail(email);
        await adminAuth.updateUser(existing.uid, { password, displayName: name });
        userRecord = existing;
      } else {
        throw authErr;
      }
    }

    // 2. Créer/mettre à jour le document Firestore avec l'UID Auth
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role,
      mustChangePw: true,
      createdAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      success: true,
      uid: userRecord.uid,
      message: `Utilisateur "${name}" créé avec succès.`,
    });

  } catch (error) {
    console.error("Erreur create-user:", error);
    return res.status(500).json({ error: error.message || "Erreur interne" });
  }
}