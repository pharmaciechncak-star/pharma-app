import { useEffect, useState } from "react";
import { dmTypesService, compositionsService } from "../services/collections";

export default function GestionCompositions() {
  const [dmTypes, setDmTypes] = useState([]);
  const [compositions, setCompositions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [nomDmType, setNomDmType] = useState("");
  const [categorieDmType, setCategorieDmType] = useState("");

  const [nomComposition, setNomComposition] = useState("");
  const [itemsComposition, setItemsComposition] = useState([]);
  const [dmTypeChoisi, setDmTypeChoisi] = useState("");
  const [quantiteChoisie, setQuantiteChoisie] = useState(1);

  useEffect(function () {
    async function charger() {
      const d = await dmTypesService.getAll();
      const c = await compositionsService.getAll();
      setDmTypes(d);
      setCompositions(c);
      setLoading(false);
    }
    charger();
  }, []);

  async function ajouterDmType(e) {
    e.preventDefault();
    if (!nomDmType) return;
    const id = await dmTypesService.create({ nom: nomDmType, categorie: categorieDmType });
    setDmTypes(function (prev) {
      return prev.concat({ id: id, nom: nomDmType, categorie: categorieDmType });
    });
    setNomDmType("");
    setCategorieDmType("");
  }

  function ajouterItemAComposition() {
    if (!dmTypeChoisi) return;
    const dmType = dmTypes.find(function (d) { return d.id === dmTypeChoisi; });
    setItemsComposition(function (prev) {
      return prev.concat({
        dmTypeId: dmTypeChoisi,
        nom: dmType ? dmType.nom : "",
        quantite: Number(quantiteChoisie),
      });
    });
    setDmTypeChoisi("");
    setQuantiteChoisie(1);
  }

  function retirerItem(index) {
    setItemsComposition(function (prev) {
      return prev.filter(function (_, i) { return i !== index; });
    });
  }

  async function creerComposition(e) {
    e.preventDefault();
    if (!nomComposition || itemsComposition.length === 0) return;
    const id = await compositionsService.create({
      nom: nomComposition,
      items: itemsComposition,
    });
    setCompositions(function (prev) {
      return prev.concat({ id: id, nom: nomComposition, items: itemsComposition });
    });
    setNomComposition("");
    setItemsComposition([]);
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="page-formulaire" style={{ maxWidth: "640px" }}>
      <h1>Compositions et types de DM</h1>

      <h3>Types de dispositifs medicaux</h3>
      <form onSubmit={ajouterDmType} className="carte-formulaire">
        <label>
          Nom
          <input type="text" value={nomDmType} onChange={function (e) { setNomDmType(e.target.value); }} placeholder="Ex: Pince Kelly" />
        </label>
        <label>
          Categorie (optionnel)
          <input type="text" value={categorieDmType} onChange={function (e) { setCategorieDmType(e.target.value); }} placeholder="Ex: instrument de prehension" />
        </label>
        <button type="submit">Ajouter le type de DM</button>
      </form>

      <ul className="historique-liste">
        {dmTypes.map(function (d) {
          return <li key={d.id}>{d.nom}{d.categorie ? " — " + d.categorie : ""}</li>;
        })}
        {dmTypes.length === 0 && <li>Aucun type de DM enregistre.</li>}
      </ul>

      <h3>Compositions / kits reutilisables</h3>
      <form onSubmit={creerComposition} className="carte-formulaire">
        <label>
          Nom du kit
          <input type="text" value={nomComposition} onChange={function (e) { setNomComposition(e.target.value); }} placeholder="Ex: Kit cesarienne standard" />
        </label>

        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            DM
            <select value={dmTypeChoisi} onChange={function (e) { setDmTypeChoisi(e.target.value); }}>
              <option value="">-- Selectionner --</option>
              {dmTypes.map(function (d) {
                return <option key={d.id} value={d.id}>{d.nom}</option>;
              })}
            </select>
          </label>
          <label style={{ width: "80px" }}>
            Qte
            <input type="number" min="1" value={quantiteChoisie} onChange={function (e) { setQuantiteChoisie(e.target.value); }} />
          </label>
          <button type="button" onClick={ajouterItemAComposition}>Ajouter</button>
        </div>

        {itemsComposition.length > 0 && (
          <ul className="historique-liste">
            {itemsComposition.map(function (item, index) {
              return (
                <li key={index} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{item.nom} x{item.quantite}</span>
                  <button type="button" onClick={function () { retirerItem(index); }}>Retirer</button>
                </li>
              );
            })}
          </ul>
        )}

        <button type="submit">Enregistrer le kit</button>
      </form>

      <ul className="historique-liste">
        {compositions.map(function (c) {
          return (
            <li key={c.id}>
              <strong>{c.nom}</strong> — {c.items.length} type(s) de DM
            </li>
          );
        })}
        {compositions.length === 0 && <li>Aucune composition enregistree.</li>}
      </ul>
    </div>
  );
}
