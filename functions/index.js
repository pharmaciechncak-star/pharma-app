// ============================================================
// functions/index.js — Proxy Claude pour PharmaStock CHNCAK
// La clé API Anthropic reste secrète côté serveur (jamais exposée au navigateur).
// ============================================================

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// Secret défini via : firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Fonction appelable depuis le front via httpsCallable("askClaude")
export const askClaude = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    // Exiger un utilisateur connecté (Firebase Auth)
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    const { system, messages, model, max_tokens } = request.data || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "Paramètre 'messages' manquant ou invalide.");
    }

    const body = {
      model: model || "claude-sonnet-4-6",
      max_tokens: max_tokens || 1500,
      messages,
    };
    if (system) body.system = system;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Anthropic API error:", res.status, data);
        throw new HttpsError(
          "internal",
          data?.error?.message || `Erreur API Claude (${res.status}).`
        );
      }

      // On renvoie la réponse Anthropic telle quelle au front
      return data;
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error("askClaude fetch failed:", e);
      throw new HttpsError("internal", "Échec de l'appel à Claude : " + e.message);
    }
  }
);
