import { useState, useEffect, useRef } from "react";
import { btn, input } from "../../helpers/styles";

export function ScanReviewModal({ open, onClose, scanResult, allProducts, activeSupplier, onConfirm, mode }) {
  // mode = "products" | "bon" | "inventory"
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open || !scanResult?.items) return;
    setRows(scanResult.items.map((it, idx) => ({
      _idx:        idx,
      selected:    true,
      // En mode products : tous sont nouveaux et éditables, on ne compare pas avec la base
      isNew:       mode === "products" ? true : !!it.newProduct,
      productId:   mode === "products" ? "" : (it.productId || ""),
      productName: it.productName || "",
      qty:         it.qty         || "",
      unitPrice:   it.unitPrice   || "",
      unit:        it.unit        || "Boîte",
      lot:         it.lot         || "",
      expiry:      it.expiry      || "",
    })));
  }, [open, scanResult, mode]);

  if (!open) return null;

  const existing = rows.filter(r => !r.isNew);
  const newProds = rows.filter(r => r.isNew);
  const selected = rows.filter(r => r.selected);

  const update = (idx, field, val) =>
    setRows(prev => prev.map(r => r._idx === idx ? { ...r, [field]: val } : r));

  const toggleAll = (isNew, checked) =>
    setRows(prev => prev.map(r => r.isNew === isNew ? { ...r, selected: checked } : r));

  const colHdr = { padding:"7px 8px", fontSize:11, fontWeight:700, color:"#64748b",
    background:"#f8fafc", borderBottom:"2px solid #e2e8f0", textAlign:"left" };
  const colTd  = { padding:"6px 8px", borderBottom:"1px solid #f1f5f9", fontSize:12 };

  const Section = ({ title, color, bg, items, showQty, showPrice }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        background:bg, borderRadius:8, padding:"8px 12px", marginBottom:8 }}>
        <div style={{ fontWeight:700, color, fontSize:13 }}>{title} ({items.length})</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <label style={{ fontSize:11, color, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            <input type="checkbox"
              checked={items.length > 0 && items.every(r => r.selected)}
              onChange={e => toggleAll(items[0]?.isNew ?? false, e.target.checked)}/>
            Tout sélectionner
          </label>
        </div>
      </div>
      {items.length === 0
        ? <div style={{ fontSize:12, color:"#94a3b8", padding:"8px 12px" }}>Aucun</div>
        : <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={{ ...colHdr, width:30 }}></th>
                <th style={colHdr}>Nom du produit</th>
                {showQty   && <th style={{ ...colHdr, width:80 }}>Quantité</th>}
                {showPrice && <th style={{ ...colHdr, width:90 }}>Prix FCFA</th>}
                {showQty   && <th style={{ ...colHdr, width:80 }}>Unité</th>}
                {mode==="bon" && <th style={{ ...colHdr, width:90 }}>Lot</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(r => (
                <tr key={r._idx} style={{ background: r.selected ? "white" : "#fafafa", opacity: r.selected ? 1 : 0.5 }}>
                  <td style={colTd}>
                    <input type="checkbox" checked={r.selected}
                      onChange={e => update(r._idx, "selected", e.target.checked)}/>
                  </td>
                  <td style={colTd}>
                    {r.isNew ? (
                      <input value={r.productName}
                        onChange={e => update(r._idx, "productName", e.target.value)}
                        style={{ width:"100%", padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:5, fontSize:12 }}/>
                    ) : (
                      <span style={{ fontWeight:500, color:"#1e293b" }}>{r.productName}</span>
                    )}
                  </td>
                  {showQty && (
                    <td style={colTd}>
                      <input type="number" min="0" value={r.qty}
                        onChange={e => update(r._idx, "qty", e.target.value)}
                        style={{ width:70, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:5, fontSize:12, textAlign:"center" }}/>
                    </td>
                  )}
                  {showPrice && (
                    <td style={colTd}>
                      <input type="number" min="0" value={r.unitPrice}
                        onChange={e => update(r._idx, "unitPrice", e.target.value)}
                        style={{ width:80, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:5, fontSize:12, textAlign:"right" }}/>
                    </td>
                  )}
                  {showQty && (
                    <td style={colTd}>
                      <input value={r.unit||""}
                        onChange={e => update(r._idx, "unit", e.target.value)}
                        list="units-list"
                        style={{ width:70, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:5, fontSize:12 }}/>
                    </td>
                  )}
                  {mode==="bon" && (
                    <td style={colTd}>
                      <input value={r.lot}
                        onChange={e => update(r._idx, "lot", e.target.value)}
                        style={{ width:80, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:5, fontSize:12 }}/>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:700,
      display:"flex", alignItems:"flex-start", justifyContent:"center", padding:12, overflowY:"auto" }}>
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:680,
        marginTop:8, marginBottom:8, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>

        {/* Header */}
        <div style={{ padding:"14px 20px", background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
          borderRadius:"16px 16px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:800, color:"white", fontSize:15 }}>📋 {mode==="products"?"Révision des produits à importer":"Révision du scan"}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:2 }}>
              {mode==="products"
                ? rows.length + " produit(s) — modifiez les noms et prix avant d'importer"
                : (scanResult?.rawCount ? scanResult.rawCount + " lignes lues · " : "") + existing.length + " produit(s) reconnu(s) · " + newProds.length + " nouveau(x)"}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.2)", border:"none",
            color:"white", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:14 }}>✕</button>
        </div>

        <div style={{ padding:16, maxHeight:"65vh", overflowY:"auto" }}>
          {mode === "products" ? (
            /* Mode import produits : tous éditables, pas de séparation nouveau/existant */
            <div style={{marginBottom:16}}>
              <div style={{background:"#f0f9ff",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#0891b2"}}>
                ℹ️ Tous les produits seront importés pour <b>{activeSupplier?.name||"—"}</b>. Modifiez les noms et prix si nécessaire.
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr>
                      <th style={{...colHdr,width:30}}></th>
                      <th style={colHdr}>Nom du produit</th>
                      <th style={{...colHdr,width:90}}>Prix FCFA</th>
                      <th style={{...colHdr,width:70}}>Unité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r=>(
                      <tr key={r._idx} style={{background:r.selected?"white":"#fafafa",opacity:r.selected?1:0.5}}>
                        <td style={colTd}><input type="checkbox" checked={r.selected} onChange={e=>update(r._idx,"selected",e.target.checked)}/></td>
                        <td style={colTd}>
                          <input value={r.productName} onChange={e=>update(r._idx,"productName",e.target.value)}
                            style={{width:"100%",padding:"4px 6px",border:"1px solid #bae6fd",borderRadius:5,fontSize:12}}/>
                        </td>
                        <td style={colTd}>
                          <input type="number" min="0" value={r.unitPrice} onChange={e=>update(r._idx,"unitPrice",e.target.value)}
                            style={{width:80,padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:5,fontSize:12,textAlign:"right"}}/>
                        </td>
                        <td style={colTd}>
                          <input value={r.unit||""} onChange={e=>update(r._idx,"unit",e.target.value)} list="units-list"
                            style={{width:65,padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:5,fontSize:12}}/>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (<>
          {/* Mode bon/inventaire : séparer reconnus et nouveaux */}
          <Section
            title="✅ Produits reconnus dans la base"
            color="#059669" bg="#f0fdf4"
            items={existing}
            showQty={mode !== "products"}
            showPrice={mode === "products"}
          />
          <Section
            title="🆕 Nouveaux produits (non dans la base)"
            color="#7c3aed" bg="#fdf4ff"
            items={newProds}
            showQty={mode !== "products"}
            showPrice={true}
          />
          </>)}

        </div>{/* fin div padding:16 overflowY:auto */}

        {/* Footer */}
        <div style={{ padding:"12px 16px", borderTop:"1px solid #f1f5f9",
          display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
          <div style={{ fontSize:12, color:"#64748b", alignSelf:"center", flex:1 }}>
            {selected.length} ligne(s) sélectionnée(s)
          </div>
          <button onClick={onClose} style={{ ...btn(), background:"#f1f5f9", color:"#374151" }}>
            Annuler
          </button>
          <button
            onClick={() => onConfirm(rows.filter(r => r.selected))}
            disabled={selected.length === 0}
            style={{ ...btn(), background: selected.length === 0 ? "#cbd5e1" : "#0891b2",
              color:"white", fontWeight:700 }}>
            ✅ Confirmer ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

export function BarcodeScanner({ onDetected, onClose }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [error,   setError]   = useState("");
  const [manual,  setManual]  = useState("");
  const [scanning,setScanning]= useState(false);
  const [detected,setDetected]= useState("");

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setError(""); setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width:{ ideal:1280 }, height:{ ideal:720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      // Démarrer la détection avec BarcodeDetector si disponible
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13","ean_8","code_128","code_39","qr_code","upc_a","upc_e","itf","data_matrix","pdf417"]
        });
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const code = codes[0].rawValue;
              setDetected(code);
              stopCamera();
              onDetected(code);
              return;
            }
          } catch(e) {}
          if (streamRef.current) requestAnimationFrame(scan);
        };
        videoRef.current?.addEventListener("playing", () => requestAnimationFrame(scan), { once:true });
      } else {
        setError("⚠️ BarcodeDetector non supporté sur ce navigateur. Utilisez Chrome ou saisissez le code manuellement.");
      }
    } catch(e) {
      setScanning(false);
      if (e.name === "NotAllowedError") setError("⛔ Accès à la caméra refusé. Autorisez la caméra dans votre navigateur.");
      else if (e.name === "NotFoundError") setError("📷 Aucune caméra détectée. Utilisez un lecteur de code barre ou saisissez manuellement.");
      else setError("❌ Erreur caméra : " + e.message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const confirmManual = () => {
    if (manual.trim()) { stopCamera(); onDetected(manual.trim()); }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:600,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:440,overflow:"hidden"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#0c4a6e,#0891b2)",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"white",fontWeight:700,fontSize:15}}>📷 Scanner un code barre / QR</div>
          <button onClick={()=>{stopCamera();onClose();}} style={{...btn(),background:"rgba(255,255,255,0.2)",color:"white",padding:"4px 10px"}}>✕</button>
        </div>

        {/* Vidéo */}
        <div style={{position:"relative",background:"#000",height:240}}>
          <video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover"}} muted playsInline/>
          {/* Viseur */}
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
            <div style={{width:200,height:120,border:"2px solid #22c55e",borderRadius:8,boxShadow:"0 0 0 2000px rgba(0,0,0,0.4)"}}>
              <div style={{position:"absolute",top:0,left:0,width:20,height:20,borderTop:"3px solid #22c55e",borderLeft:"3px solid #22c55e",borderRadius:"4px 0 0 0"}}/>
              <div style={{position:"absolute",top:0,right:0,width:20,height:20,borderTop:"3px solid #22c55e",borderRight:"3px solid #22c55e",borderRadius:"0 4px 0 0"}}/>
              <div style={{position:"absolute",bottom:0,left:0,width:20,height:20,borderBottom:"3px solid #22c55e",borderLeft:"3px solid #22c55e",borderRadius:"0 0 0 4px"}}/>
              <div style={{position:"absolute",bottom:0,right:0,width:20,height:20,borderBottom:"3px solid #22c55e",borderRight:"3px solid #22c55e",borderRadius:"0 0 4px 0"}}/>
            </div>
          </div>
          {scanning&&!error&&(
            <div style={{position:"absolute",bottom:8,left:0,right:0,textAlign:"center",color:"white",fontSize:11}}>
              Centrez le code dans le cadre vert
            </div>
          )}
          {detected&&(
            <div style={{position:"absolute",inset:0,background:"rgba(34,197,94,0.85)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:800,fontSize:18}}>
              ✅ {detected}
            </div>
          )}
        </div>

        <div style={{padding:14}}>
          {error&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:10}}>{error}</div>}

          {/* Saisie manuelle */}
          <div style={{fontSize:12,color:"#64748b",marginBottom:6,fontWeight:600}}>
            Ou saisir / coller le code manuellement :
          </div>
          <div style={{display:"flex",gap:6}}>
            <input
              value={manual}
              onChange={e=>setManual(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&confirmManual()}
              placeholder="Ex: 3400936523453"
              style={{...input,flex:1,fontFamily:"monospace",letterSpacing:1,marginBottom:0}}
              autoFocus={!!error}
            />
            <button onClick={confirmManual} disabled={!manual.trim()}
              style={{...btn(),background:manual.trim()?"#059669":"#cbd5e1",color:"white",padding:"8px 14px",flexShrink:0}}>
              ✓ OK
            </button>
          </div>
          <div style={{fontSize:10,color:"#94a3b8",marginTop:6,textAlign:"center"}}>
            💡 Un lecteur code barre USB/Bluetooth saisit automatiquement le code ci-dessus
          </div>
        </div>
      </div>
    </div>
  );
}
