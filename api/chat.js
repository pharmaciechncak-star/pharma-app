export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { system, messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Le champ 'messages' est requis." });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Clé ANTHROPIC_API_KEY manquante." });
    }

    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 8000,  // Augmenté pour supporter les grands tableaux PDF
      messages,
    };
    if (system) body.system = system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || "Erreur API Anthropic" });
    }

    const data = await response.json();
    const reply = data.content
      ?.filter(b => b.type === "text")
      .map(b => b.text)
      .join("") || "Aucune réponse générée.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Erreur handler:", error);
    return res.status(500).json({ error: error.message || "Erreur interne" });
  }
}