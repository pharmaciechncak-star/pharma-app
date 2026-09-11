import { useEffect, useState } from "react";
import { stockSterileService, bordereauxService } from "../services/collections";

const SEUIL_ALERTE_JOURS = 7;

function joursRestants(datePeremptionIso) {
  const maintenant = new Date();
  const peremption = new Date(datePeremptionIso);
  const diffMs = peremption - maintenant;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function StockSterile() {
  const [stock, setStock] = useState([]);
  const [bordereauxParId, setBordereauxParId] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    const unsub = stockSterileService.subscribe(
      async function (docs) {
        setStock(docs);

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
      { field: "datePeremption", direction: "asc" }
    );
    return unsub;
  }, []);

  if (loading) return <p>Chargement du stock...</p>;

  const perimes = stock.filter(function (s) { return joursRestants(s.datePeremption) < 0; });
  const bientot = stock.filter(function (s) {
    const j = joursRestants(s.datePeremption);
    return j >= 0 && j <= SEUIL_ALERTE_JOURS;
  });
  const ok = stock.filter(function (s) { return joursRestants(s.datePeremption) > SEUIL_ALERTE_JOURS; });

  function ligne(s) {
    const bordereau = bordereauxParId[s.bordereauId];
    const j = joursRestants(s.datePeremption);
    const classe = j < 0 ? "stock-ligne perime" : j <= SEUIL_ALERTE_JOURS ? "stock-ligne alerte" : "stock-ligne";
    return (
      <tr key={s.id} className={classe}>
        <td>{bordereau ? bordereau.numero : s.bordereauId}</td>
        <td>{bordereau ? bordereau.serviceOrigine : "-"}</td>
        <td>{s.zoneStockage}</td>
        <td>{new Date(s.datePeremption).toLocaleDateString("fr-FR")}</td>
        <td>{j < 0 ? "Perime" : j + " j"}</td>
        <td>{s.statut}</td>
      </tr>
    );
  }

  return (
    <div className="page-stock">
      <h1>Stock sterile</h1>

      <div className="stock-stats">
        <div className="stock-stat">
          <p className="stock-stat-label">Disponible</p>
          <p className="stock-stat-valeur">{ok.length}</p>
        </div>
        <div className="stock-stat alerte">
          <p className="stock-stat-label">Peremption proche</p>
          <p className="stock-stat-valeur">{bientot.length}</p>
        </div>
        <div className="stock-stat danger">
          <p className="stock-stat-label">Perimes</p>
          <p className="stock-stat-valeur">{perimes.length}</p>
        </div>
      </div>

      <table className="stock-table">
        <thead>
          <tr>
            <th>Bordereau</th>
            <th>Service</th>
            <th>Zone</th>
            <th>Peremption</th>
            <th>Delai</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {perimes.map(ligne)}
          {bientot.map(ligne)}
          {ok.map(ligne)}
        </tbody>
      </table>

      {stock.length === 0 && <p>Aucun element en stock pour le moment.</p>}
    </div>
  );
}
