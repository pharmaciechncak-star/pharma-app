import { useState, useEffect } from "react";
import { signOut, onAuthStateChanged, updatePassword } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useStore } from "./hooks/useStore";
import { useAI } from "./hooks/useAI";
import { LOGO_B64 } from "./images";
import { LoginPage } from "./components/layout/LoginPage";
import { Dashboard } from "./components/Dashboard";
import { DocumentForm } from "./components/DocumentForm";
import { InventoryPage } from "./components/InventoryPage";
import { InvoicesPage } from "./components/InvoicesPage";
import { InventoryHistoryPage } from "./components/InventoryHistoryPage";
import { downloadExcel, downloadInvoiceCSV } from "./helpers/exportUtils";
import { HistoryPage } from "./components/ui/HistoryPage";
import { card, label, input, btn } from "./helpers/styles";
import { pdfHeader, downloadPDF } from "./helpers/pdfUtils";
import { openMailClient } from "./email";
import { can, visibleSuppliers, hasSupplierAccess } from "./permissions";
import { MessagingPage } from "./components/MessagingPage";
import { ProductsPage } from "./components/ProductsPage";
import { ServicesPage } from "./components/services/ServicesPage";
import { Alert, Badge } from "./components/ui/FormControls";
import { TransfertsPage } from "./components/services/TransfertsPage";
import { ConsommationsPage } from "./components/services/ConsommationsPage";
import { RetoursServicePage } from "./components/services/RetoursServicePage";
import { ReceptionsPage } from "./components/services/ReceptionsPage";
import { StockServicePage } from "./components/services/StockServicePage";
import { StatistiquesPage } from "./components/StatistiquesPage";
import { DepotsPage } from "./components/DepotsPage";
import { FournisseursPage } from "./components/FournisseursPage";
import { ActivitiesPage } from "./components/ActivitiesPage";
import { UsersPage } from "./components/UsersPage";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { AIPanel } from "./components/AIPanel";
import { Modal, SupplierSelector } from "./components/ui/Modal";
import { ROLES } from "./constants";

export default function App(){
  const [user,            setUser]            = useState(null);
  const [authLoading,     setAuthLoading]     = useState(true);
  const [page,            setPage]            = useState("dashboard");
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [aiOpen,          setAiOpen]          = useState(false);
  const [supplierModal,   setSupplierModal]   = useState(false);
  const [activeSupplier,  setActiveSupplierState] = useState(()=>{
    // Restauration immédiate depuis localStorage au chargement
    try {
      const saved = localStorage.getItem("pharma_active_supplier");
      return saved ? JSON.parse(saved) : null;
    } catch(e) { return null; }
  });
  const [pendingInvoiceId,setPendingInvoiceId] = useState(null);
  const [profileOpen,setProfileOpen] = useState(false);
  const [profilePw,setProfilePw]     = useState({current:"",next:"",confirm:""});
  const [profileMsg,setProfileMsg]   = useState("");

  const handleUpdatePassword = async () => {
    if(profilePw.next.length<6){setProfileMsg("❌ Minimum 6 caractères.");return;}
    if(profilePw.next!==profilePw.confirm){setProfileMsg("❌ Les mots de passe ne correspondent pas.");return;}
    try{
      await updatePassword(auth.currentUser, profilePw.next);
      setProfileMsg("✅ Mot de passe modifié avec succès !");
      setProfilePw({current:"",next:"",confirm:""});
      setTimeout(()=>{setProfileOpen(false);setProfileMsg("");},2000);
    }catch(e){
      if(e.code==="auth/requires-recent-login") setProfileMsg("❌ Session expirée. Reconnectez-vous.");
      else setProfileMsg("❌ Erreur : "+e.message);
    }
  }; // facture à pré-remplir en messagerie

  // ── Firebase Auth : détecte session existante au chargement ──
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        try {
          const snap = await getDoc(doc(db,"users",fbUser.uid));
          if (snap.exists()) {
            setUser({ uid: fbUser.uid, ...snap.data() });
          } else {
            // Profil manquant → créer automatiquement en admin
            const profile = {
              name:  fbUser.displayName || fbUser.email.split("@")[0],
              email: fbUser.email,
              role:  "admin",
            };
            await setDoc(doc(db,"users",fbUser.uid), { ...profile, createdAt: serverTimestamp() });
            setUser({ uid: fbUser.uid, ...profile });
          }
        } catch(e) {
          console.error("Erreur chargement profil:", e);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  },[]);

  const store = useStore(user?.uid, user?.name || user?.email || "Inconnu");
  const ai    = useAI();

  // ── Synchroniser activeSupplier avec les données fraîches de Firestore ──
  // (au cas où le nom/email du fournisseur aurait changé)
  useEffect(()=>{
    if(!activeSupplier || store.suppliers.length === 0) return;
    // Si l'admin a restreint entre-temps les fournisseurs autorisés pour cet
    // utilisateur, et que le fournisseur actif sauvegardé n'en fait plus partie,
    // on le désélectionne pour éviter un accès résiduel non autorisé.
    if (!hasSupplierAccess(user, activeSupplier.id)) {
      setActiveSupplierState(null);
      localStorage.removeItem("pharma_active_supplier");
      return;
    }
    const fresh = store.suppliers.find(s => s.id === activeSupplier.id);
    if(fresh && (fresh.name !== activeSupplier.name || fresh.email !== activeSupplier.email)){
      setActiveSupplierState(fresh);
      localStorage.setItem("pharma_active_supplier", JSON.stringify(fresh));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[store.suppliers, user]);

  const setActiveSupplier = async (s) => {
    setActiveSupplierState(s);
    // Sauvegarder dans localStorage pour restauration immédiate
    if(s) localStorage.setItem("pharma_active_supplier", JSON.stringify(s));
    else localStorage.removeItem("pharma_active_supplier");
    setSupplierModal(false); setMenuOpen(false);
    // Persister aussi dans Firestore
    if(user?.uid) {
      try {
        await updateDoc(doc(db,"users",user.uid), { activeSupplier: s?.id || null });
      } catch(e) { console.warn("Erreur sauvegarde fournisseur:", e); }
    }
  };

  const nav = (p, extra={}) => {
    setPage(p);
    setMenuOpen(false);
    setAiOpen(false);
    if(extra.invoiceId !== undefined) setPendingInvoiceId(extra.invoiceId);
  };
  const logout = async () => {
    await signOut(auth);
    setUser(null);
    // Ne pas effacer le fournisseur actif — sera restauré à la prochaine connexion
    setPage("dashboard");
  };

  // ── Écran de chargement pendant vérification Auth ──
  if(authLoading) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a,#1e3a5f)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
      <img src={LOGO_B64} alt="CHNCAK" style={{width:90,height:90,borderRadius:"50%",objectFit:"cover",border:"3px solid #38bdf8"}}/>
      <div style={{color:"#38bdf8",fontWeight:700,fontSize:16}}>CHNCAK PharmaStock</div>
      <div style={{color:"#64748b",fontSize:13}}>⏳ Chargement en cours...</div>
    </div>
  );

  if(!user) return <LoginPage onLogin={setUser}/>;

  // ── Écran de chargement des données Firestore ──
  if(store.loading) return (
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src={LOGO_B64} alt="CHNCAK" style={{width:70,height:70,borderRadius:"50%",objectFit:"cover",border:"3px solid #0891b2"}}/>
      <div style={{color:"#0891b2",fontWeight:700}}>Synchronisation des données...</div>
      <div style={{color:"#94a3b8",fontSize:12}}>Connexion en cours...</div>
    </div>
  );

  const unread=store.messages.filter(m=>!m.read).length;
  const role=user.role||"magasinier";
  const activeDepot=activeSupplier ? store.depots.find(d=>d.supplierId===activeSupplier.id) : null;

  const renderPage=()=>{
    const props={store,activeSupplier,activeDepot,onNav:nav,currentUser:user};
    switch(page){
      case "dashboard":    return <Dashboard {...props}/>;
      case "entrees":      return <DocumentForm type="entry"  {...props} ai={ai}/>;
      case "retours":      return <DocumentForm type="return" {...props} ai={ai}/>;
      case "inventaire":   return <InventoryPage store={store} activeSupplier={activeSupplier} currentUser={user}/>;
      case "factures":     return <InvoicesPage store={store} activeSupplier={activeSupplier} onNav={nav} currentUser={user}/>;
      case "hist-inv":
        return <InventoryHistoryPage store={store} activeSupplier={activeSupplier} user={user}/>;
      case "hist-fact": {
        const factItems=store.invoices.filter(i=>!activeSupplier||i.supplierId===activeSupplier?.id);
        const exportFactCSV=()=>{
          const rows=factItems.flatMap(inv=>(inv.items||[]).map(it=>[inv.reference,inv.month,inv.supplier,it.productName,it.qty,Number(it.unitPrice||0),Number(it.total||0),Number(inv.total||0)]));
          downloadExcel("historique_factures_"+Date.now()+".xlsx",rows,["Référence","Période","Fournisseur","Produit","Qté","Prix unit. FCFA","Total ligne FCFA","Total facture FCFA"]);
        };
        return <HistoryPage title="Historique Situations" icon="📁" pageId="hist-fact" items={factItems} empty="Aucune facture." onExportCSV={exportFactCSV}
          renderItem={inv=>(
            <div key={inv.id} style={{...card,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{inv.reference}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{inv.supplier} · {inv.month}</div>
                {inv.createdByName&&<div style={{fontSize:10,color:"#94a3b8"}}>👤 {inv.createdByName}</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{fontWeight:800,color:"#0891b2",fontSize:14}}>{Number(inv.total||0).toLocaleString("fr-FR")} FCFA</div>
                {/* CSV */}
                <button onClick={e=>{e.stopPropagation();downloadInvoiceCSV(inv);}} style={{background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>⬇️ CSV</button>
                {/* PDF */}
                <button onClick={e=>{
                  e.stopPropagation();
                  const tbl=""+pdfHeader("FACTURE",inv.reference)+
                    "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;\">"+
                    "<div style=\"background:#f8fafc;padding:8px 10px;border-radius:6px;\"><div style=\"font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;\">Fournisseur</div><div style=\"font-weight:600;\">"+inv.supplier+"</div></div>"+
                    "<div style=\"background:#f8fafc;padding:8px 10px;border-radius:6px;\"><div style=\"font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;\">Période</div><div style=\"font-weight:600;\">"+inv.month+"</div></div></div>"+
                    "<table><tr><th>Produit</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr>"+
                    (inv.items||[]).map(it=>"<tr><td>"+it.productName+"</td><td>"+it.qty+"</td><td>"+Number(it.unitPrice||0).toLocaleString("fr-FR")+" FCFA</td><td>"+Number(it.total||0).toLocaleString("fr-FR")+" FCFA</td></tr>").join("")+
                    "<tr class=\"total-row\"><td colspan=3>TOTAL</td><td>"+Number(inv.total||0).toLocaleString("fr-FR")+" FCFA</td></tr></table>"+
                    "<div class=\"footer\">Généré le "+new Date().toLocaleDateString("fr-FR")+"</div>";
                  downloadPDF("facture_"+inv.reference,tbl);
                }} style={{background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>⬇️ PDF</button>
                {/* Mail */}
                <button onClick={e=>{
                  e.stopPropagation();
                  const details=(inv.items||[]).map(it=>`- ${it.productName} | Qté: ${it.qty} | Total: ${Number(it.total||0).toLocaleString("fr-FR")} FCFA`).join("\n");
                  openMailClient({
                    to: activeSupplier?.email || "",
                    subject: `Facture ${inv.reference} — ${inv.month}`,
                    body:
                      `Bonjour,\n\n`+
                      `Veuillez trouver ci-joint la facture ${inv.reference} pour la période ${inv.month}.\n\n`+
                      `Fournisseur : ${inv.supplier}\n`+
                      `Période     : ${inv.month}\n\n`+
                      `Détails :\n${details}\n\n`+
                      `TOTAL : ${Number(inv.total||0).toLocaleString("fr-FR")} FCFA\n\n`+
                      `Cordialement,\nCHNCAK PharmaStock`
                  });
                }} style={{background:"#0891b2",color:"white",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>📧 Mail</button>
                {can(user,"hist-fact","d")&&<button onClick={e=>{e.stopPropagation();store.deleteInvoice(inv.id);}} style={{background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>🗑️</button>}
              </div>
            </div>
          )}/>;
      }
      case "messagerie":   return <MessagingPage store={store} activeSupplier={activeSupplier} pendingInvoiceId={pendingInvoiceId} onClearPending={()=>setPendingInvoiceId(null)} currentUser={user}/>;
      case "produits":     return <ProductsPage store={store} activeSupplier={activeSupplier} currentUser={user}/>;
      case "services":        return can(user,"services","r")?<ServicesPage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "transferts":      return can(user,"transferts","r")?<TransfertsPage store={store} activeSupplier={activeSupplier} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "consommations":   return can(user,"consommations","r")?<ConsommationsPage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "retours-service": return can(user,"retours-service","r")?<RetoursServicePage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "receptions":      return can(user,"receptions","r")?<ReceptionsPage store={store} activeSupplier={activeSupplier} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "stock-service":   return can(user,"stock-service","r")?<StockServicePage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "statistiques":    return can(user,"statistiques","r")?<StatistiquesPage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé.</Alert></div>;
      case "depots":       return <DepotsPage store={store} activeSupplier={activeSupplier} currentUser={user}/>;

      case "fournisseurs": return <FournisseursPage store={store} activeSupplier={activeSupplier} onActivate={setActiveSupplier} currentUser={user}/>;
      case "activites":    return can(user,"activites","r")?<ActivitiesPage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès non autorisé. Contactez l'administrateur.</Alert></div>;
      case "utilisateurs": return role==="admin"?<UsersPage store={store} currentUser={user}/>:<div style={{padding:24}}><Alert type="error">Accès refusé.</Alert></div>;
      default:             return <Dashboard store={store} activeSupplier={activeSupplier} activeDepot={activeDepot}/>;
    }
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#f8fafc",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",overflow:"hidden"}}>
      <TopBar page={page} activeSupplier={activeSupplier} onMenu={()=>setMenuOpen(true)}
        onAI={()=>{
          if(!can(user,"assistant_ia","r")){ alert("⛔ Accès à l'Assistant IA non autorisé. Contactez l'administrateur."); return; }
          setAiOpen(v=>!v);setMenuOpen(false);
        }} aiOpen={aiOpen} currentUser={user}
        unread={unread} onLogout={logout} onChangeSupplier={()=>setSupplierModal(true)} onNav={nav}
        onProfile={()=>setProfileOpen(true)} userName={user?.name||user?.email}/>
      <div id="main-scroll-area" style={{flex:1,overflowY:"auto"}}>
        {renderPage()}
      </div>
      <Sidebar open={menuOpen} onClose={()=>setMenuOpen(false)} page={page} onNav={nav}
        user={user} unread={unread} activeSupplier={activeSupplier}
        onChangeSupplier={()=>{setSupplierModal(true);setMenuOpen(false);}}/>
      <AIPanel open={aiOpen} onClose={()=>setAiOpen(false)} ai={ai} onNav={nav}
        store={store} page={page} activeSupplier={activeSupplier} currentUser={user}/>
      {/* Modal Mon Profil */}
      <Modal open={profileOpen} onClose={()=>{setProfileOpen(false);setProfileMsg("");setProfilePw({current:"",next:"",confirm:""});}} title="👤 Mon Profil">
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #f1f5f9",marginBottom:14}}>
            <div style={{width:50,height:50,borderRadius:"50%",background:ROLES[user?.role]?.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>👤</div>
            <div>
              <div style={{fontWeight:700,color:"#1e293b",fontSize:15}}>{user?.name}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{user?.email}</div>
              <Badge color={ROLES[user?.role]?.color}>{ROLES[user?.role]?.label}</Badge>
            </div>
          </div>
          <div style={{fontWeight:700,color:"#374151",fontSize:13,marginBottom:12}}>🔑 Changer mon mot de passe</div>
          {profileMsg&&<Alert type={profileMsg.startsWith("✅")?"success":"error"}>{profileMsg}</Alert>}
          <div style={{marginBottom:10}}><label style={label}>Nouveau mot de passe</label>
            <input style={input} type="password" value={profilePw.next}
              onChange={e=>setProfilePw(p=>({...p,next:e.target.value}))} placeholder="Minimum 6 caractères"/>
          </div>
          <div style={{marginBottom:16}}><label style={label}>Confirmer</label>
            <input style={input} type="password" value={profilePw.confirm}
              onChange={e=>setProfilePw(p=>({...p,confirm:e.target.value}))} placeholder="Répéter le mot de passe"/>
          </div>
          <button onClick={handleUpdatePassword}
            disabled={!profilePw.next||!profilePw.confirm}
            style={{...btn(),background:"#0891b2",color:"white",width:"100%",padding:11,fontSize:14}}>
            🔑 Mettre à jour le mot de passe
          </button>
        </div>
      </Modal>

      <SupplierSelector open={supplierModal} suppliers={visibleSuppliers(user, store.suppliers)} current={activeSupplier}
        onSelect={setActiveSupplier} onClose={()=>setSupplierModal(false)}/>
    </div>
  );
}
