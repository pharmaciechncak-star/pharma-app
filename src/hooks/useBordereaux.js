import { useEffect, useState } from "react";
import { bordereauxService } from "../services/collections";
import { STATUTS_BORDEREAU } from "../utils/constants";

// Abonnement temps réel à tous les bordereaux, regroupés par statut
// pour alimenter directement la vue flux (kanban).
export function useBordereauxParStatut() {
  const [bordereaux, setBordereaux] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = bordereauxService.subscribe(
      (docs) => {
        setBordereaux(docs);
        setLoading(false);
      },
      { field: "dateDernierMaj", direction: "desc" }
    );
    return unsub;
  }, []);

  const parStatut = STATUTS_BORDEREAU.reduce((acc, statut) => {
    acc[statut] = bordereaux.filter((b) => b.statut === statut);
    return acc;
  }, {});

  return { bordereaux, parStatut, loading };
}
