import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// Génère un vrai code-barre scannable (SVG). CODE128 est utilisé plutôt que
// EAN-13 car il accepte n'importe quelle chaîne (lettres, chiffres, longueur
// libre) sans contrainte de format — compatible avec tous les codes-barres
// produits existants, quel que soit leur format d'origine. Le rendu SVG (et
// non canvas) est important : les documents imprimés sont générés à partir
// du innerHTML du composant, et un <canvas> ne survivrait pas à cette copie.
export function Barcode({ value, height = 40, width = 1.6, fontSize = 11, margin = 4 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, String(value), {
        format: "CODE128",
        height,
        width,
        fontSize,
        margin,
        displayValue: true,
      });
    } catch (e) {
      // Valeur incompatible avec CODE128 (caractères non supportés) : on masque silencieusement
      if (svgRef.current) svgRef.current.innerHTML = "";
    }
  }, [value, height, width, fontSize, margin]);

  if (!value) return null;
  return <svg ref={svgRef}></svg>;
}
