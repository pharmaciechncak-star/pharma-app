import { useState } from "react";
import { label, input, card, btn } from "../helpers/styles";
import { PageHeader } from "./ui/PageHeader";
import { Modal } from "./ui/Modal";
import { getPharmacyStock2, getServiceStock2 } from "../helpers/stock2";
import { visibleServices } from "../permissions";
import { BarcodeScanner } from "./ui/ScanReviewModal";

export function StatistiquesPage({store,currentUser}){
  const [tab,setTab]=useState("rotation"); // rotation|user|mouvements|valeur_prescrite|valeur_stock|patient
  const TABS=[
    {id:"rotation",       label:"🔄 Rotation produit"},
    {id:"user",           label:"👤 Activité utilisateur"},
    {id:"mouvements",     label:"📦 Mouvements"},
    {id:"valeur_prescrite",label:"💰 Valeur prescrite"},
    {id:"valeur_stock",   label:"🏦 Valeur stock"},
    {id:"patient",        label:"🏥 Par patient"},
    {id:"peremptions",    label:"⏳ Péremptions proches"},
    {id:"reorder",        label:"🛒 Produits à commander"},
  ];

  // Filtres communs
  const [dateFrom,setDateFrom]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().split("T")[0]);
  const [dateTo,setDateTo]=useState(new Date().toISOString().split("T")[0]);
  const [selProduct,setSelProduct]=useState("");
  const [selUser,setSelUser]=useState("");
  const [selUsers,setSelUsers]=useState([]);
  const [selService,setSelService]=useState("");
  const [selSupplier,setSelSupplier]=useState("");
  const [showChart,setShowChart]=useState(false);

  // ── Portée des statistiques accessibles à l'utilisateur connecté ──
  // - admin (principal) : accès libre (Tous / Pharmacie / n'importe quel service)
  // - utilisateur rattaché à un service (serviceId défini, ex: agent/admin de la
  //   cardiologie) : verrouillé strictement sur SON service — ni "Tous", ni
  //   "Pharmacie", ni un autre service
  // - utilisateur côté pharmacie (aucun serviceId) : verrouillé sur "Pharmacie",
  //   éventuellement complété par des services explicitement autorisés
  //   (allowedServices) — jamais de vue "Tous" mélangeant tout, réservée à l'admin
  const isPrincipalAdmin = currentUser?.role==="admin" || currentUser?.isSuperuser;
  const myServiceId = currentUser?.serviceId||"";
  const statOptions = isPrincipalAdmin
    ? [{value:"",label:"Tous"},{value:"pharmacie",label:"📦 Pharmacie"},...store.services.map(s=>({value:s.id,label:s.name}))]
    : myServiceId
    ? [{value:myServiceId,label:store.services.find(s=>s.id===myServiceId)?.name||"Mon service"}]
    : [{value:"pharmacie",label:"📦 Pharmacie"},...visibleServices(currentUser,store.services).filter(s=>(currentUser?.allowedServices||[]).includes(s.id)).map(s=>({value:s.id,label:s.name}))];
  const statScopeLocked = statOptions.length===1;
  const effectiveSelService = statScopeLocked ? statOptions[0].value : selService;

  const inRange=(ts)=>{
    if(!ts) return true;
    const d = ts?.seconds ? new Date(ts.seconds*1000) : new Date(ts);
    return (!dateFrom||d>=new Date(dateFrom)) && (!dateTo||d<=new Date(dateTo+"T23:59:59"));
  };
  const byUser=(arr,uidField="createdBy")=>selUsers.length>0?arr.filter(x=>selUsers.includes(x[uidField])):arr;

  // ── Helpers export/print ──
  const exportCSV=(rows,headers,filename)=>{
    const lines=[headers.join(","),...rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(","))];
    const blob=new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename+".csv"; a.click();
  };
  const printTable=(title,headers,rows)=>{
    const html="<!DOCTYPE html><html><head><meta charset='utf-8'><title>"+title+"</title>"+
      "<style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}"+
      "h2{color:#312e81;margin-bottom:12px}"+
      "table{width:100%;border-collapse:collapse}"+
      "th{background:#312e81;color:white;padding:7px 10px;text-align:left}"+
      "td{padding:5px 10px;border-bottom:1px solid #e2e8f0}"+
      "tr:nth-child(even){background:#f8fafc}"+
      ".total{font-weight:bold;background:#eef2ff}"+
      "</style></head><body>"+
      "<h2>"+title+"</h2>"+
      "<p style='font-size:10px;color:#64748b;margin-bottom:8px'>Du "+dateFrom+" au "+dateTo+"</p>"+
      "<table><thead><tr>"+headers.map(h=>"<th>"+h+"</th>").join("")+"</tr></thead><tbody>"+
      rows.map(r=>"<tr>"+r.map(v=>"<td>"+v+"</td>").join("")+"</tr>").join("")+
      "</tbody></table></body></html>";
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const win=window.open(URL.createObjectURL(blob),"_blank");
    if(win) win.addEventListener("load",()=>setTimeout(()=>win.print(),400));
  };

  // ══ 1. ROTATION PRODUIT ══
  // Sélecteur de produit par recherche (nom/code-barre) ou scan — remplace le
  // simple menu déroulant, cohérent avec le reste de l'app (Transferts,
  // Consommations, Réceptions).
  const ProductPicker = ({value, onChange}) => {
    const [search,setSearch]=useState("");
    const [showResults,setShowResults]=useState(false);
    const [showScanner,setShowScanner]=useState(false);
    const selected = store.products.find(p=>p.id===value);
    const filtered = search.trim()
      ? store.products.filter(p=>p.name?.toLowerCase().includes(search.toLowerCase())||[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b.includes(search)))
      : store.products;
    return(
      <div style={{position:"relative"}}>
        <div style={{display:"flex",gap:6}}>
          <div style={{position:"relative",flex:1}}>
            <input style={{...input,paddingLeft:32}} placeholder={selected?selected.name:"Rechercher ou scanner un produit..."}
              value={search} onChange={e=>{setSearch(e.target.value);setShowResults(true);}}
              onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)}/>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
          </div>
          <button onClick={()=>setShowScanner(true)} title="Scanner un code barre"
            style={{...btn(),background:"#4f46e5",color:"white",padding:"8px 12px",flexShrink:0,fontSize:16}}>📷</button>
        </div>
        {selected&&!search&&<div style={{fontSize:11,color:"#4f46e5",fontWeight:600,marginTop:4}}>✅ {selected.name} sélectionné</div>}
        {showScanner&&(
          <BarcodeScanner
            onDetected={code=>{
              setShowScanner(false);
              const found=store.products.find(p=>[p.barcode1,p.barcode2,p.barcode3].some(b=>b&&b===code));
              if(found){ onChange(found.id); setSearch(""); }
              else { setSearch(code); setShowResults(true); }
            }}
            onClose={()=>setShowScanner(false)}
          />
        )}
        {showResults&&filtered.length>0&&(
          <div style={{position:"absolute",left:0,right:0,top:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:8,zIndex:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
            {filtered.slice(0,15).map(p=>(
              <div key={p.id} onMouseDown={()=>{onChange(p.id);setSearch("");}}
                style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                <div style={{fontWeight:600}}>{p.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const RotationTab=()=>{
    const prod=store.products.find(p=>p.id===selProduct);
    if(!selProduct) return(
      <div>
        <div style={{marginBottom:10}}><label style={label}>Choisir un produit</label>
          <ProductPicker value={selProduct} onChange={setSelProduct}/>
        </div>
      </div>
    );
    // Entrées (bons d'entrée) — domaine pharmacie uniquement
    const ents=effectiveSelService&&effectiveSelService!=="pharmacie"?[]:store.entries.filter(e=>inRange(e.createdAt)&&(e.items||[]).some(i=>i.productId===selProduct));
    const totalEnt=ents.reduce((s,e)=>s+((e.items||[]).find(i=>i.productId===selProduct)?.qty||0)*1,0);
    // Réceptions — domaine pharmacie uniquement
    const recs=effectiveSelService&&effectiveSelService!=="pharmacie"?[]:store.receptions.filter(r=>inRange(r.createdAt)&&(r.items||[]).some(i=>i.productId===selProduct));
    const totalRec=recs.reduce((s,r)=>s+((r.items||[]).find(i=>i.productId===selProduct)?.qty||0)*1,0);
    // Transferts — vers le service du périmètre uniquement s'il est verrouillé
    const trans=store.transfers.filter(t=>inRange(t.createdAt)&&(t.items||[]).some(i=>i.productId===selProduct)&&(!effectiveSelService||effectiveSelService==="pharmacie"||t.serviceId===effectiveSelService));
    const totalTrans=trans.reduce((s,t)=>s+((t.items||[]).find(i=>i.productId===selProduct)?.qty||0)*1,0);
    // Consommations — du service du périmètre uniquement s'il est verrouillé, rien pour "pharmacie"
    const consos=(effectiveSelService==="pharmacie"?[]:store.consumptions).filter(c=>inRange(c.createdAt)&&(c.items||[]).some(i=>i.productId===selProduct)&&(!effectiveSelService||effectiveSelService==="pharmacie"||c.serviceId===effectiveSelService));
    const totalConso=consos.reduce((s,c)=>s+((c.items||[]).find(i=>i.productId===selProduct)?.qty||0)*1,0);
    // Retours fournisseur — domaine pharmacie uniquement
    const rets=effectiveSelService&&effectiveSelService!=="pharmacie"?[]:store.returns.filter(r=>inRange(r.createdAt)&&(r.items||[]).some(i=>i.productId===selProduct));
    const totalRet=rets.reduce((s,r)=>s+((r.items||[]).find(i=>i.productId===selProduct)?.qty||0)*1,0);
    const stockActuel=store.stock[selProduct]||0;
    const isServiceScope=effectiveSelService&&effectiveSelService!=="pharmacie";
    const rows=isServiceScope
      ? [["Transferts reçus",totalTrans],["Consommations",totalConso]]
      : [["Bons d'entrée",totalEnt],["Réceptions service",totalRec],["Transferts",totalTrans],["Consommations",effectiveSelService==="pharmacie"?0:totalConso],["Bons de retour",totalRet],["Stock actuel (inventaire)",stockActuel]];
    return(
      <div>
        <div style={{marginBottom:10}}><label style={label}>Produit</label>
          <ProductPicker value={selProduct} onChange={setSelProduct}/>
        </div>
        <div style={{fontWeight:700,fontSize:14,color:"#312e81",marginBottom:10}}>🔄 {prod?.name}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          {[["📥 Entrées",totalEnt,"#059669"],["📦 Réceptions",totalRec,"#0891b2"],["🔄 Transferts",totalTrans,"#7c3aed"],
            ["💉 Consommés",totalConso,"#dc2626"],["↩️ Retours",totalRet,"#d97706"],["📦 Stock",stockActuel,"#1d4ed8"]].map(([l,v,c])=>(
            <div key={l} style={{...card,padding:12,textAlign:"center",border:"1px solid "+c+"33"}}>
              <div style={{fontWeight:800,fontSize:22,color:c}}>{v}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={()=>printTable("Rotation — "+prod?.name,["Indicateur","Quantité"],rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,["Indicateur","Quantité"],"rotation_"+prod?.name)} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  // ══ 2. ACTIVITÉ UTILISATEUR ══
  const UserTab=()=>{
    const [detail,setDetail]=useState(null);
    const user=store.users.find(u=>u.id===selUser);
    if(!selUser) return <div><label style={label}>Choisir un utilisateur</label><select style={input} value={selUser} onChange={e=>setSelUser(e.target.value)}><option value="">— Sélectionner —</option>{store.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>;

    // Limité aux 4 opérations métier tracées individuellement (pas le journal
    // "activités" générique, qui couvre aussi produits/utilisateurs/etc.) —
    // chaque entrée reste cliquable pour voir le détail des articles.
    const consos = (store.consumptions||[]).filter(c=>c.consumedBy===selUser&&inRange(c.createdAt)).map(c=>({type:"Consommation",icon:"💉",date:c.createdAt,label:c.serviceName+(c.patientName?" — "+c.patientName:""),nbArticles:(c.items||[]).length,doc:c,serviceId:c.serviceId||null}));
    const receps = (store.receptions||[]).filter(r=>r.receivedBy===selUser&&inRange(r.createdAt)).map(r=>({type:"Réception",icon:"📥",date:r.createdAt,label:r.reference+(r.supplierName?" — "+r.supplierName:""),nbArticles:(r.items||[]).length,doc:r,serviceId:null}));
    const transf = (store.transfers||[]).filter(t=>t.transferredBy===selUser&&inRange(t.createdAt)).map(t=>({type:"Transfert",icon:"🔀",date:t.createdAt,label:"Vers "+(t.serviceName||"—"),nbArticles:(t.items||[]).length,doc:t,serviceId:t.serviceId||null}));
    const retours = (store.svcReturns||[]).filter(r=>r.returnedBy===selUser&&inRange(r.createdAt)).map(r=>({type:"Retour service",icon:"↩️",date:r.createdAt,label:"De "+(r.serviceName||"—"),nbArticles:(r.items||[]).length,doc:r,serviceId:r.serviceId||null}));

    // Filtre service global (haut de page) — même convention que Mouvements :
    // "pharmacie" ne concerne que les réceptions, un service précis filtre le reste.
    const matchesScope=(a)=>{
      if(effectiveSelService==="") return true;
      if(effectiveSelService==="pharmacie") return a.type==="Réception";
      return a.serviceId===effectiveSelService;
    };
    const acts=[...consos,...receps,...transf,...retours].filter(matchesScope).sort((a,b)=>(b.date?.seconds||0)-(a.date?.seconds||0));
    const headers=["Date","Type","Détail","Nb articles"];
    const rows=acts.map(a=>[new Date((a.date?.seconds||0)*1000).toLocaleString("fr-FR"),a.type,a.label,a.nbArticles]);
    return(
      <div>
        <div style={{marginBottom:10}}><label style={label}>Utilisateur</label><select style={input} value={selUser} onChange={e=>setSelUser(e.target.value)}><option value="">—</option>{store.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div style={{fontWeight:700,fontSize:14,color:"#312e81",marginBottom:8}}>👤 {user?.name} — {acts.length} opération(s)</div>
        <div style={{maxHeight:300,overflowY:"auto",...card}}>
          {acts.length===0?<div style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Aucune réception, transfert, consommation ou retour sur cette période.</div>:
          acts.map((a,i)=>(
            <div key={i} onClick={()=>setDetail(a)}
              style={{padding:"8px 12px",borderBottom:"1px solid #f1f5f9",fontSize:11,cursor:"pointer",transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              title="Cliquer pour voir le détail">
              <div style={{fontWeight:600,color:"#1e293b"}}>{a.icon} {a.type} — {a.label}</div>
              <div style={{color:"#94a3b8",fontSize:10}}>{new Date((a.date?.seconds||0)*1000).toLocaleString("fr-FR")} · {a.nbArticles} article(s)</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={()=>printTable("Activité — "+user?.name,headers,rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,headers,"activite_"+user?.name)} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={detail?detail.icon+" "+detail.type+" — "+detail.label:""}>
          {detail&&(
            <div>
              <div style={{fontSize:11,color:"#64748b",marginBottom:12}}>{new Date((detail.date?.seconds||0)*1000).toLocaleString("fr-FR")}</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr><th style={{textAlign:"left",padding:"4px 6px",borderBottom:"2px solid #e2e8f0",color:"#64748b",fontSize:10}}>Produit</th><th style={{textAlign:"right",padding:"4px 6px",borderBottom:"2px solid #e2e8f0",color:"#64748b",fontSize:10}}>Quantité</th></tr></thead>
                <tbody>{(detail.doc.items||[]).map((it,j)=>(
                  <tr key={j}><td style={{padding:"4px 6px",borderBottom:"1px solid #f1f5f9",fontWeight:600}}>{it.productName||"—"}</td><td style={{padding:"4px 6px",borderBottom:"1px solid #f1f5f9",textAlign:"right"}}>{it.qty}{it.lot?" · lot "+it.lot:""}{it.expiry?" · exp. "+it.expiry:""}</td></tr>
                ))}</tbody>
              </table>
              {detail.doc.notes&&<div style={{fontSize:11,color:"#94a3b8",marginTop:10,fontStyle:"italic"}}>{detail.doc.notes}</div>}
            </div>
          )}
        </Modal>
      </div>
    );
  };

  // ══ 3. MOUVEMENTS ══
  const MouvementsTab=()=>{
    const [typeFilter,setTypeFilter]=useState("tous"); // tous|receptions|transferts|consommations
    const getItems=(arr,field="createdBy")=>byUser(arr.filter(x=>inRange(x.createdAt)),field)
      .flatMap(x=>(x.items||[]).map(it=>({
        date:new Date((x.createdAt?.seconds||0)*1000).toLocaleDateString("fr-FR"),
        type:field==="receivedBy"?"Réception":field==="transferredBy"?"Transfert":"Consommation",
        produit:it.productName||store.products.find(p=>p.id===it.productId)?.name||"—",
        qty:Number(it.qty||0),
        user:x[field+"Name"]||x.consumedByName||"—",
        service:x.serviceName||"—",
        serviceId:x.serviceId||null,
      })));
    // Filtre service global (haut de page) : "pharmacie" ne concerne que les
    // réceptions (seule opération sans service), un service précis filtre sur
    // transferts/consommations de ce service ; réceptions exclues dans ce cas.
    const matchesScope=(r)=>{
      if(effectiveSelService==="") return true;
      if(effectiveSelService==="pharmacie") return r.type==="Réception";
      return r.serviceId===effectiveSelService;
    };
    const allRows=[
      ...(typeFilter==="tous"||typeFilter==="receptions"?getItems(store.receptions,"receivedBy"):[]),
      ...(typeFilter==="tous"||typeFilter==="transferts"?getItems(store.transfers,"transferredBy"):[]),
      ...(typeFilter==="tous"||typeFilter==="consommations"?getItems(store.consumptions,"consumedBy"):[]),
    ].filter(matchesScope).sort((a,b)=>a.date.localeCompare(b.date));
    // Agrégation par produit pour le diagramme
    const byProd={};
    allRows.forEach(r=>{ byProd[r.produit]=(byProd[r.produit]||0)+r.qty; });
    const chartData=Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,15);
    const maxVal=Math.max(...chartData.map(x=>x[1]),1);
    const tableRows=allRows.map(r=>[r.date,r.type,r.produit,r.qty,r.user,r.service]);
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div><label style={label}>Type</label>
            <select style={input} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
              <option value="tous">Tous</option><option value="receptions">Réceptions</option>
              <option value="transferts">Transferts</option><option value="consommations">Consommations</option>
            </select>
          </div>
          <div><label style={label}>Utilisateur(s)</label>
            <select style={input} value={selUsers[0]||""} onChange={e=>setSelUsers(e.target.value?[e.target.value]:[])}>
              <option value="">Tous</option>{store.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        {/* Diagramme barres */}
        <div style={{...card,marginBottom:10,padding:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:12,color:"#312e81"}}>📊 Top produits — {allRows.length} mouvement(s)</div>
            <button onClick={()=>setShowChart(v=>!v)} style={{...btn(),background:"#eef2ff",color:"#4f46e5",fontSize:11,padding:"4px 10px"}}>{showChart?"📋 Tableau":"📊 Diagramme"}</button>
          </div>
          {showChart?(
            <div style={{overflowX:"auto"}}>
              {chartData.map(([name,val])=>(
                <div key={name} style={{marginBottom:5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:10,width:160,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{name}</div>
                    <div style={{flex:1,background:"#e0e7ff",borderRadius:4,height:18,overflow:"hidden"}}>
                      <div style={{width:(val/maxVal*100)+"%",background:"linear-gradient(90deg,#4f46e5,#818cf8)",height:"100%",borderRadius:4,display:"flex",alignItems:"center",paddingLeft:4}}>
                        <span style={{fontSize:9,color:"white",fontWeight:700}}>{val}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {chartData.length===0&&<div style={{textAlign:"center",color:"#94a3b8",padding:20}}>Aucune donnée</div>}
            </div>
          ):(
            <div style={{maxHeight:300,overflowY:"auto"}}>
              {allRows.length===0?<div style={{textAlign:"center",color:"#94a3b8",padding:20}}>Aucun mouvement.</div>:
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>{["Date","Type","Produit","Qté","Utilisateur","Service"].map(h=><th key={h} style={{background:"#312e81",color:"white",padding:"5px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
                <tbody>{allRows.map((r,i)=><tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>{[r.date,r.type,r.produit,r.qty,r.user,r.service].map((v,j)=><td key={j} style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9"}}>{v}</td>)}</tr>)}</tbody>
              </table>}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>printTable("Mouvements",["Date","Type","Produit","Qté","Utilisateur","Service"],tableRows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(tableRows,["Date","Type","Produit","Qté","Utilisateur","Service"],"mouvements")} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  // ══ 4. VALEUR PRESCRITE ══
  const ValeurPrescrite=()=>{
    // Donnée intrinsèquement "service" (chaque ligne vient d'une consommation
    // rattachée à un service) — jamais de fuite vers un autre service, et rien
    // pour la vue "Pharmacie" qui n'a pas de consommation propre.
    const scopeOk = c => {
      if (effectiveSelService==="") return true;
      if (effectiveSelService==="pharmacie") return false;
      return c.serviceId===effectiveSelService;
    };
    const consos=byUser(store.consumptions.filter(c=>inRange(c.createdAt)&&scopeOk(c)),"consumedBy");
    const rows=consos.flatMap(c=>(c.items||[]).map(it=>{
      const prod=store.products.find(p=>p.id===it.productId);
      const valeur=Number(it.qty||0)*Number(prod?.price||0);
      return [new Date((c.createdAt?.seconds||0)*1000).toLocaleDateString("fr-FR"),c.serviceName||"—",it.productName||"—",it.qty,Number(prod?.price||0).toLocaleString("fr-FR"),valeur.toLocaleString("fr-FR"),c.consumedByName||"—",c.patientName||"—"];
    }));
    const total=consos.reduce((s,c)=>(c.items||[]).reduce((ss,it)=>{const prod=store.products.find(p=>p.id===it.productId);return ss+Number(it.qty||0)*Number(prod?.price||0);},s),0);
    return(
      <div>
        {effectiveSelService==="pharmacie"&&<div style={{fontSize:11,color:"#6366f1",marginBottom:10,background:"#eef2ff",padding:8,borderRadius:8}}>ℹ️ La valeur prescrite est une donnée de service — rien à afficher pour la pharmacie.</div>}
        <div style={{marginBottom:10}}><label style={label}>Utilisateur(s)</label>
          <select style={input} value={selUsers[0]||""} onChange={e=>setSelUsers(e.target.value?[e.target.value]:[])}>
            <option value="">Tous</option>{store.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div style={{...card,background:"linear-gradient(135deg,#312e81,#4f46e5)",padding:14,marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Valeur totale prescrite</div>
          <div style={{fontWeight:800,fontSize:24,color:"white"}}>{total.toLocaleString("fr-FR")} FCFA</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{rows.length} ligne(s) · du {dateFrom} au {dateTo}</div>
        </div>
        <div style={{maxHeight:280,overflowY:"auto",...card,marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["Date","Service","Produit","Qté","P.U.","Valeur","Agent","Patient"].map(h=><th key={h} style={{background:"#312e81",color:"white",padding:"5px 6px",textAlign:"left",fontSize:10}}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2===0?"white":"#f8fafc"}}>{r.map((v,j)=><td key={j} style={{padding:"4px 6px",borderBottom:"1px solid #f1f5f9",fontSize:10}}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>printTable("Valeur prescrite",["Date","Service","Produit","Qté","P.U.","Valeur","Agent","Patient"],rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,["Date","Service","Produit","Qté","P.U.","Valeur","Agent","Patient"],"valeur_prescrite")} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  // ══ 5. VALEUR STOCK ══
  const ValeurStock=()=>{
    const [localView,setLocalView]=useState("pharmacie");
    // Si l'utilisateur est verrouillé sur un périmètre (service ou pharmacie),
    // on l'applique directement ici aussi — un seul mécanisme de portée pour
    // toute la page, pas de sélecteur local divergent.
    const view=statScopeLocked?effectiveSelService:localView;
    // Stock pharmacie = prix × stockQty (inventaire)
    const pharmacieRows=store.products.filter(p=>!selSupplier||p.supplierId===selSupplier).map(p=>{
      const qty=store.stock[p.id]||0;
      const val=qty*Number(p.price||0);
      return {name:p.name,supplier:store.suppliers.find(s=>s.id===p.supplierId)?.name||"—",qty,price:p.price||0,val};
    }).filter(r=>r.qty>0);
    const pharmTotal=pharmacieRows.reduce((s,r)=>s+r.val,0);
    // Stock service = svcStock × prix
    const svcRows=view!=="pharmacie"?visibleServices(currentUser,store.services||[]).filter(s=>!view||view==="tous"||s.id===view).flatMap(svc=>
      Object.keys(store.svcStock||{}).filter(k=>k.startsWith(svc.id+"_")).map(k=>{
        const prodId=k.split("_")[1];
        const prod=store.products.find(p=>p.id===prodId);
        const qty=store.svcStock[k]||0;
        return {service:svc.name,name:prod?.name||"—",qty,price:prod?.price||0,val:qty*(prod?.price||0)};
      }).filter(r=>r.qty>0)
    ):[];
    const svcTotal=svcRows.reduce((s,r)=>s+r.val,0);
    const isPharm=view==="pharmacie";
    const rows=isPharm?pharmacieRows.map(r=>[r.name,r.supplier,r.qty,r.price.toLocaleString("fr-FR"),r.val.toLocaleString("fr-FR")]):
      svcRows.map(r=>[r.service,r.name,r.qty,r.price.toLocaleString("fr-FR"),r.val.toLocaleString("fr-FR")]);
    const total=isPharm?pharmTotal:svcTotal;
    const headers=isPharm?["Produit","Fournisseur","Stock","Prix unit.","Valeur (FCFA)"]:["Service","Produit","Stock","Prix unit.","Valeur (FCFA)"];
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div><label style={label}>Vue</label>
            {statScopeLocked?(
              <div style={{...input,background:"#f8fafc",color:"#312e81",fontWeight:600}}>{statOptions[0].label} <span style={{fontSize:10,color:"#94a3b8",fontWeight:400}}>(votre périmètre)</span></div>
            ):(
              <select style={input} value={localView} onChange={e=>setLocalView(e.target.value)}>
                <option value="pharmacie">📦 Stock Pharmacie</option>
                <option value="tous">🏥 Tous les services</option>
                {visibleServices(currentUser,store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          {isPharm&&<div><label style={label}>Fournisseur</label>
            <select style={input} value={selSupplier} onChange={e=>setSelSupplier(e.target.value)}>
              <option value="">Tous</option>{store.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>}
        </div>
        <div style={{...card,background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",padding:14,marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Valeur totale du stock</div>
          <div style={{fontWeight:800,fontSize:24,color:"white"}}>{total.toLocaleString("fr-FR")} FCFA</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{rows.length} produit(s)</div>
        </div>
        <div style={{maxHeight:280,overflowY:"auto",...card,marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{headers.map(h=><th key={h} style={{background:"#1d4ed8",color:"white",padding:"5px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2===0?"white":"#eff6ff"}}>{r.map((v,j)=><td key={j} style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9"}}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>printTable("Valeur Stock",headers,rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,headers,"valeur_stock")} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  // ══ 6. PAR PATIENT ══
  const PatientTab=()=>{
    const [searchPat,setSearchPat]=useState("");
    // Les consommations par patient sont une donnée de service — un utilisateur
    // verrouillé sur un service ne doit voir que SES patients, jamais ceux d'un
    // autre service. La vue "Pharmacie" n'a pas de sens ici (aucune consommation
    // patient n'a lieu à la pharmacie elle-même).
    const scopeOk = c => {
      if (effectiveSelService==="") return true; // admin "Tous"
      if (effectiveSelService==="pharmacie") return false;
      return c.serviceId===effectiveSelService;
    };
    const consos=store.consumptions.filter(c=>inRange(c.createdAt)&&(c.patientName||c.patientId)&&scopeOk(c));
    // Grouper par patient
    const byPat={};
    consos.forEach(c=>{
      const key=(c.patientName||"")+"||"+(c.patientId||"");
      if(!byPat[key]) byPat[key]={name:c.patientName||"—",id:c.patientId||"—",items:[],total:0,conso:[]};
      (c.items||[]).forEach(it=>{
        const prod=store.products.find(p=>p.id===it.productId);
        const val=Number(it.qty||0)*Number(prod?.price||0);
        byPat[key].total+=val;
        const ex=byPat[key].items.find(x=>x.prodId===it.productId);
        if(ex) ex.qty+=Number(it.qty||0);
        else byPat[key].items.push({prodId:it.productId,name:it.productName||"—",qty:Number(it.qty||0),val});
      });
      byPat[key].conso.push(c);
    });
    const patients=Object.values(byPat).filter(p=>!searchPat||p.name.toLowerCase().includes(searchPat.toLowerCase())||p.id.includes(searchPat));
    const [selPat,setSelPat]=useState(null);
    const rows=selPat?selPat.items.map(i=>[i.name,i.qty,Number(store.products.find(p=>p.id===i.prodId)?.price||0).toLocaleString("fr-FR"),i.val.toLocaleString("fr-FR")]):
      patients.map(p=>[p.name,p.id,p.conso.length,p.items.reduce((s,i)=>s+i.qty,0),p.total.toLocaleString("fr-FR")]);
    const headers=selPat?["Produit","Qté","Prix unit.","Valeur (FCFA)"]:["Patient","Patient ID (voir cubix)","Prescriptions","Qté totale","Valeur (FCFA)"];
    return(
      <div>
        {effectiveSelService==="pharmacie"&&<div style={{fontSize:11,color:"#6366f1",marginBottom:10,background:"#eef2ff",padding:8,borderRadius:8}}>ℹ️ Les consommations par patient sont une donnée de service — rien à afficher pour la pharmacie.</div>}
        <input style={{...input,marginBottom:10}} placeholder="🔍 Rechercher un patient..."
          value={searchPat} onChange={e=>setSearchPat(e.target.value)}/>
        {selPat?(
          <div>
            <button onClick={()=>setSelPat(null)} style={{...btn(),background:"#eef2ff",color:"#4f46e5",marginBottom:8,fontSize:12}}>← Retour liste</button>
            <div style={{fontWeight:700,fontSize:14,color:"#312e81",marginBottom:8}}>🏥 {selPat.name} {selPat.id!=="—"?"· "+selPat.id:""}</div>
            <div style={{...card,marginBottom:8,padding:10,background:"#eef2ff",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#4f46e5"}}>Valeur totale</div>
              <div style={{fontWeight:800,fontSize:18,color:"#312e81"}}>{selPat.total.toLocaleString("fr-FR")} FCFA</div>
            </div>
          </div>
        ):(
          <div style={{fontWeight:700,fontSize:13,color:"#312e81",marginBottom:8}}>{patients.length} patient(s) trouvé(s)</div>
        )}
        <div style={{maxHeight:300,overflowY:"auto",...card,marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{headers.map(h=><th key={h} style={{background:"#312e81",color:"white",padding:"5px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>
              {(selPat?selPat.items:patients).map((r,i)=>(
                <tr key={i} style={{background:i%2===0?"white":"#f8fafc",cursor:selPat?"default":"pointer"}}
                  onClick={()=>!selPat&&setSelPat(r)}>
                  {(selPat?[r.name,r.qty,Number(store.products.find(p=>p.id===r.prodId)?.price||0).toLocaleString("fr-FR"),r.val.toLocaleString("fr-FR")]:
                    [r.name,r.id,r.conso.length,r.items.reduce((s,x)=>s+x.qty,0),r.total.toLocaleString("fr-FR")])
                    .map((v,j)=><td key={j} style={{padding:"5px 8px",borderBottom:"1px solid #f1f5f9"}}>{v}</td>)}
                  {!selPat&&<td style={{padding:"5px 8px",borderBottom:"1px solid #f1f5f9",color:"#94a3b8"}}>›</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>printTable(selPat?"Détail — "+selPat.name:"Consommations par patient",headers,rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,headers,"patients")} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  // ══ 7. PÉREMPTIONS PROCHES ══
  const PeremptionsTab=()=>{
    const [horizon,setHorizon]=useState(90); // jours
    const today=new Date();
    const scopeLoc = effectiveSelService==="" ? null : (effectiveSelService==="pharmacie" ? "pharmacy" : "service:"+effectiveSelService);
    const scopeLabel = effectiveSelService==="" ? "Tous emplacements" : (effectiveSelService==="pharmacie" ? "Pharmacie" : (store.services.find(s=>s.id===effectiveSelService)?.name||"—"));
    const rowsRaw=(store.batches||[]).filter(b=>b.qtyRemaining>0 && b.expiry && (scopeLoc===null || b.location===scopeLoc)).map(b=>{
      const exp=new Date(b.expiry);
      const days=Math.ceil((exp-today)/(1000*60*60*24));
      return {...b, days};
    }).filter(b=>b.days<=horizon).sort((a,b)=>a.days-b.days);
    const headers=["Produit","Lot","Date de péremption","Jours restants","Qté restante"];
    const rows=rowsRaw.map(b=>[b.productName||"—", b.lot||"—", b.expiry, b.days<0?`Périmé (${Math.abs(b.days)}j)`:b.days+" j", b.qtyRemaining]);
    return(
      <div>
        <div style={{fontSize:11,color:"#6366f1",marginBottom:8}}>📍 {scopeLabel}</div>
        <div style={{marginBottom:10,maxWidth:220}}>
          <label style={label}>Horizon</label>
          <select style={input} value={horizon} onChange={e=>setHorizon(Number(e.target.value))}>
            <option value={30}>30 jours</option>
            <option value={60}>60 jours</option>
            <option value={90}>90 jours</option>
            <option value={180}>180 jours</option>
            <option value={99999}>Tous (y compris périmés)</option>
          </select>
        </div>
        <div style={{...card,background:"linear-gradient(135deg,#b91c1c,#ef4444)",padding:14,marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Lots concernés</div>
          <div style={{fontWeight:800,fontSize:24,color:"white"}}>{rowsRaw.length}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>dans les {horizon>=99999?"—":horizon+" prochains jours"}</div>
        </div>
        <div style={{maxHeight:280,overflowY:"auto",...card,marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{headers.map(h=><th key={h} style={{background:"#b91c1c",color:"white",padding:"5px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{rowsRaw.map((b,i)=>(
              <tr key={i} style={{background:b.days<0?"#fee2e2":b.days<30?"#ffedd5":(i%2===0?"white":"#fef2f2")}}>
                <td style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9",fontWeight:600}}>{b.productName||"—"}</td>
                <td style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9",fontFamily:"monospace"}}>{b.lot||"—"}</td>
                <td style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9"}}>{b.expiry}</td>
                <td style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9",fontWeight:700,color:b.days<0?"#b91c1c":(b.days<30?"#c2410c":"#334155")}}>{b.days<0?`Périmé (${Math.abs(b.days)}j)`:b.days+" j"}</td>
                <td style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9"}}>{b.qtyRemaining}</td>
              </tr>
            ))}</tbody>
          </table>
          {rowsRaw.length===0&&<div style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Aucun lot ne périme dans cette période.</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>printTable("Péremptions proches — "+scopeLabel,headers,rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,headers,"peremptions_proches")} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  // ══ 8. PRODUITS À COMMANDER ══
  const ReorderTab=()=>{
    const scope = effectiveSelService || "pharmacie"; // scope global (Période/Service en haut de page) — défaut Pharmacie si "Tous"
    const scopeLabel = scope==="pharmacie" ? "Pharmacie" : (store.services.find(s=>s.id===scope)?.name||"—");
    const getStock = (productId) => scope==="pharmacie" ? getPharmacyStock2(store,productId) : getServiceStock2(store,productId,scope);
    // Le seuil pharmacie (global, géré dans Produits) et le seuil service (par
    // service, géré dans la rubrique Seuil) sont deux notions distinctes —
    // jamais de repli de l'un vers l'autre.
    const getThreshold = (p) => scope==="pharmacie" ? p.reorderThreshold : (p.reorderThresholds?.[scope] ?? null);
    const rowsRaw=store.products
      .filter(p=>getThreshold(p)!=null && getStock(p.id)<=getThreshold(p))
      .map(p=>({
        name:p.name,
        supplier:store.suppliers.find(s=>s.id===p.supplierId)?.name||"—",
        stock:getStock(p.id),
        seuil:getThreshold(p),
        manque:Math.max(0,getThreshold(p)-getStock(p.id)),
      }))
      .sort((a,b)=>b.manque-a.manque);
    const headers=["Produit","Fournisseur","Stock actuel ("+scopeLabel+")","Seuil","Quantité à commander"];
    const rows=rowsRaw.map(r=>[r.name,r.supplier,r.stock,r.seuil,r.manque]);
    const nbSansSeuil=store.products.filter(p=>getThreshold(p)==null).length;
    return(
      <div>
        {!effectiveSelService&&<div style={{fontSize:11,color:"#6366f1",marginBottom:10,background:"#eef2ff",padding:8,borderRadius:8}}>ℹ️ Aucun service choisi en haut de page → vue Pharmacie par défaut.</div>}
        <div style={{...card,background:"linear-gradient(135deg,#b45309,#f59e0b)",padding:14,marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Produits sous leur seuil — {scopeLabel}</div>
          <div style={{fontWeight:800,fontSize:24,color:"white"}}>{rowsRaw.length}</div>
        </div>
        <div style={{maxHeight:280,overflowY:"auto",...card,marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{headers.map(h=><th key={h} style={{background:"#b45309",color:"white",padding:"5px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2===0?"white":"#fffbeb"}}>{r.map((v,j)=><td key={j} style={{padding:"4px 8px",borderBottom:"1px solid #f1f5f9",fontWeight:j===4?700:400,color:j===4?"#b45309":"inherit"}}>{v}</td>)}</tr>)}</tbody>
          </table>
          {rows.length===0&&<div style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Aucun produit sous son seuil pour cet emplacement.</div>}
        </div>
        {nbSansSeuil>0&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:8}}>ℹ️ {nbSansSeuil} produit(s) sans seuil configuré ({scope==="pharmacie"?"page Produits":"rubrique Seuil"}) — non pris en compte ici.</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>printTable("Produits à commander — "+scopeLabel,headers,rows)} style={{...btn(),background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",fontSize:12}}>🖨️ Imprimer</button>
          <button onClick={()=>exportCSV(rows,headers,"produits_a_commander")} style={{...btn(),background:"#f0fdf4",color:"#059669",border:"1px solid #86efac",fontSize:12}}>⬇️ CSV</button>
        </div>
      </div>
    );
  };

  return(
    <div style={{padding:0}}>
      <PageHeader pageId="statistiques" title="📈 Statistiques" subtitle="Analyses et rapports"/>
      <div style={{padding:16}}>
        {/* Filtre service — limite les statistiques au périmètre autorisé de
            l'utilisateur. Verrouillé (lecture seule) si un seul choix est
            possible : un agent de service ne voit que son service, un agent
            pharmacie ne voit que "Pharmacie". Seul l'admin principal garde le
            choix complet, y compris "Tous" (vue mélangeant pharmacie+services). */}
        <div style={{...card,marginBottom:12,padding:12,border:"1px solid #c7d2fe"}}>
          <div style={{fontWeight:700,fontSize:12,color:"#312e81",marginBottom:8}}>🏥 Service</div>
          {statScopeLocked?(
            <div style={{...input,background:"#f8fafc",color:"#312e81",fontWeight:600}}>{statOptions[0].label} <span style={{fontSize:10,color:"#94a3b8",fontWeight:400}}>(votre périmètre)</span></div>
          ):(
            <select style={input} value={selService} onChange={e=>setSelService(e.target.value)}>
              {statOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {effectiveSelService&&<div style={{fontSize:10,color:"#6366f1",marginTop:4}}>Applicable aux onglets Produits à commander, Péremptions proches, Mouvements et Activité utilisateur.</div>}
        </div>

        {/* Filtres dates communs */}
        <div style={{...card,marginBottom:12,padding:12}}>
          <div style={{fontWeight:700,fontSize:12,color:"#312e81",marginBottom:8}}>📅 Période</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={label}>Du</label><input type="date" style={input} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
            <div><label style={label}>Au</label><input type="date" style={input} value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
          </div>
        </div>

        {/* Onglets */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{...btn(),background:tab===t.id?"#4f46e5":"#f0f0ff",color:tab===t.id?"white":"#4f46e5",
                border:"1px solid "+(tab===t.id?"#4f46e5":"#c7d2fe"),fontSize:11,padding:"6px 10px",fontWeight:tab===t.id?700:400}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenu onglet */}
        <div style={{...card,padding:14}}>
          {tab==="rotation"         && <RotationTab/>}
          {tab==="user"             && <UserTab/>}
          {tab==="mouvements"       && <MouvementsTab/>}
          {tab==="valeur_prescrite" && <ValeurPrescrite/>}
          {tab==="valeur_stock"     && <ValeurStock/>}
          {tab==="patient"          && <PatientTab/>}
          {tab==="peremptions"      && <PeremptionsTab/>}
          {tab==="reorder"          && <ReorderTab/>}
        </div>
      </div>
    </div>
  );
}
