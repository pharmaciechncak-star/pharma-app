import { useEffect, useState } from "react";
import { utilisateursService } from "../services/collections";
import { creerUtilisateurSansDeconnexion } from "../firebase/secondaryApp";
import { PERMISSIONS } from "../utils/constants";

const LISTE_PERMISSIONS = [
  { cle: PERMISSIONS.RECEPTIONNER, label: "Receptionner" },
  { cle: PERMISSIONS.VALIDER_LAVAGE, label: "Valider lavage" },
  { cle: PERMISSIONS.VALIDER_CONDITIONNEMENT, label: "Valider conditionnement" },
  { cle: PERMISSIONS.CHARGER_AUTOCLAVE, label: "Charger autoclave" },
  { cle: PERMISSIONS.VALIDER_CONTROLE, label: "Valider controle" },
  { cle: PERMISSIONS.LIBERER_CHARGE, label: "Liberer charge" },
  { cle: PERMISSIONS.DISTRIBUER, label: "Distribuer" },
  { cle: PERMISSIONS.GERER_NON_CONFORMITES, label: "Gerer non-conformites" },
  { cle: PERMISSIONS.ADMIN, label: "Administrateur (tous droits)" },
];

export default function GestionUtilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [permissionsChoisies, setPermissionsChoisies] = useState([]);
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");

  useEffect(function () {
    async function charger() {
      const u = await utilisateursService.getAll();
      setUtilisateurs(u);
      setLoading(false);
    }
    charger();
  }, []);

  function togglePermission(cle) {
    setPermissionsChoisies(function (prev) {
      if (prev.includes(cle)) {
        return prev.filter(function (p) { return p !== cle; });
      }
      return prev.concat(cle);
    });
  }

  async function handleCreation(e) {
    e.preventDefault();
    setErreur("");
    setSucces("");
    if (!nom || !email || !motDePasse) {
      setErreur("Remplis le nom, l'email et le mot de passe.");
      return;
    }
    setCreation(true);
    try {
      const uid = await creerUtilisateurSansDeconnexion(email, motDePasse);
      await utilisateursService.update(uid, {
        nom: nom,
        email: email,
        permissions: permissionsChoisies,
      });
      setUtilisateurs(function (prev) {
        return prev.concat({ id: uid, nom: nom, email: email, permissions: permissionsChoisies });
      });
      setSucces("Utilisateur cree : " + nom);
      setNom("");
      setEmail("");
      setMotDePasse("");
      setPermissionsChoisies([]);
    } catch (err) {
      setErreur("Erreur lors de la creation. Verifie que l'email n'est pas deja utilise.");
    } finally {
      setCreation(false);
    }
  }

  async function togglePermissionExistant(utilisateur, cle) {
    const permissionsActuelles = utilisateur.permissions || [];
    const nouvelles = permissionsActuelles.includes(cle)
      ? permissionsActuelles.filter(function (p) { return p !== cle; })
      : permissionsActuelles.concat(cle);

    await utilisateursService.update(utilisateur.id, { permissions: nouvelles });
    setUtilisateurs(function (prev) {
      return prev.map(function (u) {
        return u.id === utilisateur.id ? { ...u, permissions: nouvelles } : u;
      });
    });
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="page-formulaire" style={{ maxWidth: "680px" }}>
      <h1>Utilisateurs et permissions</h1>

      <form onSubmit={handleCreation} className="carte-formulaire">
        <h3 style={{ margin: 0 }}>Nouvel utilisateur</h3>
        <label>
          Nom
          <input type="text" value={nom} onChange={function (e) { setNom(e.target.value); }} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={function (e) { setEmail(e.target.value); }} />
        </label>
        <label>
          Mot de passe temporaire
          <input type="password" value={motDePasse} onChange={function (e) { setMotDePasse(e.target.value); }} />
        </label>

        <div>
          <p style={{ fontSize: "13px", marginBottom: "8px" }}>Permissions (cumulables)</p>
          {LISTE_PERMISSIONS.map(function (p) {
            return (
              <label key={p.cle} style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={permissionsChoisies.includes(p.cle)}
                  onChange={function () { togglePermission(p.cle); }}
                />
                {p.label}
              </label>
            );
          })}
        </div>

        {erreur && <p className="erreur-connexion">{erreur}</p>}
        {succes && <p style={{ color: "#3b6d11", fontSize: "13px" }}>{succes}</p>}

        <button type="submit" disabled={creation}>
          {creation ? "Creation..." : "Creer l'utilisateur"}
        </button>
      </form>

      <h3>Utilisateurs existants</h3>
      {utilisateurs.map(function (u) {
        return (
          <div key={u.id} className="carte-formulaire" style={{ gap: "8px" }}>
            <p style={{ margin: 0, fontWeight: 500 }}>{u.nom || u.email}</p>
            <p style={{ margin: 0, fontSize: "12px", color: "#777" }}>{u.email}</p>
            {LISTE_PERMISSIONS.map(function (p) {
              return (
                <label key={p.cle} style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={(u.permissions || []).includes(p.cle)}
                    onChange={function () { togglePermissionExistant(u, p.cle); }}
                  />
                  {p.label}
                </label>
              );
            })}
          </div>
        );
      })}
      {utilisateurs.length === 0 && <p>Aucun utilisateur enregistre.</p>}
    </div>
  );
}
