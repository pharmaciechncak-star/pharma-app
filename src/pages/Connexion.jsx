import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Connexion() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    try {
      await login(email, motDePasse);
      navigate("/");
    } catch (err) {
      setErreur("Connexion impossible. Vérifie l'email et le mot de passe.");
    }
  }

  return (
    <div className="page-connexion">
      <form onSubmit={handleSubmit} className="carte-connexion">
        <h1>Connexion</h1>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
          />
        </label>
        {erreur && <p className="erreur-connexion">{erreur}</p>}
        <button type="submit">Se connecter</button>
      </form>
    </div>
  );
}
