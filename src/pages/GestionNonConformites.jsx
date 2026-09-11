import { useEffect, useState } from "react";
import { nonConformitesService, bordereauxService } from "../services/collections";

export default function GestionNonConformites() {
  const [nonConformites, setNonConformites] = useState([]);
  const [bordereauxParId, setBordereauxParId] = useState({});
  const [loading, setLoading] = useState(true);
  const [brouillonAction, setBrouillonAction] = useState({});

  useEffect(function () {
    const unsub = nonConformitesService.subscribe(
      async function (docs) {
        setNonConformites(docs);

        const idsManquants = docs
          .map(function (d) { return d.bordereauId; })
          .filter(function (bid) { return bid && !bordereauxParId[bid]; });

        if (idsManquants.length > 0) {
          const paires = await Promise.all(
            idsManquants.map(async function (bid) {
              const b = await bordereauxService.getById(bid);
              return [bid, b];
            })
          );
          setBordereauxParId(function (prev) {
            const copie = { ...prev };
            paires.forEach(function (p) { copie[p[0]] = p[1]; });
            return copie;
          });
        }

        setLoading(false);
      },
      { field: "date", direction: "desc" }
    );
    return unsub;
  }, []);

  async function cloturer(nc) {
    const action = brouillonAction[nc.id] || nc.actionCorrective || "";
    await nonConformitesService.update(nc.id, {
      actionCorrective: action,
      statut: "resolue",
    });
  }

  async function enregistrerAction(nc) {
    const action = brouillonAction[nc.id] || "";
    await nonConformitesService.update(nc.id, { actionCorrective: action });
  }

  if (loading) return <p>Chargement...</p>;

  const ouvertes = nonConformites.filter(function (n) { return n.statut === "ouverte"; });
  const resolues = nonConformites.filter(function (n) { return n.statut === "resolue"; });

  function carte(nc) {
    const bordereau = bordereauxParId[nc.bordereauId];
    return (
      <div key={nc.id} className="carte-formulaire" style={{ gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>{nc.type}</strong>
          <span className={nc.statut === "ouverte" ? "badge-danger" : "badge-success"}>
            {nc.statut}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "13px", color: "#777" }}>
          {bordereau ? bordereau.numero + " — " + bordereau.serviceOrigine : nc.bordereauId}
        </p>
        <p style={{ margin: 0, fontSize: "13px" }}>{nc.description}</p>

        {nc.statut === "ouverte" ? (
          <>
            <label>
              Action corrective
              <textarea
                rows={2}
                value={brouillonAction[nc.id] !== undefined ? brouillonAction[nc.id] : nc.actionCorrective || ""}
                onChange={function (e) {
                  setBrouillonAction(function (prev) {
                    return { ...prev, [nc.id]: e.target.value };
                  });
                }}
              />
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={function () { enregistrerAction(nc); }}>
                Enregistrer l'action
              </button>
              <button type="button" onClick={function () { cloturer(nc); }}>
                Cloturer
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "#3b6d11" }}>
            Action corrective : {nc.actionCorrective || "-"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="page-formulaire" style={{ maxWidth: "640px" }}>
      <h1>Non-conformites</h1>

      <h3>Ouvertes ({ouvertes.length})</h3>
      {ouvertes.map(carte)}
      {ouvertes.length === 0 && <p>Aucune non-conformite ouverte.</p>}

      <h3>Resolues ({resolues.length})</h3>
      {resolues.map(carte)}
    </div>
  );
}
