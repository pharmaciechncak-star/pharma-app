import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  bordereauxService,
  chargesService,
  historiqueEtapesService,
  autoclavesService,
} from "../services/collections";
import { ETAPES } from "../utils/constants";

function genererNumeroCharge() {
  const suffixe = Date.now().toString().slice(-5);
  return "CH-" + suffixe;
}

export default function NouvelleCharge() {
  const { profil } = useAuth();
  const navigate = useNavigate();

  const [bordereauxDisponibles, setBordereauxDisponibles] = useState([]);
  const [autoclaves, setAutoclaves] = useState([]);
  const [selection, setSelection] = useState([]);

  const [autoclaveId, setAutoclaveId] = useState("");
  const [programme, setProgramme] = useState("");
  const [temperature, setTemperature] = useState(134);
  const [duree, setDuree] = useState(18);

  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(function () {
    async function charger() {
      const b = await bordereauxService.getWhere("statut", "==", "conditionne");
      const a = await autoclavesService.getAll();
      setBordereauxDisponibles(b);
      setAutoclaves(a);
    }
    charger();
  }, []);

  function toggleSelection(id) {
    setSelection(function (prev) {
      if (prev.includes(id)) {
        return prev.filter(function (x) { return x !== id; });
      }
      return prev.concat(id);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!autoclaveId || selection.length === 0) {
      setErreur("Choisis un autoclave et au moins un bordereau conditionne.");
      return;
    }
    setErreur("");
    setEnregistrement(true);

    try {
      const chargeId = await chargesService.create({
        numero: genererNumeroCharge(),
        autoclaveId: autoclaveId,
        bordereauxIds: selection,
        parametres: {
          temperature: Number(temperature),
          duree: Number(duree),
          programme: programme,
        },
        controles: {
          indicateurPhysique: null,
          indicateurChimique: null,
          testBiologique: { statut: "en_attente", resultat: null, dateResultat: null },
        },
        statutLiberation: "attente",
        dateDebut: new Date().toISOString(),
      });

      for (const bordereauId of selection) {
        await bordereauxService.update(bordereauId, {
          statut: "sterilisation",
          chargeId: chargeId,
        });

        await historiqueEtapesService.ajouterEtape({
          bordereauId: bordereauId,
          chargeId: chargeId,
          etape: ETAPES.STERILISATION,
          agentId: profil ? profil.id : null,
          donnees: {
            autoclaveId: autoclaveId,
            temperature: Number(temperature),
            duree: Number(duree),
          },
        });
      }

      navigate("/");
    } catch (err) {
      setErreur("Erreur lors de la creation de la charge. Reessaie.");
      setEnregistrement(false);
    }
  }

  return (
    <div className="page-formulaire">
      <h1>Nouvelle charge autoclave</h1>
      <form onSubmit={handleSubmit} className="carte-formulaire">
        <label>
          Autoclave
          <select value={autoclaveId} onChange={function (e) { setAutoclaveId(e.target.value); }} required>
            <option value="">-- Selectionner --</option>
            {autoclaves.map(function (a) {
              return <option key={a.id} value={a.id}>{a.nom}</option>;
            })}
          </select>
        </label>

        <label>
          Programme
          <input
            type="text"
            value={programme}
            onChange={function (e) { setProgramme(e.target.value); }}
            placeholder="Ex: cycle standard 134 C"
          />
        </label>

        <label>
          Temperature (C)
          <input type="number" value={temperature} onChange={function (e) { setTemperature(e.target.value); }} />
        </label>

        <label>
          Duree (minutes)
          <input type="number" value={duree} onChange={function (e) { setDuree(e.target.value); }} />
        </label>

        <div>
          <p style={{ fontSize: "13px", marginBottom: "8px" }}>Bordereaux conditionnes disponibles</p>
          {bordereauxDisponibles.length === 0 && (
            <p style={{ fontSize: "13px", color: "#777" }}>Aucun bordereau au statut conditionne pour le moment.</p>
          )}
          {bordereauxDisponibles.map(function (b) {
            return (
              <label key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={selection.includes(b.id)}
                  onChange={function () { toggleSelection(b.id); }}
                />
                {b.numero} - {b.serviceOrigine}
              </label>
            );
          })}
        </div>

        {erreur && <p className="erreur-connexion">{erreur}</p>}

        <button type="submit" disabled={enregistrement}>
          {enregistrement ? "Creation..." : "Lancer la charge"}
        </button>
      </form>
    </div>
  );
}
