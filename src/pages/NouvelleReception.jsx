import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  bordereauxService,
  historiqueEtapesService,
  servicesService,
  compositionsService,
} from "../services/collections";
import { ETAPES } from "../utils/constants";

function genererNumero() {
  const annee = new Date().getFullYear();
  const suffixe = Date.now().toString().slice(-6);
  return "BS-" + annee + "-" + suffixe;
}

export default function NouvelleReception() {
  const { profil } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [compositions, setCompositions] = useState([]);

  const [serviceOrigine, setServiceOrigine] = useState("");
  const [compositionId, setCompositionId] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [etatVisuel, setEtatVisuel] = useState("correct");
  const [commentaire, setCommentaire] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(function () {
    async function charger() {
      const s = await servicesService.getAll();
      const c = await compositionsService.getAll();
      setServices(s);
      setCompositions(c);
    }
    charger();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!serviceOrigine || !compositionId) {
      setErreur("Choisis un service et une composition.");
      return;
    }
    setErreur("");
    setEnregistrement(true);

    try {
      const compositionChoisie = compositions.find(function (c) {
        return c.id === compositionId;
      });

      const bordereauId = await bordereauxService.create({
        numero: genererNumero(),
        serviceOrigine: serviceOrigine,
        statut: "recu",
        composition: {
          compositionId: compositionId,
          nom: compositionChoisie ? compositionChoisie.nom : "",
          quantite: Number(quantite),
        },
        chargeId: null,
      });

      await historiqueEtapesService.ajouterEtape({
        bordereauId: bordereauId,
        etape: ETAPES.RECEPTION,
        agentId: profil ? profil.id : null,
        donnees: { etatVisuel: etatVisuel },
        commentaire: commentaire,
      });

      navigate("/bordereaux/" + bordereauId);
    } catch (err) {
      setErreur("Erreur lors de l'enregistrement. Reessaie.");
      setEnregistrement(false);
    }
  }

  return (
    <div className="page-formulaire">
      <h1>Nouvelle reception</h1>
      <form onSubmit={handleSubmit} className="carte-formulaire">
        <label>
          Service demandeur
          <select value={serviceOrigine} onChange={function (e) { setServiceOrigine(e.target.value); }} required>
            <option value="">-- Selectionner --</option>
            {services.map(function (s) {
              return <option key={s.id} value={s.nom}>{s.nom}</option>;
            })}
          </select>
        </label>

        <label>
          Kit / plateau recu
          <select value={compositionId} onChange={function (e) { setCompositionId(e.target.value); }} required>
            <option value="">-- Selectionner --</option>
            {compositions.map(function (c) {
              return <option key={c.id} value={c.id}>{c.nom}</option>;
            })}
          </select>
        </label>

        <label>
          Quantite
          <input type="number" min="1" value={quantite} onChange={function (e) { setQuantite(e.target.value); }} />
        </label>

        <label>
          Etat visuel a reception
          <select value={etatVisuel} onChange={function (e) { setEtatVisuel(e.target.value); }}>
            <option value="correct">Correct</option>
            <option value="humide">Humide</option>
            <option value="souille">Fortement souille</option>
            <option value="incomplet">Incomplet</option>
          </select>
        </label>

        <label>
          Commentaire (optionnel)
          <textarea value={commentaire} onChange={function (e) { setCommentaire(e.target.value); }} rows={2} />
        </label>

        {erreur && <p className="erreur-connexion">{erreur}</p>}

        <button type="submit" disabled={enregistrement}>
          {enregistrement ? "Enregistrement..." : "Enregistrer la reception"}
        </button>
      </form>
    </div>
  );
}
