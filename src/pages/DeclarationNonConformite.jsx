import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  bordereauxService,
  historiqueEtapesService,
  nonConformitesService,
} from "../services/collections";
import { ETAPES } from "../utils/constants";

const TYPES_NON_CONFORMITE = [
  "Composition incomplete",
  "Emballage endommage",
  "Indicateur chimique non vire",
  "Test biologique en echec",
  "Parametre de cycle hors norme",
  "Autre",
];

export default function DeclarationNonConformite() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profil } = useAuth();

  const [bordereau, setBordereau] = useState(null);
  const [type, setType] = useState(TYPES_NON_CONFORMITE[0]);
  const [description, setDescription] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(function () {
    async function charger() {
      const b = await bordereauxService.getById(id);
      setBordereau(b);
    }
    charger();
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description) {
      setErreur("Decris la non-conformite constatee.");
      return;
    }
    setErreur("");
    setEnregistrement(true);

    try {
      await nonConformitesService.create({
        bordereauId: id,
        chargeId: bordereau?.chargeId || null,
        type: type,
        description: description,
        declarePar: profil?.id,
        date: new Date().toISOString(),
        actionCorrective: "",
        statut: "ouverte",
      });

      await historiqueEtapesService.ajouterEtape({
        bordereauId: id,
        chargeId: bordereau?.chargeId || null,
        etape: ETAPES.NON_CONFORMITE,
        agentId: profil?.id,
        donnees: { type: type },
        commentaire: description,
      });

      await bordereauxService.update(id, { statut: "non_conforme" });

      navigate("/bordereaux/" + id);
    } catch (err) {
      setErreur("Erreur lors de l'enregistrement. Reessaie.");
      setEnregistrement(false);
    }
  }

  return (
    <div className="page-formulaire">
      <h1>Declarer une non-conformite</h1>
      {bordereau && <p style={{ color: "#777", fontSize: "13px" }}>{bordereau.numero} — {bordereau.serviceOrigine}</p>}

      <form onSubmit={handleSubmit} className="carte-formulaire">
        <label>
          Type de non-conformite
          <select value={type} onChange={function (e) { setType(e.target.value); }}>
            {TYPES_NON_CONFORMITE.map(function (t) {
              return <option key={t} value={t}>{t}</option>;
            })}
          </select>
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={function (e) { setDescription(e.target.value); }}
            rows={4}
            placeholder="Decris precisement ce qui a ete constate"
          />
        </label>

        {erreur && <p className="erreur-connexion">{erreur}</p>}

        <button type="submit" disabled={enregistrement}>
          {enregistrement ? "Enregistrement..." : "Declarer la non-conformite"}
        </button>
      </form>
    </div>
  );
}
