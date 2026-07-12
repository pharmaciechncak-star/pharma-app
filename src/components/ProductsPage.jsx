import { useState, useRef } from "react";
import { downloadExcel } from "../helpers/exportUtils";
import { scanDocumentWithAI } from "../hooks/useAI";
import { PageHeader } from "./ui/PageHeader";
import { btn, input, label, card } from "../helpers/styles";
import { can } from "../permissions";
import { Alert, Badge } from "./ui/FormControls";
import { BarcodeScanner, ScanReviewModal } from "./ui/ScanReviewModal";
import { Modal, ConfirmDelete } from "./ui/Modal";
import { PrintModal } from "./print/PrintTemplates";
import { LOGO_B64 } from "../images";
import { monthLabel } from "../constants";

export function ProductsPage({store,activeSupplier,currentUser}){
  const [showAdd,setShowAdd]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",price:"",unit:"Boîte",supplierId:""});
  const [printModal,setPrintModal]=useState(false);
  const [showOldStock,setShowOldStock]=useState(false);
  const [search,setSearch]=useState("");
  const [scanMsg,setScanMsg]=useState("");
  const [deletingProd,setDeletingProd]=useState(null);
  const scanProdRef=useRef(null);

  const products=activeSupplier ? store.products.filter(p=>p.supplierId===activeSupplier.id) : store.products;
  const filtered=search ? products.filter(p=>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode1&&p.barcode1.includes(search)) ||
    (p.barcode2&&p.barcode2.includes(search)) ||
    (p.barcode3&&p.barcode3.includes(search))
  ) : products;
  const getSupplierName=id=>store.suppliers.find(s=>s.id===id)?.name||"—";
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const openAdd=()=>{
    setEditing(null);
    setForm({name:"",price:"",unit:"",supplierId:activeSupplier?.id||"",barcode1:"",barcode2:"",barcode3:""});
    setShowAdd(true);
  };
  const openEdit=(p)=>{
    setEditing(p.id);
    setForm({name:p.name,price:String(p.price||""),unit:p.unit||"",supplierId:p.supplierId,barcode1:p.barcode1||"",barcode2:p.barcode2||"",barcode3:p.barcode3||""});
    setShowAdd(true);
  };
  const openDuplicate=(p)=>{
    setEditing(null);
    setForm({name:p.name,price:String(p.price||""),unit:p.unit||"",supplierId:activeSupplier?.id||p.supplierId,barcode1:"",barcode2:"",barcode3:""});
    setShowAdd(true);
  };
  const save=()=>{
    const data={...form,price:Number(form.price)||0,unit:form.unit||"Boîte",supplierId:form.supplierId||activeSupplier?.id||""};
    if(editing) store.updateProduct(editing,data); else store.addProduct(data);
    setShowAdd(false);
  };

  const exportXLS=()=>{
    const rows=filtered.map(p=>[p.name,Number(p.price||0),p.unit,getSupplierName(p.supplierId),store.stock[p.id]||0]);
    downloadExcel("produits_"+Date.now()+".xlsx",rows,["Produit","Prix (FCFA)","Unité","Fournisseur","Stock"]);
  };

  const [scanReview,    setScanReview]    = useState(null); // résultat scan en attente de révision
  const [reviewOpen,    setReviewOpen]    = useState(false);

  const handleScanProducts=async(file)=>{
    if(!file) return;
    setScanMsg("⏳ Analyse du document...");
    try {
      const res=await scanDocumentWithAI(file, store.products);
      if(!res.success || !res.items || res.items.length===0){
        setScanMsg("⚠️ " + (res.error || "Aucun produit détecté. Vérifiez le fichier."));
        scanProdRef.current.value=""; return;
      }
      setScanMsg(""); // efface le message de chargement
      setScanReview(res);
      setReviewOpen(true); // ouvrir la modale de révision
    } catch(e) {
      setScanMsg("❌ Erreur : " + e.message);
    }
    scanProdRef.current.value="";
  };

  const handleConfirmImport = async (selectedRows) => {
    setReviewOpen(false);
    setScanMsg("⏳ Import en cours...");
    let added = 0;
    let skipped = 0;
    for (const row of selectedRows) {
      if (row.isNew) {
        // Nouveau produit → créer
        if (!row.productName?.trim()) continue;
        await store.addProduct({
          name:       row.productName.trim(),
          price:      Number(row.unitPrice||0),
          unit:       row.unit || "Boîte",
          supplierId: activeSupplier?.id || "",
        });
        added++;
      } else {
        skipped++; // produit existant sélectionné → on ne recrée pas
      }
    }
    const msgs = [];
    if (added > 0)   msgs.push("✅ " + added + " produit(s) ajouté(s)");
    if (skipped > 0) msgs.push("ℹ️ " + skipped + " produit(s) déjà dans la base (ignorés)");
    setScanMsg(msgs.join(" · ") || "ℹ️ Aucun nouveau produit ajouté.");
    setScanReview(null);
  };

  const thS={padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:700,color:"#64748b",borderBottom:"2px solid #e2e8f0",background:"#f8fafc"};
  const tdS={padding:"8px 10px",borderBottom:"1px solid #f1f5f9",fontSize:13};

  return(
    <div style={{padding:16}}>
      <PageHeader pageId="produits" title="💊 Produits"
        subtitle={activeSupplier?.name || "Tous fournisseurs"}>
        <button onClick={()=>setPrintModal(true)} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:11}}>🖨️</button>
        <button onClick={exportXLS} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:11}}>⬇️ Excel</button>
        <button onClick={()=>{setScanMsg("");scanProdRef.current?.click();}} style={{...btn(),background:"rgba(255,255,255,0.2)",color:"white",fontSize:11}}>📄 Importer</button>
        {can(currentUser,"produits","w")&&<button onClick={openAdd} style={{...btn(),background:"white",color:"#059669",fontWeight:700}}>+ Nouveau</button>}
        <input ref={scanProdRef} type="file" accept=".xlsx,.pdf,.jpg,.png" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleScanProducts(e.target.files[0]);e.target.value="";}}/>
      </PageHeader>

      {!activeSupplier&&<Alert type="warn">Affichage de tous les produits. Sélectionnez un fournisseur pour filtrer.</Alert>}
      {scanMsg&&<Alert type={scanMsg.startsWith("✅")?"success":scanMsg.startsWith("⚠️")||scanMsg.startsWith("ℹ️")?"warn":"error"}>{scanMsg}</Alert>}

      {/* Scanner code barre */}
      {showBarcodeScanner&&(
        <BarcodeScanner
          onDetected={(code)=>{
            if(showBarcodeScanner==="search"){
              setSearch(code);
              setShowBarcodeScanner(false);
            } else if(showBarcodeScanner==="form" && form._scanTarget){
              setForm(f=>({...f,[f._scanTarget]:code,_scanTarget:""}));
              setShowBarcodeScanner(false);
            }
          }}
          onClose={()=>setShowBarcodeScanner(false)}
        />
      )}

      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input style={{...input,flex:1,marginBottom:0}} placeholder="🔍 Rechercher par nom ou code barre..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <button onClick={()=>setShowBarcodeScanner("search")}
          title="Scanner un code barre pour rechercher"
          style={{...btn(),background:"#0891b2",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>
          📷
        </button>
      </div>

      {/* Modal ajout/modif */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title={editing?"✏️ Modifier Produit":"💊 Nouveau Produit"}>
        <div style={{marginBottom:12}}>
          <label style={label}>Nom du produit</label>
          <input style={input} list="products-suggestions" value={form.name}
            onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            placeholder="Saisir le nom complet du produit ou consommable"/>
          <datalist id="products-suggestions">
            {/* Médicaments courants */}
            {["Amoxicilline 500mg","Amoxicilline 1g","Ampicilline 500mg","Paracétamol 500mg",
              "Paracétamol 1g","Ibuprofène 400mg","Ibuprofène 200mg","Aspirine 500mg",
              "Métronidazole 250mg","Métronidazole 500mg","Cotrimoxazole 480mg",
              "Cotrimoxazole 960mg","Amoxicilline + Acide clavulanique 1g",
              "Ciprofloxacine 500mg","Doxycycline 100mg","Érythromycine 500mg",
              "Cloxacilline 500mg","Céfixime 200mg","Céfuroxime 500mg",
              "Oméprazole 20mg","Oméprazole 40mg","Ranitidine 150mg",
              "Metformine 500mg","Metformine 850mg","Metformine 1000mg",
              "Glibenclamide 5mg","Lisinopril 5mg","Lisinopril 10mg",
              "Amlodipine 5mg","Amlodipine 10mg","Atorvastatine 20mg",
              "Atorvastatine 40mg","Simvastatine 20mg","Losartan 50mg",
              "Furosémide 40mg","Spironolactone 25mg","Prednisolone 5mg",
              "Dexaméthasone 0.5mg","Prednisolone 20mg",
              "Salbutamol 4mg","Salbutamol spray","Béclométasone spray",
              "Diazépam 5mg","Phénobarbital 50mg","Carbamazépine 200mg",
              "Chloroquine 100mg","Arthémether + Luméfantrine","Quinine 300mg",
              "Artésunate injectable","Artéméther injectable",
              "Sérum glucosé 5%","Sérum glucosé 10%","Sérum physiologique 0.9%",
              "Ringer Lactate","Eau pour injection","Sang total",
              "Vitamine C 500mg","Vitamine B complexe","Fer + Acide folique",
              "Multivitamines","Calcium 500mg",
              /* Consommables */
              "Gants d'examen (paire)","Gants chirurgicaux stériles",
              "Seringue 2ml","Seringue 5ml","Seringue 10ml","Seringue 20ml",
              "Perfuseur","Cathéter IV 18G","Cathéter IV 20G","Cathéter IV 22G",
              "Compresse stérile 10x10","Compresse non stérile",
              "Bande de gaze","Bande élastique","Sparadrap","Pansement adhésif",
              "Coton hydrophile","Alcool 70°","Eau oxygénée 10 volumes",
              "Iode polyvidone solution","Iode polyvidone mousse",
              "Masque chirurgical","Masque FFP2","Lunettes de protection",
              "Tablier plastique","Sur-chaussures","Bonnet de bloc",
              "Lame de bistouri","Fil de suture résorbable","Fil de suture non résorbable",
              "Aiguille à suture","Trocart","Drain de Redon",
              "Sonde urinaire","Sonde nasogastrique","Sonde d'aspiration",
              "Thermomètre","Tensiomètre","Oxymètre de pouls",
              "Bandelette urinaire","Bandelette glycémique",
              "Test rapide paludisme","Test rapide grossesse","Test rapide VIH",
              "Lame porte-objet","Lamelle couvre-objet","Tube EDTA",
              "Tube sec","Tube hépariné","Boîte à aiguilles",
              "Sac poubelle rouge","Sac poubelle jaune","Container sharps"].map(s=>(
              <option key={s} value={s}/>
            ))}
            {/* Suggestions depuis les produits existants */}
            {store.products.filter(p=>p.name&&!["Amoxicilline 500mg"].includes(p.name)).map(p=>(
              <option key={p.id} value={p.name}/>
            ))}
          </datalist>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <label style={label}>Prix (FCFA)</label>
            <input style={input} type="number" min="0" value={form.price}
              onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="1200"/>
          </div>
          <div>
            <label style={label}>Unité <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(ou saisir)</span></label>
            <input style={input} list="units-list" value={form.unit||""}
              onChange={e=>setForm(f=>({...f,unit:e.target.value}))}
              placeholder="Boîte, Flacon, Pièce..."/>
            <datalist id="units-list">
              {["Boîte","Flacon","Ampoule","Sachet","Comprimé","Tube","Plaquette",
                "Pièce","Rouleau","Paquet","Litre","ml","Paire","Kit","Carton"].map(u=>(
                <option key={u} value={u}/>
              ))}
            </datalist>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={label}>Fournisseur</label>
          <select style={input} value={form.supplierId} onChange={e=>setForm(f=>({...f,supplierId:e.target.value}))}>
            <option value="">— Sélectionner —</option>
            {store.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!form.supplierId&&activeSupplier&&<div style={{fontSize:11,color:"#0891b2",marginTop:4}}>Par défaut : {activeSupplier.name}</div>}
        </div>

        {/* ── Codes barres (optionnels) ── */}
        <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 12px",marginBottom:16,border:"1px dashed #e2e8f0"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8}}>📦 Codes barres / QR codes <span style={{fontWeight:400}}>(optionnels)</span></div>
          {[["barcode1","Code 1 (principal)"],["barcode2","Code 2 (alternatif)"],["barcode3","Code 3 (lot/variante)"]].map(([field,lbl])=>(
            <div key={field} style={{marginBottom:8,display:"flex",gap:6,alignItems:"center"}}>
              <div style={{flex:1}}>
                <label style={{...label,marginBottom:2}}>{lbl}</label>
                <input style={{...input,fontFamily:"monospace",letterSpacing:1}}
                  value={form[field]||""}
                  onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
                  placeholder="Saisir ou scanner..."/>
              </div>
              <button type="button"
                onClick={()=>{
                  const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
                  // Utiliser BarcodeScanner intégré
                  setForm(f=>({...f,_scanTarget:field}));
                  setShowBarcodeScanner("form");
                }}
                style={{...btn(),background:"#0891b2",color:"white",padding:"6px 10px",marginTop:16,flexShrink:0,fontSize:14}}
                title="Scanner avec la caméra">
                📷
              </button>
            </div>
          ))}
        </div>

        <button onClick={save} disabled={!form.name||!(form.supplierId||activeSupplier?.id)}
          style={{...btn(),background:"#0891b2",color:"white",width:"100%",padding:11}}>
          {editing?"✏️ Enregistrer modifications":"💾 Enregistrer"}
        </button>
      </Modal>

      {/* Liste inventaire imprimable */}
      <PrintModal open={printModal} onClose={()=>setPrintModal(false)} title="Liste d'Inventaire">
        <div style={{marginBottom:12}}>
          <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
            <input type="checkbox" checked={showOldStock} onChange={e=>setShowOldStock(e.target.checked)}/>
            Afficher l'ancien stock (stock système)
          </label>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:12,borderBottom:"2px solid #0891b2"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={LOGO_B64} alt="CHNCAK" style={{width:55,height:55,borderRadius:"50%",objectFit:"cover"}}/>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"#0891b2"}}>CHNCAK</div>
              <div style={{fontSize:9,color:"#64748b"}}>Centre Hospitalier National Cheikh Ahmadoul Khadim</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>PharmaStock</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>LISTE DES PRODUITS</div>
            <div style={{fontSize:12,color:"#64748b"}}>{monthLabel()} · {activeSupplier?.name||"Tous fournisseurs"}</div>
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              <th style={thS}>Produit</th>
              <th style={thS}>Unité</th>
              <th style={thS}>Prix FCFA</th>
              {showOldStock&&<th style={thS}>Stock Système</th>}
              <th style={thS}>Stock Physique</th>
              <th style={thS}>Observations</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p=>(
              <tr key={p.id}>
                <td style={{...tdS,fontWeight:600}}>{p.name}</td>
                <td style={tdS}>{p.unit}</td>
                <td style={tdS}>{Number(p.price||0).toLocaleString("fr-FR")}</td>
                {showOldStock&&<td style={{...tdS,color:"#0891b2",fontWeight:700}}>{store.stock[p.id]||0}</td>}
                <td style={{...tdS,minWidth:80}}>___________</td>
                <td style={{...tdS,minWidth:120}}>___________</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{marginTop:16,display:"flex",justifyContent:"space-between",fontSize:11,color:"#94a3b8",borderTop:"1px solid #e2e8f0",paddingTop:10}}>
          <span>Signataire : ___________________________</span>
          <span>Date : {new Date().toLocaleDateString("fr-FR")}</span>
        </div>
      </PrintModal>

      {/* Modale de révision scan produits */}
      <ScanReviewModal
        open={reviewOpen}
        onClose={()=>{setReviewOpen(false);setScanReview(null);}}
        scanResult={scanReview}
        allProducts={store.products}
        activeSupplier={activeSupplier}
        onConfirm={handleConfirmImport}
        mode="products"
      />

      {/* Liste produits */}
      {/* ConfirmDelete pour produits */}
      <ConfirmDelete open={!!deletingProd} onClose={()=>setDeletingProd(null)}
        label={deletingProd?.name||""}
        onConfirm={()=>store.deleteProduct(deletingProd.id)}/>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(p=>{
          const qty=store.stock[p.id]||0;
          return(
            <div key={p.id} style={{...card,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{p.unit||"Boîte"} · {Number(p.price||0).toLocaleString("fr-FR")} FCFA</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{getSupplierName(p.supplierId)}</div>
                  {p.createdByName&&<div style={{fontSize:10,color:"#cbd5e1"}}>👤 {p.createdByName}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                  <div style={{fontWeight:800,color:qty<30?"#ef4444":"#059669",fontSize:16}}>{qty}</div>
                  <Badge color={qty<30?"#ef4444":"#059669"}>{qty<30?"Stock bas":"OK"}</Badge>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {can(currentUser,"produits","w")&&<button onClick={()=>openEdit(p)} style={{...btn(),background:"#f0f9ff",color:"#0891b2",padding:"4px 8px",fontSize:11}}>✏️</button>}
                    {can(currentUser,"produits","w")&&<button onClick={()=>openDuplicate(p)} title="Dupliquer" style={{...btn(),background:"#fdf4ff",color:"#7c3aed",padding:"4px 8px",fontSize:11}}>⧉</button>}
                    {can(currentUser,"produits","d")&&<button onClick={()=>setDeletingProd(p)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"4px 8px",fontSize:11}}>🗑️</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length===0&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun produit trouvé.</div>}
      </div>
    </div>
  );
}
