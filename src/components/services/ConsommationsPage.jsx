import { useState, useRef } from "react";
import { PageHeader } from "../ui/PageHeader";
import { can, hasServiceAccess } from "../../permissions";
import { btn, card, label, input } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { BarcodeScanner } from "../ui/ScanReviewModal";
import { PrintModal, ConsumptionPrint } from "../print/PrintTemplates";
import { Barcode } from "../ui/Barcode";
import { Modal } from "../ui/Modal";
import { computeAge, birthDateFromAge } from "../../helpers/age";

const EMPTY_FORM = {serviceId:"",patientId:"",patientName:"",patientBirthDate:"",patientAge:"",note:"",items:[]};

export function ConsommationsPage({store,currentUser}){
  const [show,setShow]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [cancelling,setCancelling]=useState(null);
  const [printSel,setPrintSel]=useState(null);
  const [form,setForm]=useState(EMPTY_FORM);
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [showScanner,setShowScanner]=useState(false);
  const [dupWarning,setDupWarning]=useState(null); // {prod, conso} en attente de confirmation
  const searchRef=useRef(null);
  const lastQtyRef=useRef(null);

  // Suggestion de filiation à la ressaisie d'un Patient ID déjà connu.
  // patientMode : null (pas encore de choix) | "suggestion" | "update" | "new"
  const [patientMatch,setPatientMatch]=useState(null); // dossier + historique trouvés
  const [patientMode,setPatientMode]=useState(null);
  const [patientIdChecked,setPatientIdChecked]=useState(""); // dernier ID déjà vérifié

  // Filtre de la liste principale des consommations (bouton Recherche) —
  // cliquer sur "N consommation(s) pour ce patient" dans le formulaire
  // applique simplement filters.patientId, réutilisant le même mécanisme.
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState({dateFrom:"",dateTo:"",patientId:"",patientName:"",createdBy:""});
  const hasActiveFilters = Object.values(filters).some(v=>v);

  // Un agent_service voit uniquement son service ; tout utilisateur restreint
  // par allowedServices ne voit que les services qui lui sont autorisés.
  const userServiceId=currentUser?.serviceId||"";
  const isServiceAgent=currentUser?.role==="agent_service"||currentUser?.role==="admin_service";
  const visibleServicesList=(isServiceAgent&&userServiceId
    ?(store.services||[]).filter(s=>s.id===userServiceId)
    :(store.services||[])
  ).filter(s=>hasServiceAccess(currentUser,s.id));

  const svcProds=form.serviceId
    ?Object.keys(store.svcStock||{}).filter(k=>k.startsWith(form.serviceId+"_")&&store.svcStock[k]>0).map(k=>{
        const prodId=k.split("_")[1];
        return {...(store.products.find(p=>p.id===prodId)||{}), svcQty:store.svcStock[k]};
      }).filter(p=>p.id)
    :[];

  const filtered=search.trim()
    ?svcProds.filter(p=>
        p.name?.toLowerCase().includes(search.toLowerCase())||
        [p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b.includes(search))
      )
    :svcProds;

  // Historique du patient en cours de saisie — évite la double saisie : dès
  // que le Patient ID est renseigné, on montre ses consommations passées.
  const patientHistory = form.patientId.trim()
    ? (store.consumptions||[]).filter(c=>(c.patientId||"").trim()===form.patientId.trim())
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
    : [];

  // Cherche, pour ce patient, une consommation du MÊME produit dans les 72h.
  const findRecentDuplicate = (productId) => {
    if (!form.patientId.trim()) return null;
    const cutoff = Date.now() - 72*3600*1000;
    for (const c of patientHistory) {
      const ts = (c.createdAt?.seconds||0)*1000;
      if (ts < cutoff) continue;
      const it = (c.items||[]).find(i=>i.productId===productId);
      if (it) return c;
    }
    return null;
  };

  // À la sortie du champ Patient ID : cherche un dossier existant (collection
  // "patients") ou, à défaut, une trace dans l'historique des consommations.
  const checkPatientId = async () => {
    const pid = form.patientId.trim();
    if (!pid || pid===patientIdChecked) return;
    setPatientIdChecked(pid);
    let record = await store.getPatient(pid);
    if (!record) {
      // À défaut de dossier dédié, reconstitue une suggestion depuis la
      // consommation la plus récente portant ce Patient ID.
      const last = (store.consumptions||[]).filter(c=>(c.patientId||"").trim()===pid)
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
      if (last) record = { patientId:pid, name:last.patientName||"", birthDate:last.patientBirthDate||"" };
    }
    if (record && (record.name||record.birthDate)) {
      setPatientMatch(record);
      setPatientMode(null); // attend le choix de l'utilisateur
    } else {
      setPatientMatch(null);
      setPatientMode(null);
    }
  };

  const chooseUseSuggestion = () => {
    setPatientMode("suggestion");
    setForm(f=>({
      ...f,
      patientName: patientMatch.name||"",
      patientBirthDate: patientMatch.birthDate||"",
      patientAge: patientMatch.birthDate ? String(computeAge(patientMatch.birthDate)??"") : f.patientAge,
    }));
  };
  const chooseUpdate = () => { setPatientMode("update"); };
  const chooseNew = () => { setPatientMode("new"); };

  // Synchronisation âge <-> date de naissance : l'un renseigné calcule l'autre.
  // La date de naissance reste la source de vérité stockée (l'âge est
  // recalculé à l'affichage, jamais figé — voir helpers/age.js).
  const onBirthDateChange = (val) => {
    setForm(f=>({...f, patientBirthDate:val, patientAge: val ? String(computeAge(val)??"") : f.patientAge}));
  };
  const onAgeChange = (val) => {
    setForm(f=>({...f, patientAge:val, patientBirthDate: val!==""?birthDateFromAge(val):f.patientBirthDate}));
  };

  const doAddItem=(prod)=>{
    setForm(f=>{
      const ex=f.items.find(it=>it.productId===prod.id);
      if(ex) return {...f,items:f.items.map(it=>it.productId===prod.id?{...it,qty:String(Number(it.qty)+1)}:it)};
      return {...f,items:[...f.items,{productId:prod.id,productName:prod.name,barcode:prod.barcode1||prod.barcode2||prod.barcode3||"",qty:"1",svcQty:prod.svcQty}]};
    });
    setSearch(""); setShowResults(false);
    setTimeout(()=>{lastQtyRef.current?.focus();lastQtyRef.current?.select();},80);
  };

  const addItem=(prod)=>{
    const dup = findRecentDuplicate(prod.id);
    if (dup) { setDupWarning({prod, conso:dup}); return; }
    doAddItem(prod);
  };

  const resetForm = () => {
    setForm({...EMPTY_FORM, serviceId:isServiceAgent?userServiceId:""});
    setPatientMatch(null); setPatientMode(null); setPatientIdChecked("");
    setEditingId(null);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({serviceId:c.serviceId, patientId:c.patientId||"", patientName:c.patientName||"", patientBirthDate:c.patientBirthDate||"", patientAge:c.patientAge||"", note:c.note||"", items:(c.items||[]).map(it=>({...it}))});
    setPatientMatch(null); setPatientMode("update"); setPatientIdChecked(c.patientId||"");
    setShow(true);
  };

  const save=async()=>{
    if(!form.serviceId){setMsg("⚠️ Sélectionnez un service.");return;}
    if(form.items.length===0){setMsg("⚠️ Ajoutez au moins un produit.");return;}
    setSaving(true);
    try{
      const svc=store.services?.find(s=>s.id===form.serviceId);
      if (editingId) {
        await store.updateConsumption(editingId, {...form, serviceName:svc?.name||""});
      } else {
        await store.addConsumption({...form,serviceName:svc?.name||""});
      }
      // Le dossier patient n'est mis à jour que si l'utilisateur a choisi de
      // réutiliser/corriger la filiation existante — jamais en mode "nouveau
      // patient" (pour ne pas écraser le dossier d'un homonyme d'ID par erreur).
      if (form.patientId.trim() && patientMode!=="new" && (form.patientName||form.patientBirthDate)) {
        await store.upsertPatient(form.patientId, {name:form.patientName, birthDate:form.patientBirthDate});
      }
      setMsg(editingId?"✅ Consommation modifiée !":"✅ Consommation enregistrée !");
      resetForm();
      setShow(false);
      setTimeout(()=>setMsg(""),4000);
    }catch(e){setMsg("❌ "+e.message);}
    setSaving(false);
  };

  const consumptions=(store.consumptions||[]).filter(c=>
    (!isServiceAgent||!userServiceId||c.serviceId===userServiceId) && hasServiceAccess(currentUser,c.serviceId)
  ).filter(c=>{
    if (filters.dateFrom || filters.dateTo) {
      const d = c.createdAt?.seconds ? new Date(c.createdAt.seconds*1000) : null;
      if (!d) return false;
      if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && d > new Date(filters.dateTo+"T23:59:59")) return false;
    }
    if (filters.patientId && !(c.patientId||"").toLowerCase().includes(filters.patientId.toLowerCase())) return false;
    if (filters.patientName && !(c.patientName||"").toLowerCase().includes(filters.patientName.toLowerCase())) return false;
    if (filters.createdBy && c.consumedBy!==filters.createdBy) return false;
    return true;
  });

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="consommations" title="💉 Consommations" subtitle="Traçabilité produits par patient">
        {can(currentUser,"consommations","w")&&<button onClick={()=>{setForm(f=>({...EMPTY_FORM,serviceId:isServiceAgent?userServiceId:""}));setPatientMatch(null);setPatientMode(null);setPatientIdChecked("");setShow(true);}} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>+ Saisir</button>}
      </PageHeader>
      <div style={{padding:16}}>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        {show&&(
          <div style={{...card,marginBottom:14,border:"2px solid #6366f1"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#3730a3"}}>💉 {editingId?"Modifier la consommation":"Saisie de consommation"}</div>
            {!isServiceAgent&&(
              <div style={{marginBottom:10}}>
                <label style={label}>Service</label>
                <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value,items:[]}))}>
                  <option value="">— Choisir —</option>
                  {visibleServicesList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Patient ID en premier — permet de proposer la filiation avant
                de saisir le reste des champs patient. */}
            <div style={{marginBottom:10}}>
              <label style={label}>Patient ID (voir cubix) <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(optionnel — à saisir en premier)</span></label>
              <input style={input} value={form.patientId}
                onChange={e=>{setForm(f=>({...f,patientId:e.target.value}));setPatientMatch(null);setPatientMode(null);}}
                onBlur={checkPatientId}
                placeholder="Ex: PAT-001"/>
            </div>

            {/* Suggestion de filiation si ce Patient ID est déjà connu */}
            {patientMatch&&patientMode===null&&(
              <div style={{...card,marginBottom:10,background:"#fffbeb",border:"1px solid #fcd34d",padding:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:8}}>ℹ️ Ce Patient ID est déjà connu</div>
                <table style={{width:"100%",fontSize:12,marginBottom:10,borderCollapse:"collapse"}}>
                  <tbody>
                    <tr><td style={{color:"#94a3b8",padding:"2px 6px 2px 0"}}>Nom</td><td style={{fontWeight:600}}>{patientMatch.name||"—"}</td></tr>
                    <tr><td style={{color:"#94a3b8",padding:"2px 6px 2px 0"}}>Date de naissance</td><td style={{fontWeight:600}}>{patientMatch.birthDate||"—"}</td></tr>
                    <tr><td style={{color:"#94a3b8",padding:"2px 6px 2px 0"}}>Âge</td><td style={{fontWeight:600}}>{patientMatch.birthDate?computeAge(patientMatch.birthDate)+" ans":"—"}</td></tr>
                  </tbody>
                </table>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <button onClick={chooseUseSuggestion} style={{...btn(),background:"#16a34a",color:"white",fontSize:12}}>✅ Utiliser ces informations</button>
                  <button onClick={chooseUpdate} style={{...btn(),background:"#f59e0b",color:"white",fontSize:12}}>✏️ Mettre à jour la filiation</button>
                  <button onClick={chooseNew} style={{...btn(),background:"#f1f5f9",color:"#374151",fontSize:12}}>🆕 Il s'agit d'un nouveau patient</button>
                </div>
              </div>
            )}
            {patientMode==="suggestion"&&<div style={{fontSize:11,color:"#059669",marginBottom:8}}>✅ Informations reprises du dossier existant — modifiables si besoin.</div>}
            {patientMode==="update"&&<div style={{fontSize:11,color:"#d97706",marginBottom:8}}>✏️ La filiation de ce Patient ID sera mise à jour avec les informations ci-dessous.</div>}
            {patientMode==="new"&&<div style={{fontSize:11,color:"#64748b",marginBottom:8}}>🆕 Nouveau patient — le dossier existant pour cet ID ne sera pas modifié.</div>}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div><label style={label}>Patient (optionnel)</label><input style={input} value={form.patientName} onChange={e=>setForm(f=>({...f,patientName:e.target.value}))} placeholder="Nom du patient"/></div>
              <div><label style={label}>Date de naissance</label><input style={input} type="date" value={form.patientBirthDate} onChange={e=>onBirthDateChange(e.target.value)}/></div>
              <div>
                <label style={label}>Âge <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(se recalcule automatiquement chaque année si la date de naissance est connue)</span></label>
                <input style={input} type="number" min="0" max="130" value={form.patientAge} onChange={e=>onAgeChange(e.target.value)} placeholder="Ex: 35"/>
              </div>
            </div>

            {/* Évite la double saisie sans surcharger le formulaire : juste un
                compteur cliquable, qui remplace la liste principale plus bas
                par les seules consommations de ce patient (toujours cliquables). */}
            {form.patientId.trim()&&patientHistory.length>0&&(
              <button onClick={()=>setFilters(f=>({...f,patientId:form.patientId.trim()}))}
                style={{...btn(),background:"#eef2ff",color:"#4f46e5",border:"1px solid #c7d2fe",fontSize:12,width:"100%",marginBottom:10,textAlign:"left"}}>
                📋 {patientHistory.length} consommation(s) pour ce patient — cliquer pour voir
              </button>
            )}

            {form.serviceId&&(
              <div style={{position:"relative",marginBottom:10}}>
                <label style={label}>Produit consommé</label>
                <div style={{display:"flex",gap:6}}>
                  <div style={{position:"relative",flex:1}}>
                    <input ref={searchRef} style={{...input,paddingLeft:32}} placeholder="Nom, code barre ou scanner..."
                      value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
                      onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                  </div>
                  <button onClick={()=>setShowScanner(true)}
                    title="Scanner un code barre"
                    style={{...btn(),background:"#4f46e5",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>
                    📷
                  </button>
                </div>
                {showScanner&&(
                  <BarcodeScanner
                    onDetected={code=>{
                      setShowScanner(false);
                      const found=svcProds.find(p=>
                        [p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code)||
                        p.name?.toLowerCase().includes(code.toLowerCase())
                      );
                      if(found) addItem(found);
                      else { setSearch(code); setShowResults(true); }
                    }}
                    onClose={()=>setShowScanner(false)}
                  />
                )}
                {showResults&&filtered.length>0&&(
                  <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
                    {filtered.map(p=>(
                      <div key={p.id} onMouseDown={()=>addItem(p)}
                        style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                        <div style={{fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#059669",fontWeight:700}}>Stock service : {p.svcQty}</div>
                      </div>
                    ))}
                  </div>
                )}
                {showResults&&search.trim()&&filtered.length===0&&(
                  <div style={{background:"#fef3c7",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",marginTop:4}}>
                    ⚠️ Aucun produit trouvé pour « {search} » dans le stock du service.
                  </div>
                )}
              </div>
            )}
            {form.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#eef2ff",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{it.productName}</div>
                  {it.barcode&&<div style={{marginTop:2}}><Barcode value={it.barcode} height={24} width={1.2} fontSize={8} margin={1}/></div>}
                </div>
                <div style={{fontSize:11,color:"#6366f1"}}>Stock:{it.svcQty}</div>
                <input ref={i===form.items.length-1?lastQtyRef:null}
                  type="number" min="1" max={it.svcQty} value={it.qty}
                  onChange={e=>setForm(f=>({...f,items:f.items.map((x,j)=>j===i?{...x,qty:e.target.value}:x)}))}
                  style={{width:60,padding:"4px 6px",border:"1px solid #a5b4fc",borderRadius:6,fontSize:12,textAlign:"center"}}/>
                <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                  style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"3px 7px",fontSize:11}}>✕</button>
              </div>
            ))}
            <div style={{marginBottom:10}}><label style={label}>Note</label><textarea style={{...input,height:50,resize:"none"}} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} disabled={saving}
                style={{...btn(),background:"#4f46e5",color:"white",flex:1,padding:10}}>
                {saving?"⏳ Enregistrement...":"✅ Enregistrer"}
              </button>
              <button onClick={()=>setShow(false)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>setShowFilters(v=>!v)} style={{...btn(),background:hasActiveFilters?"#4f46e5":"#eef2ff",color:hasActiveFilters?"white":"#4f46e5",fontSize:12}}>
            🔍 Recherche{hasActiveFilters?" (active)":""}
          </button>
          {hasActiveFilters&&<button onClick={()=>setFilters({dateFrom:"",dateTo:"",patientId:"",patientName:"",createdBy:""})} style={{...btn(),background:"#fee2e2",color:"#ef4444",fontSize:11}}>✕ Réinitialiser</button>}
        </div>

        {showFilters&&(
          <div style={{...card,marginBottom:12,padding:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={label}>Du</label><input type="date" style={input} value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></div>
              <div><label style={label}>Au</label><input type="date" style={input} value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></div>
            </div>
            <div style={{marginBottom:8}}><label style={label}>Patient ID</label><input style={input} value={filters.patientId} onChange={e=>setFilters(f=>({...f,patientId:e.target.value}))} placeholder="Ex: PAT-001"/></div>
            <div style={{marginBottom:8}}><label style={label}>Nom du patient</label><input style={input} value={filters.patientName} onChange={e=>setFilters(f=>({...f,patientName:e.target.value}))} placeholder="Nom..."/></div>
            <div><label style={label}>Créé par</label>
              <select style={input} value={filters.createdBy} onChange={e=>setFilters(f=>({...f,createdBy:e.target.value}))}>
                <option value="">— Tous —</option>
                {(store.users||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {consumptions.length===0&&!show&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>{hasActiveFilters?"Aucune consommation ne correspond à ce filtre.":"Aucune consommation enregistrée."}</div>}
        {consumptions.map(c=>(
          <div key={c.id} onClick={()=>setPrintSel(c)}
            style={{...card,marginBottom:8,cursor:"pointer",transition:"box-shadow 0.15s",opacity:c.status==="annule"?0.6:1}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(79,70,229,0.18)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=card.boxShadow}
            title="Cliquer pour voir le détail complet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>💉 {c.serviceName||"—"}</div>
                {c.patientName&&<div style={{fontSize:12,color:"#4f46e5",fontWeight:600}}>👤 {c.patientName}{c.patientId?" · "+c.patientId:""}</div>}
                <div style={{fontSize:11,color:"#64748b"}}>{c.consumedByName} · {c.createdAt?.seconds?new Date(c.createdAt.seconds*1000).toLocaleString("fr-FR"):"—"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                {c.status==="annule"
                  ? <span style={{background:"#fee2e2",color:"#b91c1c",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>annulée</span>
                  : <span style={{background:"#eef2ff",color:"#4f46e5",fontSize:10,fontWeight:700,borderRadius:99,padding:"2px 8px"}}>{(c.items||[]).length} produit(s)</span>}
                {c.status!=="annule"&&can(currentUser,"consommations","w")&&(
                  <div style={{display:"flex",gap:4}}>
                    {can(currentUser,"consommations","w")&&<button onClick={e=>{e.stopPropagation();openEdit(c);}} title="Modifier" style={{...btn(),background:"#eef2ff",color:"#4f46e5",padding:"2px 7px",fontSize:11}}>✏️</button>}
                    {can(currentUser,"consommations","w")&&<button onClick={e=>{e.stopPropagation();setCancelling(c);}} title="Annuler" style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"2px 7px",fontSize:11}}>🚫</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <PrintModal open={!!printSel} onClose={()=>setPrintSel(null)} title="Bon de Consommation">
        <ConsumptionPrint c={printSel}/>
      </PrintModal>

      <Modal open={!!dupWarning} onClose={()=>setDupWarning(null)} title="⚠️ Produit déjà saisi récemment">
        {dupWarning&&(
          <div>
            <div style={{background:"#fef3c7",borderRadius:8,padding:12,marginBottom:14,fontSize:13,color:"#92400e"}}>
              <b>{dupWarning.conso.consumedByName||"Un autre utilisateur"}</b> a déjà saisi une consommation de{" "}
              <b>{dupWarning.prod.name}</b> pour ce patient
              {dupWarning.conso.createdAt?.seconds?" le "+new Date(dupWarning.conso.createdAt.seconds*1000).toLocaleString("fr-FR"):""}
              {" "}(moins de 72h). Voulez-vous continuer ?
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{doAddItem(dupWarning.prod);setDupWarning(null);}}
                style={{...btn(),background:"#f59e0b",color:"white",flex:1,padding:10}}>Continuer quand même</button>
              <button onClick={()=>setDupWarning(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Annuler</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!cancelling} onClose={()=>setCancelling(null)} title="🚫 Annuler cette consommation ?">
        {cancelling&&(
          <div>
            <div style={{fontSize:13,color:"#374151",marginBottom:12}}>
              Cette consommation sera marquée "annulée" (jamais supprimée) et les quantités seront restituées au stock du service <b>{cancelling.serviceName}</b>.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                try{ await store.cancelConsumption(cancelling.id); setCancelling(null); }
                catch(e){ setMsg("❌ "+e.message); }
              }} style={{...btn(),background:"#ef4444",color:"white",flex:1,padding:10}}>🚫 Confirmer l'annulation</button>
              <button onClick={()=>setCancelling(null)} style={{...btn(),background:"#f1f5f9",color:"#374151",padding:10}}>Retour</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
