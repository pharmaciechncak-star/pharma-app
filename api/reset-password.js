import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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
    const { uid, email, newPassword } = req.body;
    if ((!uid && !email) || !newPassword) {
      return res.status(400).json({ error: "uid ou email + newPassword requis" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Minimum 6 caractères" });
    }

    const adminAuth = getAuth();
    const db = getFirestore();

    // Trouver l'utilisateur par uid ou email
    let userRecord;
    if (uid) {
      userRecord = await adminAuth.getUser(uid);
    } else {
      userRecord = await adminAuth.getUserByEmail(email);
    }

    // Mettre à jour le mot de passe dans Firebase Auth
    await adminAuth.updateUser(userRecord.uid, { password: newPassword });

    // Marquer mustChangePw dans Firestore
    await db.collection("users").doc(userRecord.uid).update({
      mustChangePw:  true,
      provisionalPw: newPassword,
    });

    return res.status(200).json({
      success: true,
      message: "Mot de passe mis à jour avec succès.",
    });

  } catch (error) {
    console.error("Erreur reset-password:", error);
    return res.status(500).json({ error: error.message || "Erreur interne" });
  }
}