import { useState, useMemo } from "react";
import { PageHeader } from "../ui/PageHeader";
import { card, label, input, btn } from "../../helpers/styles";
import { Alert } from "../ui/FormControls";
import { can, productVisibleInCircuit } from "../../permissions";
import { getComptaCircuits, availableCircuits } from "../../helpers/circuitsConfig";
import { CircuitSelector } from "../ui/CircuitSelector";
import { PrintModal, ReleveRecapPrint, PvRecensementPrint, CertificatAdministratifPrint, CompteGestionPrint } from "../print/PrintTemplates";
import { getPrintModel } from "../../helpers/printModels";
import { existantRows, dayOfTs, entreeDate, retourDate, sortieDate } from "../../helpers/comptaCalc";
import { downloadExcelTable } from "../../helpers/exportUtils";
import { fmtDate } from "../../constants";

// Clôture de gestion (Instruction générale ; doc. de formation diapos 54,
// 123 à 136) — opérations de fin de gestion, dans l'ordre :
//   1. Relevé récapitulatif (existant d'après les écritures, à la date d'arrêté)
//   2. Recensement par la commission → PV de recensement (existant constaté, écarts)
//   3. Certificat administratif portant autorisation (s'il y a des écarts)
//   4. Régularisation : bon d'entrée (excédents) / bon de sortie définitive (déficits)
//   5. Balance d'entrée de la gestion suivante (bon d'entrée n°1)
//   + Compte de gestion des matières (balance générale de l'année).
export function ClotureGestionPage({ store, currentUser }){
  const COMPTA_CIRCUITS = getComptaCircuits(store);
  const available = availableCircuits(currentUser,"inventaire");
  const [circuit,setCircuit] = useState(available[0]||"fonctionnement");
  const cfg = COMPTA_CIRCUITS[circuit];
  const isF = circuit==="fonctionnement";
  const entrees = (isF?store.entreesFonct:store.entreesNp)||[];
  const sorties = (isF?store.sortiesFonct:store.sortiesNp)||[];
  const retours = (isF?store.retoursFonct:store.retoursNp)||[];
  const addEntree = isF?store.addEntreeFonct:store.addEntreeNp;
  const addSortie = isF?store.addSortieFonct:store.addSortieNp;
  const permSection = isF ? "inventaire-fonct" : "inventaire-np";
  const canW = can(currentUser,permSection,"w");

  const thisYear = new Date().getFullYear();
  const [year,setYear] = useState(thisYear);
  const id = circuit+"_"+year;
  const cl = (store.clotures||[]).find(c=>c.id===id) || null;
  const [dateDraft,setDateDraft] = useState("");
  const date = cl?.date || dateDraft || `${year}-12-31`;
  const locked = !!cl && cl.status && cl.status!=="brouillon";

  const [msg,setMsg] = useState("");
  const [busy,setBusy] = useState("");
  const [print,setPrint] = useState(null);
  const say = m => { setMsg(m); setTimeout(()=>setMsg(""),7000); };

  const products = useMemo(()=> (store.products||[]).filter(p=>productVisibleInCircuit(p,circuit,store.suppliers)), [store.products, store.suppliers, circuit]);
  const data = { entrees, sorties, retours, affectations:store.affectations||[], circuit };
  const releve = useMemo(()=> existantRows(data, products, { to:date }), [entrees, sorties, retours, products, date, store.affectations]); // eslint-disable-line
  const compte = useMemo(()=> existantRows(data, products, { from:`${year}-01-01`, to:`${year}-12-31` }), [entrees, sorties, retours, products, year, store.affectations]); // eslint-disable-line

  const commission = (store.pvResponsables||[]).filter(r=>r.circuit===circuit).map(r=>({
    displayName: r.interimName ? `${r.interimName} (intérim de ${r.personName||"—"})` : (r.personName||""), fonctionName:r.fonctionName||"",
  }));

  // ── Brouillon de recensement ──
  const [draft,setDraft] = useState(null); // lignes en cours de saisie
  const lignes = draft || cl?.lignes || [];
  const startRecensement = () => {
    setDraft(releve.map(r=>({ productId:r.productId, compteNumero:r.compteNumero, productName:r.productName, unit:r.unit, pu:r.pu,
      existantComptable:r.existantFin, constate:r.existantFin, ecart:0, observation:"" })));
  };
  const setConstate = (pid, v) => setDraft(L=>(L||lignes).map(l=>l.productId!==pid?l:{...l, constate:v===""?"":Number(v), ecart:(v===""?0:Number(v))-l.existantComptable}));
  const setObs = (pid, v) => setDraft(L=>(L||lignes).map(l=>l.productId!==pid?l:{...l, observation:v}));
  const ecarts = lignes.filter(l=>l.ecart);

  const saveDraft = async () => {
    setBusy("draft");
    try{ await store.saveCloture(id, { circuit, year, date, status:"brouillon", lignes:lignes.map(l=>({...l,constate:Number(l.constate)||0})) }, null); setDraft(null); say("✅ Saisie du recensement enregistrée (brouillon)."); }
    catch(e){ say("❌ "+e.message); }
    setBusy("");
  };
  const validateRecensement = async () => {
    if (lignes.some(l=>l.constate===""||l.constate==null)) { say("⚠️ Renseignez l'existant constaté de chaque article."); return; }
    setBusy("valid");
    try{
      const num = await store.allocateNumber("PVR", circuit, date);
      await store.saveCloture(id, { circuit, year, date, status:"recense", lignes:lignes.map(l=>({...l,constate:Number(l.constate)||0})), pvNumero:num.reference }, `PV de recensement ${num.reference} validé (${cfg.label}, gestion ${year})`);
      setDraft(null); say("✅ Recensement validé — PV de recensement n° "+num.reference);
    }catch(e){ say("❌ "+e.message); }
    setBusy("");
  };

  const [motifEcarts,setMotifEcarts] = useState("");
  const etablirCertificat = async () => {
    setBusy("ca");
    try{
      const num = await store.allocateNumber("CA", circuit, date);
      await store.saveCloture(id, { status:"certifie", certificatNumero:num.reference, certificatDate:new Date().toISOString().slice(0,10), motifEcarts:motifEcarts||cl?.motifEcarts||"" }, `Certificat administratif ${num.reference} établi (${cfg.label}, gestion ${year})`);
      say("✅ Certificat administratif n° "+num.reference+" — à faire signer par l'ordonnateur avant la régularisation.");
    }catch(e){ say("❌ "+e.message); }
    setBusy("");
  };

  const regulariser = async () => {
    setBusy("regul");
    try{
      const pieces = `Relevé récapitulatif du ${fmtDate(date)}, PV de recensement n° ${cl.pvNumero}, certificat administratif n° ${cl.certificatNumero}`;
      const exc = cl.lignes.filter(l=>l.ecart>0), def = cl.lignes.filter(l=>l.ecart<0);
      let regulBE="", regulBSD="";
      if (exc.length) {
        // Datée à l'arrêté des écritures : la régularisation appartient à la gestion clôturée.
        const ref = await addEntree({ typeEntree:"certificat", date, supplierId:"", supplierName:"Régularisation (excédent)", sourceRef:"",
          items: exc.map(l=>({ productId:l.productId, productName:l.productName, qty:String(l.ecart), unitPrice:String(l.pu), lot:"", expiry:"" })),
          notes:`Régularisation — excédents constatés au recensement. ${pieces}.` });
        regulBE = ref?.id||"ok";
      }
      if (def.length) {
        const ref = await addSortie({ nature:"definitive", motif:"perte", dateOperation:date, piecesJustificatives:pieces, serviceId:"", beneficiaireId:"", beneficiaireName:"", serviceName:"Perte / déficit (régularisation)",
          items: def.map(l=>({ productId:l.productId, productName:l.productName, qty:String(-l.ecart) })),
          notes:`Régularisation — déficits constatés au recensement. ${pieces}.`, sourceRef:"" });
        regulBSD = ref?.id||"ok";
      }
      await store.saveCloture(id, { status:"regularise", regulBE, regulBSD, regulDate:new Date().toISOString().slice(0,10) }, `Écritures de régularisation passées (${cfg.label}, gestion ${year})`);
      say("✅ Écritures de régularisation passées"+(exc.length?" — bon d'entrée (excédents)":"")+(def.length?" — bon de sortie définitive (déficits)":"")+".");
    }catch(e){ say("❌ "+e.message); }
    setBusy("");
  };

  const balanceExistante = entrees.find(e=>e.typeEntree==="balance" && e.status!=="annule" && String(e.date||"").startsWith(String(year+1)));
  const balanceAnnulee = entrees.some(e=>e.typeEntree==="balance" && e.status==="annule" && String(e.date||"").startsWith(String(year+1)));
  const etablirBalance = async () => {
    setBusy("bal");
    try{
      const items = cl.lignes.filter(l=>Number(l.constate)>0).map(l=>({ productId:l.productId, productName:l.productName, qty:String(l.constate), unitPrice:String(l.pu), lot:"", expiry:"" }));
      if (!items.length) throw new Error("Aucun article en existant : rien à reprendre en balance d'entrée.");
      await addEntree({ typeEntree:"balance", replaceBalance:balanceAnnulee, date:`${year+1}-01-01`, supplierId:"", supplierName:"Balance d'entrée", sourceRef:"",
        items, notes:`Balance d'entrée de la gestion ${year+1} — reprise de l'existant au ${fmtDate(date)} (PV de recensement n° ${cl.pvNumero}).` });
      await store.saveCloture(id, { status:"cloture", balanceDate:new Date().toISOString().slice(0,10) }, `Gestion ${year} clôturée — balance d'entrée ${year+1} établie (${cfg.label})`);
      say("✅ Gestion "+year+" clôturée — bon d'entrée n°1 de "+(year+1)+" (balance d'entrée) enregistré.");
    }catch(e){ say("❌ "+e.message); }
    setBusy("");
  };

  // Pièces justificatives de l'année (pour le compte de gestion)
  const inYear = d => String(d||"").startsWith(String(year));
  const pieces = {
    be: entrees.filter(e=>e.status!=="annule" && inYear(entreeDate(e))).length,
    bsd: sorties.filter(s=>s.status!=="annule" && s.nature!=="provisoire" && inYear(sortieDate(s))).length,
    bsp: sorties.filter(s=>s.status!=="annule" && s.nature==="provisoire" && inYear(sortieDate(s))).length,
    br: retours.filter(r=>r.status!=="annule" && inYear(retourDate(r))).length,
    pv: (store.procesVerbaux||[]).filter(p=>p.circuit===circuit && inYear(p.dateReception||dayOfTs(p.createdAt))).length,
    pvr: cl?.pvNumero||"",
  };
  const exportCompte = () => {
    downloadExcelTable({ filename:`compte_gestion_${circuit}_${year}`, title:"COMPTE DE GESTION DES MATIÈRES", subtitle:`${cfg.label} — gestion ${year}`,
      headers:["N° compte","Désignation","Existant début","Entrées","Total entrées","Sorties définitives","Existant fin","dont en attente d'affectation","dont en service","dont en sortie provisoire","P.U.","Valeur existant fin"],
      rows: compte.map(r=>[r.compteNumero,r.productName,r.existantDebut,r.entrees,r.totalEntrees,r.sortiesDef+r.retours,r.existantFin,r.enMagasin,r.enService,r.enSortieProv,r.pu,r.valeur]) });
  };

  const step = (n, title, done, children, hint) => (
    <div style={{...card,marginBottom:12,borderLeft:"4px solid "+(done?"#059669":"#cbd5e1")}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{width:24,height:24,borderRadius:99,background:done?"#059669":"#e2e8f0",color:done?"white":"#475569",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800}}>{done?"✓":n}</span>
        <span style={{fontWeight:800,fontSize:13.5,color:"#1e293b"}}>{title}</span>
      </div>
      {hint&&<div style={{fontSize:11,color:"#64748b",marginBottom:8}}>{hint}</div>}
      {children}
    </div>
  );
  const status = cl?.status||"";
  const order = ["brouillon","recense","certifie","regularise","cloture"];
  const reached = s => order.indexOf(status) >= order.indexOf(s);
  const needCertif = (cl?.lignes||[]).some(l=>l.ecart);
  const b = (c="#334155") => ({...btn(),background:c,color:"white",fontSize:12});
  const bLight = {...btn(),background:"#f1f5f9",color:"#334155",border:"1px solid #e2e8f0",fontSize:12};

  return (
    <div style={{padding:0}}>
      <PageHeader pageId="cloture-compta" title={"🔒 Clôture de gestion — "+cfg.label} subtitle="Recensement, régularisation, balance d'entrée et compte de gestion"/>
      <div style={{padding:16,maxWidth:1100,margin:"0 auto"}}>
        <CircuitSelector circuit={circuit} setCircuit={c=>{setCircuit(c);setDraft(null);}} available={available} circuits={COMPTA_CIRCUITS}/>
        {msg&&<Alert type={msg.startsWith("✅")?"success":"warn"}>{msg}</Alert>}

        <div style={{...card,marginBottom:12,display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div><label style={label}>Gestion (année)</label>
            <select style={{...input,width:120}} value={year} onChange={e=>{setYear(Number(e.target.value));setDraft(null);setDateDraft("");}}>
              {[thisYear+1,thisYear,thisYear-1,thisYear-2].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div><label style={label}>Date d'arrêté des écritures</label>
            <input type="date" style={{...input,width:170}} value={date} disabled={locked} onChange={e=>setDateDraft(e.target.value)}/>
          </div>
          <div style={{fontSize:11.5,color:"#64748b",flex:1,minWidth:220}}>
            État : <b>{({"":"non commencée",brouillon:"recensement en cours de saisie",recense:"recensement validé",certifie:"certificat administratif établi",regularise:"écarts régularisés",cloture:"gestion clôturée"})[status]}</b>
            {cl?.pvNumero&&<> · PV de recensement <b>{cl.pvNumero}</b></>}{cl?.certificatNumero&&<> · Certificat <b>{cl.certificatNumero}</b></>}
          </div>
        </div>

        {step(1, "Relevé récapitulatif des matières", reached("brouillon"),
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#334155",alignSelf:"center"}}>{releve.length} article(s) en existant au {fmtDate(date)}</span>
            <button style={bLight} onClick={()=>setPrint("releve")}>🖨️ Imprimer le relevé</button>
          </div>,
          "Liste des matières d'après les écritures (grand livre) à la date d'arrêté, à remettre à la commission de recensement.")}

        {step(2, "Recensement par la commission — PV de recensement", reached("recense"),
          <>
            {!lignes.length&&canW&&!locked&&<button style={b("#1e3a8a")} onClick={startRecensement}>▶ Commencer la saisie du recensement</button>}
            {lignes.length>0&&(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
                  <thead><tr>{["N° compte","Désignation","Écritures","Constaté","Écart","Observation"].map(h=><th key={h} style={{background:"#f1f5f9",padding:"6px 8px",border:"1px solid #e2e8f0",textAlign:"left"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {lignes.map(l=>(
                      <tr key={l.productId} style={{background:l.ecart?(l.ecart>0?"#ecfdf5":"#fef2f2"):"white"}}>
                        <td style={{padding:"4px 8px",border:"1px solid #e2e8f0"}}>{l.compteNumero}</td>
                        <td style={{padding:"4px 8px",border:"1px solid #e2e8f0"}}>{l.productName}</td>
                        <td style={{padding:"4px 8px",border:"1px solid #e2e8f0",textAlign:"right"}}>{l.existantComptable}</td>
                        <td style={{padding:"2px 4px",border:"1px solid #e2e8f0"}}>{locked?<b>{l.constate}</b>:<input type="number" min="0" value={l.constate} onChange={e=>setConstate(l.productId,e.target.value)} style={{...input,padding:"4px 6px",width:90}}/>}</td>
                        <td style={{padding:"4px 8px",border:"1px solid #e2e8f0",textAlign:"right",fontWeight:700,color:l.ecart>0?"#059669":l.ecart<0?"#dc2626":"#94a3b8"}}>{l.ecart>0?"+":""}{l.ecart||0}</td>
                        <td style={{padding:"2px 4px",border:"1px solid #e2e8f0"}}>{locked?(l.observation||""):<input value={l.observation||""} onChange={e=>setObs(l.productId,e.target.value)} style={{...input,padding:"4px 6px"}}/>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
              {!locked&&lignes.length>0&&canW&&<>
                <button style={bLight} disabled={!!busy} onClick={saveDraft}>{busy==="draft"?"⏳":"💾"} Enregistrer le brouillon</button>
                <button style={b("#1e3a8a")} disabled={!!busy} onClick={validateRecensement}>{busy==="valid"?"⏳":"✅"} Valider le recensement ({ecarts.length} écart(s))</button>
              </>}
              {reached("recense")&&<button style={bLight} onClick={()=>setPrint("pvr")}>🖨️ Imprimer le PV de recensement</button>}
            </div>
          </>,
          "Saisissez l'existant physiquement constaté par la commission (par défaut : l'existant des écritures). Une fois validé, le PV est numéroté et la saisie est figée.")}

        {step(3, "Certificat administratif portant autorisation", reached("certifie") || (reached("recense") && !needCertif),
          !reached("recense") ? <div style={{fontSize:12,color:"#94a3b8"}}>Après validation du recensement.</div>
          : !needCertif ? <div style={{fontSize:12,color:"#059669"}}>Aucun écart : pas de certificat administratif nécessaire.</div>
          : <>
              {!reached("certifie")&&canW&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:1,minWidth:240}}><label style={label}>Cause des écarts (portée sur le certificat)</label><input style={input} value={motifEcarts} onChange={e=>setMotifEcarts(e.target.value)} placeholder="ex. erreurs de saisie, casse, péremption non déclarée…"/></div>
                <button style={b("#7c2d12")} disabled={!!busy} onClick={etablirCertificat}>{busy==="ca"?"⏳":"📜"} Établir le certificat</button>
              </div>}
              {reached("certifie")&&<button style={bLight} onClick={()=>setPrint("ca")}>🖨️ Imprimer le certificat administratif</button>}
            </>,
          "Pièce par laquelle l'ordonnateur des matières autorise l'entrée des excédents et la sortie des déficits.")}

        {step(4, "Écritures de régularisation", reached("regularise") || (reached("recense") && !needCertif),
          !needCertif && reached("recense") ? <div style={{fontSize:12,color:"#059669"}}>Aucun écart : rien à régulariser.</div>
          : !reached("certifie") ? <div style={{fontSize:12,color:"#94a3b8"}}>Après établissement (et signature) du certificat administratif.</div>
          : reached("regularise") ? <div style={{fontSize:12,color:"#059669"}}>Régularisation passée le {fmtDate(cl.regulDate)} — voir Bon d'entrée (nature « certificat administratif ») et Bon de sortie (motif « perte / déficit »).</div>
          : canW && <button style={b("#0f766e")} disabled={!!busy} onClick={regulariser}>{busy==="regul"?"⏳ Écritures en cours…":"⚖️ Passer les écritures de régularisation"}</button>,
          "Excédents → bon d'entrée ; déficits → bon de sortie définitive, tous deux datés à l'arrêté des écritures ("+fmtDate(date)+"). Les pièces (relevé, PV de recensement, certificat) sont reportées sur les bons.")}

        {step(5, "Balance d'entrée de la gestion "+(year+1)+" (bon d'entrée n°1)", reached("cloture"),
          reached("cloture") ? <div style={{fontSize:12,color:"#059669"}}>Gestion {year} clôturée le {fmtDate(cl.balanceDate)}.{balanceExistante?<> Balance d'entrée : <b>{balanceExistante.reference}</b>.</>:null}</div>
          : !(reached("regularise") || (reached("recense") && !needCertif)) ? <div style={{fontSize:12,color:"#94a3b8"}}>Après la régularisation des écarts.</div>
          : balanceExistante ? <div style={{fontSize:12,color:"#b45309"}}>Une balance d'entrée {year+1} existe déjà ({balanceExistante.reference}). Annulez-la d'abord pour la refaire.</div>
          : canW && <button style={b("#065f46")} disabled={!!busy} onClick={etablirBalance}>{busy==="bal"?"⏳":"🔒"} Clôturer la gestion {year} et établir la balance d'entrée {year+1}</button>,
          "Reprend l'existant constaté au recensement comme première entrée de la gestion suivante. Aucun stock n'est ajouté : les matières sont déjà en magasin.")}

        <div style={{...card,marginBottom:12,borderLeft:"4px solid #1e3a8a"}}>
          <div style={{fontWeight:800,fontSize:13.5,color:"#1e293b",marginBottom:4}}>📘 Compte de gestion des matières — gestion {year}</div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Balance générale des comptes de l'année : existant au début, entrées, sorties définitives, existant à la fin (dont en sortie provisoire). À transmettre à la Cour des comptes dans les cinq mois suivant la clôture.</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#334155",alignSelf:"center"}}>{compte.length} compte(s) mouvementé(s)</span>
            <button style={bLight} onClick={()=>setPrint("compte")}>🖨️ Imprimer</button>
            <button style={{...bLight,background:"#dcfce7",color:"#166534"}} onClick={exportCompte}>⬇️ Excel</button>
          </div>
        </div>
      </div>

      <PrintModal open={print==="releve"} onClose={()=>setPrint(null)} title="Relevé récapitulatif" reference={"RELEVÉ RÉCAPITULATIF — "+fmtDate(date)+" — "+cfg.label} landscape signatories={getPrintModel(store,"releve").signers}>
        <ReleveRecapPrint rows={releve} date={date} circuitLabel={cfg.label} model={getPrintModel(store,"releve")}/>
      </PrintModal>
      <PrintModal open={print==="pvr"} onClose={()=>setPrint(null)} title="PV de recensement" reference={"PV DE RECENSEMENT N° "+(cl?.pvNumero||"")+" — "+cfg.label} landscape>
        <PvRecensementPrint cloture={cl} circuitLabel={cfg.label} model={getPrintModel(store,"pv_recensement")} commission={commission}/>
      </PrintModal>
      <PrintModal open={print==="ca"} onClose={()=>setPrint(null)} title="Certificat administratif" reference={"CERTIFICAT ADMINISTRATIF N° "+(cl?.certificatNumero||"")+" — "+cfg.label} landscape signatories={getPrintModel(store,"certificat").signers}>
        <CertificatAdministratifPrint cloture={cl} circuitLabel={cfg.label} model={getPrintModel(store,"certificat")}/>
      </PrintModal>
      <PrintModal open={print==="compte"} onClose={()=>setPrint(null)} title="Compte de gestion" reference={"COMPTE DE GESTION "+year+" — "+cfg.label} landscape signatories={getPrintModel(store,"compte_gestion").signers} onExcel={exportCompte}>
        <CompteGestionPrint rows={compte} year={year} circuitLabel={cfg.label} model={getPrintModel(store,"compte_gestion")} pieces={pieces}/>
      </PrintModal>
    </div>
  );
}
