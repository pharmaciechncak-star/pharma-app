import { useState, useRef } from "react";
import { downloadExcel } from "../helpers/exportUtils";
import { scanDocumentWithAI } from "../hooks/useAI";
import { PageHeader } from "./ui/PageHeader";
import { btn, input, label, card } from "../helpers/styles";
import { can, hasSupplierAccess } from "../permissions";
import { Alert, Badge } from "./ui/FormControls";
import { BarcodeScanner, ScanReviewModal } from "./ui/ScanReviewModal";
import { Modal, ConfirmDelete } from "./ui/Modal";
import { PrintModal } from "./print/PrintTemplates";
import { LOGO_B64 } from "../images";
import { monthLabel } from "../constants";

export function ProductsPage({store,activeSupplier,currentUser}){
  // Un gestionnaire/pharmacien (circuit vente) ne doit pas pouvoir marquer un
  // produit "Fonctionnement" — c'est le domaine réservé au Comptable Matière,
  // et inversement. L'admin principal seul peut toucher aux deux.
  const isFonctRole = currentUser?.role==="comptable_matiere"||currentUser?.role==="comptable_matiere_principal";
  const canEditVenteCircuit = currentUser?.role==="admin" || !isFonctRole;
  const canEditFonctCircuit = currentUser?.role==="admin" || isFonctRole;
  const [showAdd,setShowAdd]=useState(false);
  const [showTypesManager,setShowTypesManager]=useState(false);
  const [showCircuitsManager,setShowCircuitsManager]=useState(false);
  const [newCircuitKey,setNewCircuitKey]=useState("");
  const [newCircuitLabel,setNewCircuitLabel]=useState("");
  const [newCircuitIcon,setNewCircuitIcon]=useState("📁");
  const [circuitError,setCircuitError]=useState("");
  const [editingCircuitId,setEditingCircuitId]=useState(null);
  const [editingCircuitLabel,setEditingCircuitLabel]=useState("");
  const [deletingCircuit,setDeletingCircuit]=useState(null);
  const [newTypeName,setNewTypeName]=useState("");
  const [editingTypeId,setEditingTypeId]=useState(null);
  const [editingTypeName,setEditingTypeName]=useState("");
  const [deletingType,setDeletingType]=useState(null);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",price:"",unit:"Boîte",supplierId:""});
  const [printModal,setPrintModal]=useState(false);
  const [showOldStock,setShowOldStock]=useState(false);
  const [search,setSearch]=useState("");
  const [scanMsg,setScanMsg]=useState("");
  const [deletingProd,setDeletingProd]=useState(null);
  const scanProdRef=useRef(null);

  // Si aucun fournisseur actif choisi, on ne montre que les produits des
  // fournisseurs auxquels l'utilisateur a accès (visibleSuppliers côté "tous"),
  // pour éviter qu'un utilisateur restreint contourne sa restriction en
  // désélectionnant simplement le fournisseur actif.
  const products=activeSupplier
    ? store.products.filter(p=>p.supplierId===activeSupplier.id)
    : store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId));
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
    setForm({name:"",price:"",unit:"",supplierId:activeSupplier?.id||"",barcode1:"",barcode2:"",barcode3:"",reorderThreshold:"",circuits:[isFonctRole?"fonctionnement":"vente"],compteNumero:"",typeFonct:""});
    setShowAdd(true);
  };
  const openEdit=(p)=>{
    setEditing(p.id);
    setForm({name:p.name,price:String(p.price||""),unit:p.unit||"",supplierId:p.supplierId,barcode1:p.barcode1||"",barcode2:p.barcode2||"",barcode3:p.barcode3||"",reorderThreshold:p.reorderThreshold!=null?String(p.reorderThreshold):"",circuits:(p.circuits&&p.circuits.length)?p.circuits:["vente"],compteNumero:p.compteNumero||"",typeFonct:p.typeFonct||""});
    setShowAdd(true);
  };
  const openDuplicate=(p)=>{
    setEditing(null);
    setForm({name:p.name,price:String(p.price||""),unit:p.unit||"",supplierId:activeSupplier?.id||p.supplierId,barcode1:"",barcode2:"",barcode3:"",reorderThreshold:p.reorderThreshold!=null?String(p.reorderThreshold):"",circuits:(p.circuits&&p.circuits.length)?p.circuits:["vente"],compteNumero:p.compteNumero||"",typeFonct:p.typeFonct||""});
    setShowAdd(true);
  };
  const toggleCircuit = (c) => {
    // Sécurité : ignore un clic sur un circuit que ce rôle n'a pas le droit
    // de gérer (case déjà désactivée visuellement, ceci est le filet).
    if (c==="vente" && !canEditVenteCircuit) return;
    if (c==="fonctionnement" && !canEditFonctCircuit) return;
    if (c!=="vente" && c!=="fonctionnement" && currentUser?.role!=="admin") return; // circuits additionnels : admin uniquement
    setForm(f=>{
      const cur=f.circuits||["vente"];
      return {...f, circuits: cur.includes(c)?cur.filter(x=>x!==c):[...cur,c]};
    });
  };
  const save=()=>{
    const data={...form,price:Number(form.price)||0,unit:form.unit||"Boîte",supplierId:form.supplierId||activeSupplier?.id||"",reorderThreshold:form.reorderThreshold===""?null:Number(form.reorderThreshold)};
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
      // Un produit importé doit être comparé aux produits DU MÊME fournisseur
      // uniquement — sinon un produit similaire chez un autre fournisseur est
      // reconnu à tort comme "déjà existant" et l'import écrase sa fiche au
      // lieu de créer une entrée distincte pour ce fournisseur.
      const suppScopedProducts = activeSupplier
        ? store.products.filter(p=>p.supplierId===activeSupplier.id)
        : store.products.filter(p=>hasSupplierAccess(currentUser,p.supplierId));
      const res=await scanDocumentWithAI(file, suppScopedProducts);
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
          circuits:   [isFonctRole?"fonctionnement":"vente"],
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

        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <label style={label}>Circuit(s) <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(où ce produit est visible)</span></label>
            {currentUser?.role==="admin"&&<button onClick={()=>setShowCircuitsManager(true)} style={{...btn(),background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",fontSize:10,padding:"3px 8px"}}>⚙️ Gérer les circuits</button>}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[
              ["vente","💊 Vente",canEditVenteCircuit],
              ["fonctionnement","📦 Fonctionnement",canEditFonctCircuit],
              // Circuits additionnels (préparation pour de futures comptabilités)
              // — éditables par l'admin principal uniquement pour l'instant.
              ...(store.circuitsRegistry||[]).map(c=>[c.key, c.icon+" "+c.label, currentUser?.role==="admin"]),
            ].map(([c,lb,editable])=>(
              <label key={c} title={editable?"":"Réservé à l'autre domaine — vous ne pouvez pas le modifier"}
                style={{display:"flex",alignItems:"center",gap:5,fontSize:12,background:(form.circuits||["vente"]).includes(c)?"#eef2ff":"white",border:"1px solid "+((form.circuits||["vente"]).includes(c)?"#818cf8":"#e2e8f0"),borderRadius:6,padding:"6px 10px",cursor:editable?"pointer":"not-allowed",flex:1,minWidth:120,opacity:editable?1:0.5}}>
                <input type="checkbox" checked={(form.circuits||["vente"]).includes(c)} onChange={()=>toggleCircuit(c)} disabled={!editable}/>
                {lb}
              </label>
            ))}
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={label}>N° Compte <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(nomenclature comptable — optionnel, ex: 28.01.408)</span></label>
          <input style={input} value={form.compteNumero||""} onChange={e=>setForm(f=>({...f,compteNumero:e.target.value}))} placeholder="Ex: 28.01.408"/>
        </div>

        {(form.circuits||[]).includes("fonctionnement")&&(
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <label style={label}>Type <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(classement — optionnel)</span></label>
              {isFonctRole&&<button onClick={()=>setShowTypesManager(true)} style={{...btn(),background:"#fff7ed",color:"#9a3412",border:"1px solid #fdba74",fontSize:10,padding:"3px 8px"}}>⚙️ Gérer les types</button>}
            </div>
            <select style={input} value={form.typeFonct||""} onChange={e=>setForm(f=>({...f,typeFonct:e.target.value}))}>
              <option value="">— Aucun —</option>
              {(store.productTypesFonct||[]).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <label style={label}>Seuil de réapprovisionnement <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel)</span></label>
          <input style={input} type="number" min="0" value={form.reorderThreshold||""}
            onChange={e=>setForm(f=>({...f,reorderThreshold:e.target.value}))}
            placeholder="Ex : 20 — alerte si le stock descend en dessous"/>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>Utilisé dans Statistiques → « Produits à commander »</div>
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
                  <div style={{fontSize:10,color:"#b45309",fontWeight:600}}>
                    {(p.circuits&&p.circuits.length?p.circuits:["vente"]).map(c=>c==="vente"?"💊 Vente":"📦 Fonctionnement").join(" · ")}
                  </div>
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

      <Modal open={showTypesManager} onClose={()=>{setShowTypesManager(false);setEditingTypeId(null);setNewTypeName("");}} title="⚙️ Gérer les types">
        <div style={{fontSize:11,color:"#64748b",marginBottom:12}}>Liste libre — ajoutez, renommez ou supprimez les types que vous utilisez pour classer vos produits.</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          <input style={input} placeholder="Nouveau type..." value={newTypeName} onChange={e=>setNewTypeName(e.target.value)}
            onKeyDown={async e=>{ if(e.key==="Enter" && newTypeName.trim()){ await store.addProductTypeFonct(newTypeName.trim()); setNewTypeName(""); } }}/>
          <button onClick={async()=>{ if(newTypeName.trim()){ await store.addProductTypeFonct(newTypeName.trim()); setNewTypeName(""); } }}
            style={{...btn(),background:"#9a3412",color:"white",fontSize:12,padding:"8px 14px"}}>+ Ajouter</button>
        </div>
        {(store.productTypesFonct||[]).length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:10}}>Aucun type créé.</div>}
        {(store.productTypesFonct||[]).map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
            {editingTypeId===t.id?(
              <>
                <input style={{...input,flex:1,padding:"5px 8px"}} value={editingTypeName} onChange={e=>setEditingTypeName(e.target.value)} autoFocus/>
                <button onClick={async()=>{ if(editingTypeName.trim()){ await store.renameProductTypeFonct(t.id,editingTypeName.trim()); } setEditingTypeId(null); }} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 8px"}}>✓</button>
                <button onClick={()=>setEditingTypeId(null)} style={{...btn(),background:"#f1f5f9",color:"#64748b",fontSize:11,padding:"4px 8px"}}>✕</button>
              </>
            ):(
              <>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{t.name}</div>
                <button onClick={()=>{setEditingTypeId(t.id);setEditingTypeName(t.name);}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>setDeletingType(t)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
              </>
            )}
          </div>
        ))}
      </Modal>
      <ConfirmDelete open={!!deletingType} onClose={()=>setDeletingType(null)}
        label={deletingType?.name||""}
        onConfirm={async()=>{ await store.deleteProductTypeFonct(deletingType.id); setDeletingType(null); }}/>

      <Modal open={showCircuitsManager} onClose={()=>{setShowCircuitsManager(false);setEditingCircuitId(null);setNewCircuitKey("");setNewCircuitLabel("");setCircuitError("");}} title="⚙️ Gérer les circuits">
        <div style={{fontSize:11,color:"#64748b",marginBottom:12}}>« Vente » et « Fonctionnement » sont les circuits existants (avec leurs propres pages). Ajoutez ici un circuit supplémentaire si une nouvelle comptabilité doit un jour différencier ses propres produits — la case à cocher apparaîtra immédiatement sur chaque produit.</div>
        {circuitError&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"6px 10px",fontSize:11,marginBottom:10}}>{circuitError}</div>}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          <input style={{...input,width:50,textAlign:"center"}} value={newCircuitIcon} onChange={e=>setNewCircuitIcon(e.target.value)} placeholder="📁"/>
          <input style={input} placeholder="Clé (ex: administratif)" value={newCircuitKey} onChange={e=>setNewCircuitKey(e.target.value)}/>
          <input style={input} placeholder="Libellé affiché" value={newCircuitLabel} onChange={e=>setNewCircuitLabel(e.target.value)}/>
          <button onClick={async()=>{
            setCircuitError("");
            try{ await store.addCircuit(newCircuitKey,newCircuitLabel,newCircuitIcon); setNewCircuitKey("");setNewCircuitLabel("");setNewCircuitIcon("📁"); }
            catch(e){ setCircuitError(e.message); }
          }} style={{...btn(),background:"#374151",color:"white",fontSize:12,padding:"8px 14px",flexShrink:0}}>+ Ajouter</button>
        </div>
        {(store.circuitsRegistry||[]).length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:10}}>Aucun circuit supplémentaire créé.</div>}
        {(store.circuitsRegistry||[]).map(c=>(
          <div key={c.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
            {editingCircuitId===c.id?(
              <>
                <input style={{...input,flex:1,padding:"5px 8px"}} value={editingCircuitLabel} onChange={e=>setEditingCircuitLabel(e.target.value)} autoFocus/>
                <button onClick={async()=>{ if(editingCircuitLabel.trim()){ await store.renameCircuit(c.id,editingCircuitLabel.trim(),c.icon); } setEditingCircuitId(null); }} style={{...btn(),background:"#dcfce7",color:"#166534",fontSize:11,padding:"4px 8px"}}>✓</button>
                <button onClick={()=>setEditingCircuitId(null)} style={{...btn(),background:"#f1f5f9",color:"#64748b",fontSize:11,padding:"4px 8px"}}>✕</button>
              </>
            ):(
              <>
                <div style={{flex:1,fontSize:12,fontWeight:600}}>{c.icon} {c.label} <span style={{fontWeight:400,color:"#94a3b8"}}>({c.key})</span></div>
                <button onClick={()=>{setEditingCircuitId(c.id);setEditingCircuitLabel(c.label);}} style={{...btn(),background:"#f0f9ff",color:"#0891b2",fontSize:11,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>setDeletingCircuit(c)} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11,padding:"4px 8px"}}>🗑️</button>
              </>
            )}
          </div>
        ))}
      </Modal>
      <ConfirmDelete open={!!deletingCircuit} onClose={()=>setDeletingCircuit(null)}
        label={deletingCircuit?.label||""}
        onConfirm={async()=>{ await store.deleteCircuit(deletingCircuit.id); setDeletingCircuit(null); }}/>
    </div>
  );
}
