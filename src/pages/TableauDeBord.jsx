import { Link } from "react-router-dom";
import { useBordereauxParStatut } from "../hooks/useBordereaux";
import { STATUTS_BORDEREAU, LABELS_STATUT } from "../utils/constants";

export default function TableauDeBord() {
  const { parStatut, loading } = useBordereauxParStatut();

  if (loading) return <p>Chargement des bordereaux...</p>;

  return (
    <div className="tableau-de-bord">
      <div className="tdb-header">
        <h1>Stérilisation — bordereaux</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link to="/bordereaux/nouveau" className="btn-primary">
            + Nouvelle réception
          </Link>
          <Link to="/charges/nouvelle" className="btn-primary">
            + Nouvelle charge
          </Link>
          <Link to="/stock" className="btn-primary">
            Stock stérile
          </Link>
          <Link to="/admin/compositions" className="btn-primary">
            Compositions
          </Link>
          <Link to="/admin/utilisateurs" className="btn-primary">
            Utilisateurs
          </Link>
          <Link to="/non-conformites" className="btn-primary">
            Non-conformités
          </Link>
        </div>
      </div>

      <div className="tdb-colonnes">
        {STATUTS_BORDEREAU.map((statut) => (
          <div key={statut} className="tdb-colonne">
            <h3>{LABELS_STATUT[statut]}</h3>
            {(parStatut[statut] || []).map((b) => (
              <Link to={`/bordereaux/${b.id}`} key={b.id} className="tdb-carte">
                <p className="tdb-carte-titre">{b.serviceOrigine}</p>
                <p className="tdb-carte-sous">{b.numero}</p>
              </Link>
            ))}
            {(parStatut[statut] || []).length === 0 && (
              <p className="tdb-vide">Aucun bordereau</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
