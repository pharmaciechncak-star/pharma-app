import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  bordereauxService,
  historiqueEtapesService,
  chargesService,
  stockSterileService,
} from "../services/collections";
import { useAuth } from "../context/AuthContext";
import { ETAPES, LABELS_STATUT, PERMISSIONS } from "../utils/constants";

const JOURS_VALIDITE_STERILE = 180;

export default function DetailBordereau() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profil, hasPermission } = useAuth();
  const [bordereau, setBordereau] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);

  const [zoneStockage, setZoneStockage] = useState("Zone A");
  const [laveur, setLaveur] = useState("Laveur 1");
  const [etatApresLavage, setEtatApresLavage] = useState("propre");
  const [typeEmballage, setTypeEmballage] = useState("sachet");
  const [indicateurChimiquePose, setIndicateurChimiquePose] = useState(true);

  useEffect(() => {
    async function charger() {
      const b = await bordereauxService.getById(id);
      const h = await historiqueEtapesService.getParBordereau(id);
      setBordereau(b);
      setHistorique(h);
      setLoading(false);
    }
    charger();
  }, [id]);

  const etapeSterilisation = historique.find((h) => h.etape === ETAPES.STERILISATION);
  const memeAgentChargeEtLiberation =
    etapeSterilisation && profil && etapeSterilisation.agentId === profil.id;

  async function enregistrerEtape(etape, donnees = {}) {
    await historiqueEtapesService.ajouterEtape({
      bordereauId: id,
      chargeId: bordereau?.chargeId || null,
      etape,
      agentId: profil?.id,
      donnees,
    });
    const h = await historiqueEtapesService.getParBordereau(id);
    setHistorique(h);
  }

  async function handleLavage() {
    await enregistrerEtape(ETAPES.LAVAGE, { laveur, etatApresLavage });
    await bordereauxService.update(id, { statut: "lave" });
    const b = await bordereauxService.getById(id);
    setBordereau(b);
  }

  async function handleConditionnement() {
    await enregistrerEtape(ETAPES.CONDITIONNEMENT, { typeEmballage, indicateurChimiquePose });
    await bordereauxService.update(id, { statut: "conditionne" });
    const b = await bordereauxService.getById(id);
    setBordereau(b);
  }

  async function handleLiberation() {
    const dateSterilisation = new Date();
    const datePeremption = new Date(dateSterilisation);
    datePeremption.setDate(datePeremption.getDate() + JOURS_VALIDITE_STERILE);

    await enregistrerEtape(ETAPES.LIBERATION, { zoneStockage });

    await bordereauxService.update(id, { statut: "stocke" });

    await stockSterileService.create({
      bordereauId: id,
      dateSterilisation: dateSterilisation.toISOString(),
      datePeremption: datePeremption.toISOString(),
      zoneStockage,
      statut: "disponible",
    });

    if (bordereau?.chargeId) {
      await chargesService.update(bordereau.chargeId, {
        statutLiberation: "liberee",
        libereePar: profil?.id,
        dateLiberation: dateSterilisation.toISOString(),
      });
    }

    navigate("/");
  }

  if (loading) return <p>Chargement...</p>;
  if (!bordereau) return <p>Bordereau introuvable.</p>;

  return (
    <div className="detail-bordereau">
      <div className="detail-header">
        <div>
          <p className="detail-label">Bordereau</p>
          <h1>{bordereau.numero} · {bordereau.serviceOrigine}</h1>
        </div>
        <span className="badge-statut">{LABELS_STATUT[bordereau.statut]}</span>
      </div>

      <h3>Historique de l'etape</h3>
      <ul className="historique-liste">
        {historique.map((h) => (
          <li key={h.id}>
            <strong>{h.etape}</strong> — agent {h.agentId} —{" "}
            {h.dateHeure?.toDate ? h.dateHeure.toDate().toLocaleString("fr-FR") : "..."}
          </li>
        ))}
      </ul>

      {memeAgentChargeEtLiberation && (
        <p className="alerte-info">
          Note qualite : vous avez aussi charge cette charge en autoclave.
          La liberation reste possible (systeme flexible), mais un second
          regard est recommande par les bonnes pratiques.
        </p>
      )}

      <div className="actions" style={{ flexDirection: "column", alignItems: "flex-start", gap: "16px" }}>

        {hasPermission(PERMISSIONS.VALIDER_LAVAGE) && bordereau.statut === "recu" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={laveur} onChange={(e) => setLaveur(e.target.value)}>
              <option value="Laveur 1">Laveur 1</option>
              <option value="Laveur 2">Laveur 2</option>
              <option value="Manuel">Lavage manuel</option>
            </select>
            <select value={etatApresLavage} onChange={(e) => setEtatApresLavage(e.target.value)}>
              <option value="propre">Propre</option>
              <option value="a_relaver">A relaver</option>
            </select>
            <button onClick={handleLavage}>Valider le lavage</button>
          </div>
        )}

        {hasPermission(PERMISSIONS.VALIDER_CONDITIONNEMENT) && bordereau.statut === "lave" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={typeEmballage} onChange={(e) => setTypeEmballage(e.target.value)}>
              <option value="sachet">Sachet</option>
              <option value="container">Container rigide</option>
            </select>
            <label style={{ flexDirection: "row", alignItems: "center", gap: "6px", fontSize: "13px" }}>
              <input
                type="checkbox"
                checked={indicateurChimiquePose}
                onChange={(e) => setIndicateurChimiquePose(e.target.checked)}
              />
              Indicateur chimique pose
            </label>
            <button onClick={handleConditionnement}>Valider le conditionnement</button>
          </div>
        )}

        {hasPermission(PERMISSIONS.LIBERER_CHARGE) && bordereau.statut === "sterilisation" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={zoneStockage} onChange={(e) => setZoneStockage(e.target.value)}>
              <option value="Zone A">Zone A</option>
              <option value="Zone B">Zone B</option>
              <option value="Zone C">Zone C</option>
            </select>
            <button onClick={handleLiberation}>Liberer la charge</button>
          </div>
        )}

        {hasPermission(PERMISSIONS.GERER_NON_CONFORMITES) && (
          <Link to={"/bordereaux/" + id + "/non-conformite"}>
            <button type="button">Declarer non-conformite</button>
          </Link>
        )}
      </div>
    </div>
  );
}
