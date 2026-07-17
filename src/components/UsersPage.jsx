import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { DEFAULT_PERMS, ROLES, SECTIONS } from "../constants";
import { can } from "../permissions";
import { auth } from "../firebase";
import { ConfirmDelete, Modal } from "./ui/Modal";
import { PageHeader } from "./ui/PageHeader";
import { btn, label, input, card } from "../helpers/styles";
import { Badge, Alert } from "./ui/FormControls";

// Rôles qu'un admin secondaire a le droit d'assigner à un nouvel utilisateur —
// évite qu'un "admin secondaire" puisse se créer un pair ou s'auto-élever.
const PHARMACY_ASSIGNABLE_ROLES = ["gestionnaire","pharmacien","magasinier","comptable"];
const SERVICE_ASSIGNABLE_ROLES  = ["agent_service"];

export function UsersPage({store, currentUser}){
  const isPrincipalAdmin = currentUser?.role==="admin" || currentUser?.isSuperuser;
  const isAdminPharma    = currentUser?.role==="admin_pharmacie";
  const isAdminSvc       = currentUser?.role==="admin_service";
  const myServiceId      = currentUser?.serviceId||"";

  // Rôles que CET utilisateur (l'admin connecté) a le droit d'assigner
  const assignableRoles = isPrincipalAdmin ? Object.keys(ROLES)
    : isAdminPharma ? PHARMACY_ASSIGNABLE_ROLES
    : isAdminSvc    ? SERVICE_ASSIGNABLE_ROLES
    : [];

  // Sections de permissions que cet admin a le droit de modifier pour autrui
  const assignableSections = isPrincipalAdmin ? SECTIONS
    : isAdminPharma ? SECTIONS.filter(s=>s.group==="pharmacie"||s.group==="catalogue")
    : isAdminSvc    ? SECTIONS.filter(s=>s.group==="services")
    : [];

  // Utilisateurs visibles pour cet admin : principal = tous ; admin_pharmacie =
  // uniquement les rôles pharmacie ; admin_service = uniquement les agents de
  // SON service.
  const visibleUsers = store.users.filter(u=>{
    if (isPrincipalAdmin) return true;
    if (isAdminPharma) return PHARMACY_ASSIGNABLE_ROLES.includes(u.role);
    if (isAdminSvc) return SERVICE_ASSIGNABLE_ROLES.includes(u.role) && u.serviceId===myServiceId;
    return u.id===currentUser?.uid;
  });
  const [show,       setShow]       = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [permTab,    setPermTab]    = useState(null);  // user dont on édite les permissions
  const [deletingU,  setDeletingU]  = useState(null);
  const [resetPwU,   setResetPwU]   = useState(null);  // user dont on reset le mdp
  const [newPw,      setNewPw]      = useState("");
  const [pwMsg,      setPwMsg]      = useState("");
  const [form,       setForm]       = useState({name:"",email:"",role:assignableRoles[0]||"magasinier",serviceId:isAdminSvc?myServiceId:"",tempPw:"",allowedServices:[],allowedSuppliers:[]});
  const [showTempPw, setShowTempPw] = useState(false);
  const [permForm,   setPermForm]   = useState({});
  const [showPwReset,setShowPwReset]= useState(false);

  const openAdd = () => {
    setEditing(null);
    setForm({name:"",email:"",role:assignableRoles[0]||"magasinier",serviceId:isAdminSvc?myServiceId:"",tempPw:"",allowedServices:[],allowedSuppliers:[]});
    setShowTempPw(false);
    setShow(true);
  };
  const openEdit = (u) => {
    setEditing(u.id);
    setForm({name:u.name,email:u.email,role:u.role,serviceId:u.serviceId||(isAdminSvc?myServiceId:""),allowedServices:u.allowedServices||[],allowedSuppliers:u.allowedSuppliers||[]});
    setShow(true);
  };
  const toggleAllowed = (field, id) => {
    setForm(f => {
      const cur = f[field]||[];
      return { ...f, [field]: cur.includes(id) ? cur.filter(x=>x!==id) : [...cur, id] };
    });
  };
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  const save = async () => {
    if(!form.name.trim()||!form.email.trim()){ setSaveError("⚠️ Nom et email obligatoires."); return; }
    if(!assignableRoles.includes(form.role)){ setSaveError("⚠️ Vous n'êtes pas autorisé à assigner ce rôle."); return; }
    // Un admin service ne peut créer/modifier que des agents de SON propre service
    const dataToSave = isAdminSvc ? {...form, serviceId:myServiceId} : form;
    setSaving(true); setSaveError("");
    try {
      if(editing){
        await store.updateUser(editing, dataToSave);
      } else {
        await store.addUser(dataToSave);
      }
      setShow(false);
      setForm({name:"",email:"",role:assignableRoles[0]||"magasinier",serviceId:isAdminSvc?myServiceId:"",tempPw:"",allowedServices:[],allowedSuppliers:[]});
      setEditing(null);
    } catch(e) {
      setSaveError("❌ " + (e.message||"Erreur inconnue"));
    } finally {
      setSaving(false);
    }
  };

  const openPerms = (u) => {
    const base = DEFAULT_PERMS[u.role] || {};
    setPermForm(u.permissions ? {...base,...u.permissions} : {...base});
    setPermTab(u);
  };
  const savePerms = async () => {
    await store.updateUser(permTab.id, {permissions: permForm});
    setPermTab(null);
  };
  // Un admin ne peut jamais accorder à autrui un droit qu'il ne possède pas
  // lui-même — évite qu'un admin secondaire élève un utilisateur au-delà de
  // son propre périmètre (ex : accorder "supprimer" sur une section où il n'a
  // lui-même que "modifier"). L'admin principal n'a pas cette limite.
  const canGrant = (sectionId, right) => isPrincipalAdmin || can(currentUser, sectionId, right);

  const togglePerm = (sectionId, right) => {
    if (!canGrant(sectionId, right)) return; // sécurité : ignore un clic sur un droit non délégable
    setPermForm(prev => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId]||{}), [right]: prev[sectionId]?.[right] ? 0 : 1 }
    }));
  };

  const handleResetPassword = async () => {
    if(!newPw || newPw.length < 6) { setPwMsg("⚠️ Minimum 6 caractères."); return; }
    try {
      // Stocker le mot de passe provisoire dans Firestore
      // L'utilisateur devra se reconnecter avec ce mot de passe
      await store.updateUser(resetPwU.id, {
        mustChangePw:  true,
        provisionalPw: newPw,
      });
      // Envoyer aussi un email de réinitialisation en option
      try { await sendPasswordResetEmail(auth, resetPwU.email); } catch(e){}
      setPwMsg("✅ Mot de passe provisoire enregistré : " + newPw + " — Communiquez-le à l'utilisateur.");
      setTimeout(()=>{ setResetPwU(null); setPwMsg(""); setNewPw(""); setShowPwReset(false); }, 5000);
    } catch(e) {
      setPwMsg("❌ Erreur : " + e.message);
    }
  };

  const thS = {padding:"7px 10px",fontSize:11,fontWeight:700,color:"#64748b",background:"#f8fafc",borderBottom:"2px solid #e2e8f0",textAlign:"center"};
  const tdS = {padding:"6px 8px",borderBottom:"1px solid #f1f5f9",textAlign:"center",fontSize:12};

  return(
    <div style={{padding:0}}>
      <ConfirmDelete open={!!deletingU} onClose={()=>setDeletingU(null)}
        label={deletingU?.name||""} onConfirm={async()=>{ await store.deleteUser(deletingU.id); setDeletingU(null); }}/>

      <PageHeader pageId="utilisateurs" title="👥 Utilisateurs" subtitle="Gestion des accès et rôles">
        <button onClick={openAdd} style={{...btn(),background:"white",color:"#4c0519",fontWeight:700}}>+ Nouveau</button>
      </PageHeader>

      <div style={{padding:16}}>
        {/* Modal ajout/modif utilisateur */}
        <Modal open={show} onClose={()=>setShow(false)} title={editing?"✏️ Modifier Utilisateur":"👤 Nouvel Utilisateur"}>
          <div style={{marginBottom:12}}><label style={label}>Nom complet</label><input style={input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div style={{marginBottom:12}}><label style={label}>Email</label><input style={{...input,background:editing?"#f8fafc":"white"}} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} disabled={!!editing}/></div>
          <div style={{marginBottom:12}}>
            <label style={label}>Rôle</label>
            <select style={input} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
              {assignableRoles.map(k=><option key={k} value={k}>{ROLES[k]?.label||k}</option>)}
            </select>
            {!isPrincipalAdmin&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>En tant qu'admin secondaire, vous ne pouvez assigner que les rôles de votre périmètre.</div>}
          </div>

          {/* Service d'appartenance — obligatoire pour un rôle service. Verrouillé
              sur le service de l'admin connecté quand c'est un admin service. */}
          {(form.role==="agent_service"||form.role==="admin_service")&&(
            <div style={{marginBottom:12}}>
              <label style={label}>Service d'appartenance</label>
              {isAdminSvc?(
                <div style={{...input,background:"#f8fafc",color:"#64748b"}}>{store.services.find(s=>s.id===myServiceId)?.name||"—"} <span style={{fontSize:10}}>(votre service)</span></div>
              ):(
                <select style={input} value={form.serviceId} onChange={e=>setForm(f=>({...f,serviceId:e.target.value}))}>
                  <option value="">— Choisir —</option>
                  {(store.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Restriction par service — laisser vide = accès à tous les services autorisés par le rôle */}
          <div style={{marginBottom:12}}>
            <label style={label}>Services autorisés <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(aucun coché = tous)</span></label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,background:"#f8fafc",borderRadius:8,padding:10,maxHeight:120,overflowY:"auto"}}>
              {(store.services||[]).length===0&&<div style={{fontSize:11,color:"#94a3b8"}}>Aucun service créé.</div>}
              {(store.services||[]).map(s=>(
                <label key={s.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,background:form.allowedServices.includes(s.id)?"#eef2ff":"white",border:"1px solid "+(form.allowedServices.includes(s.id)?"#818cf8":"#e2e8f0"),borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>
                  <input type="checkbox" checked={form.allowedServices.includes(s.id)} onChange={()=>toggleAllowed("allowedServices",s.id)}/>
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          {/* Restriction par fournisseur — laisser vide = accès à tous les fournisseurs autorisés par le rôle */}
          <div style={{marginBottom:12}}>
            <label style={label}>Fournisseurs autorisés <span style={{fontWeight:400,color:"#94a3b8",fontSize:10}}>(aucun coché = tous)</span></label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,background:"#f8fafc",borderRadius:8,padding:10,maxHeight:120,overflowY:"auto"}}>
              {(store.suppliers||[]).length===0&&<div style={{fontSize:11,color:"#94a3b8"}}>Aucun fournisseur créé.</div>}
              {(store.suppliers||[]).map(s=>(
                <label key={s.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,background:form.allowedSuppliers.includes(s.id)?"#eef2ff":"white",border:"1px solid "+(form.allowedSuppliers.includes(s.id)?"#818cf8":"#e2e8f0"),borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>
                  <input type="checkbox" checked={form.allowedSuppliers.includes(s.id)} onChange={()=>toggleAllowed("allowedSuppliers",s.id)}/>
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          {!editing&&(
            <div style={{marginBottom:16}}>
              <label style={label}>Mot de passe provisoire <span style={{color:"#94a3b8",fontWeight:400}}>(optionnel)</span></label>
              <div style={{position:"relative"}}>
                <input
                  style={{...input,paddingRight:38}}
                  type={showTempPw?"text":"password"}
                  value={form.tempPw}
                  onChange={e=>setForm(f=>({...f,tempPw:e.target.value}))}
                  placeholder="Laissez vide pour utiliser PharmaStock2025!"/>
                <button onClick={()=>setShowTempPw(v=>!v)}
                  style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:16,padding:0}}>
                  {showTempPw?"🙈":"👁️"}
                </button>
              </div>
              <div style={{background:"#f0f9ff",borderRadius:8,padding:10,fontSize:11,color:"#0891b2",marginTop:6}}>
                ℹ️ Mot de passe par défaut : <b>PharmaStock2025!</b> — L'utilisateur devra le changer à la première connexion.
              </div>
            </div>
          )}
          {saveError&&<div style={{background:"#fee2e2",color:"#b91c1c",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:10}}>{saveError}</div>}
          <button onClick={save} disabled={!form.name||!form.email||saving}
            style={{...btn(),background:(!form.name||!form.email||saving)?"#cbd5e1":"#0891b2",color:"white",width:"100%",padding:11,fontSize:13}}>
            {saving?"⏳ Création en cours...":(editing?"✏️ Enregistrer":"💾 Créer l'utilisateur")}
          </button>
        </Modal>

        {/* Modal permissions granulaires */}
        <Modal open={!!permTab} onClose={()=>setPermTab(null)} title={"🔐 Permissions — " + (permTab?.name||"")}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
            Rôle de base : <Badge color={ROLES[permTab?.role]?.color}>{ROLES[permTab?.role]?.label}</Badge>
            <br/><span style={{fontSize:11}}>Ces cases personnalisent les droits par rapport aux droits du rôle.</span>
          </div>
          {!isPrincipalAdmin&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:8}}>ℹ️ Les cases grisées correspondent à des droits que vous ne possédez pas vous-même — vous ne pouvez pas les accorder à un autre utilisateur.</div>}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  <th style={{...thS,textAlign:"left"}}>Section</th>
                  <th style={thS}>👁️ Consulter</th>
                  <th style={thS}>✏️ Modifier</th>
                  <th style={thS}>🗑️ Supprimer</th>
                </tr>
              </thead>
              <tbody>
                {assignableSections.map(s => (
                  <tr key={s.id}>
                    <td style={{...tdS,textAlign:"left",fontWeight:500,color:"#1e293b"}}>{s.label}</td>
                    {["r","w","d"].map(right=>{
                      const grantable = canGrant(s.id,right);
                      return(
                      <td key={right} style={tdS}>
                        <input type="checkbox"
                          checked={!!(permForm[s.id]?.[right])}
                          onChange={()=>togglePerm(s.id,right)}
                          disabled={!grantable}
                          title={grantable?"":"Vous ne pouvez pas accorder un droit que vous ne possédez pas vous-même"}
                          style={{width:16,height:16,cursor:grantable?"pointer":"not-allowed",accentColor:"#0891b2",opacity:grantable?1:0.35}}/>
                      </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={savePerms} style={{...btn(),background:"#0891b2",color:"white",width:"100%",padding:11,marginTop:16}}>
            💾 Enregistrer les permissions
          </button>
        </Modal>

        {/* Modal réinitialisation mot de passe */}
        <Modal open={!!resetPwU} onClose={()=>{setResetPwU(null);setPwMsg("");setNewPw("");}} title={"🔑 Mot de passe — " + (resetPwU?.name||"")}>
          {pwMsg ? (
            <Alert type={pwMsg.startsWith("✅")?"success":pwMsg.startsWith("⚠️")?"warn":"error"}>{pwMsg}</Alert>
          ) : (
            <>
              <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>
                Définir un mot de passe provisoire pour <b>{resetPwU?.name}</b> ({resetPwU?.email})
              </div>
              <div style={{marginBottom:12}}>
                <label style={label}>Nouveau mot de passe provisoire</label>
                <div style={{position:"relative"}}>
                  <input
                    style={{...input,paddingRight:38}}
                    type={showPwReset?"text":"password"}
                    value={newPw}
                    onChange={e=>setNewPw(e.target.value)}
                    placeholder="Minimum 6 caractères"/>
                  <button onClick={()=>setShowPwReset(v=>!v)}
                    style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:16,padding:0}}>
                    {showPwReset?"🙈":"👁️"}
                  </button>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleResetPassword}
                  style={{...btn(),background:"#0891b2",color:"white",flex:1,padding:11,fontSize:13}}>
                  💾 Définir ce mot de passe
                </button>
                <button onClick={()=>{ store.updateUser(resetPwU.id,{mustChangePw:true}); sendPasswordResetEmail(auth,resetPwU.email).then(()=>setPwMsg("✅ Email envoyé à "+resetPwU.email)).catch(e=>setPwMsg("❌ "+e.message)); }}
                  style={{...btn(),background:"#f59e0b",color:"white",flex:1,padding:11,fontSize:13}}>
                  📧 Envoyer email reset
                </button>
              </div>
            </>
          )}
        </Modal>

        {/* Liste utilisateurs */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {visibleUsers.map(u=>{
            const isSuperuser    = u.isSuperuser || u.role==="superuser";
            const isTargetAdmin  = u.role==="admin";
            const isCurrentUser  = u.id===currentUser?.uid;
            const amISuperuser   = currentUser?.isSuperuser || currentUser?.role==="superuser";
            const amIAdmin       = currentUser?.role==="admin";

            // Règles de protection :
            // - Superuser → intouchable par tout le monde
            // - Admin cible → seul le superuser peut le modifier/supprimer/démettre
            // - Soi-même → ne peut pas se supprimer ni se démettre
            const isProtected    = isSuperuser || (isTargetAdmin && !amISuperuser);
            const canEdit        = !isSuperuser && (!isTargetAdmin || amISuperuser) && !isCurrentUser;
            const canEditPerms   = !isSuperuser && (!isTargetAdmin || amISuperuser);
            const canResetPw     = !isSuperuser && (!isTargetAdmin || amISuperuser);
            const canDelete      = !isSuperuser && !isCurrentUser && (!isTargetAdmin || amISuperuser);
            const canToggleAdmin = !isSuperuser && !isCurrentUser && amISuperuser; // seul superuser peut promouvoir/rétrograder admin

            return(
            <div key={u.id} style={{...card,padding:14,border:isSuperuser?"2px solid #f59e0b":isTargetAdmin?"2px solid #7c3aed":"1.5px solid #f1f5f9"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:(ROLES[u.role]?.color||"#94a3b8")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                  {isSuperuser?"⭐":isTargetAdmin?"🛡️":"👤"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{u.name}</div>
                    {isSuperuser&&<span style={{background:"#f59e0b",color:"white",fontSize:9,fontWeight:700,borderRadius:99,padding:"1px 6px"}}>SUPER</span>}
                    {isTargetAdmin&&!isSuperuser&&<span style={{background:"#7c3aed",color:"white",fontSize:9,fontWeight:700,borderRadius:99,padding:"1px 6px"}}>ADMIN</span>}
                  </div>
                  <div style={{fontSize:11,color:"#64748b"}}>{u.email}</div>
                  <Badge color={ROLES[u.role]?.color||"#94a3b8"}>{ROLES[u.role]?.label||u.role}</Badge>
                  {u.permissions&&<span style={{fontSize:10,color:"#7c3aed",marginLeft:6}}>🔐 Perms perso.</span>}
                  {u.mustChangePw&&<span style={{fontSize:10,color:"#f59e0b",marginLeft:6}}>⚠️ Doit changer mdp</span>}
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {canEdit      &&<button onClick={()=>openEdit(u)}    style={{...btn(),background:"#f0f9ff",color:"#0891b2",padding:"5px 8px",fontSize:11}} title="Modifier">✏️</button>}
                  {canEditPerms &&<button onClick={()=>openPerms(u)}   style={{...btn(),background:"#fdf4ff",color:"#7c3aed",padding:"5px 8px",fontSize:11}} title="Permissions">🔐</button>}
                  {canResetPw   &&<button onClick={()=>setResetPwU(u)} style={{...btn(),background:"#fffbeb",color:"#d97706",padding:"5px 8px",fontSize:11}} title="Mot de passe provisoire">🔑</button>}
                  {canToggleAdmin&&(
                    <button onClick={()=>store.updateUser(u.id,{role:u.role==="admin"?"magasinier":"admin"})}
                      style={{...btn(),background:u.role==="admin"?"#ede9fe":"#f8fafc",color:u.role==="admin"?"#7c3aed":"#64748b",padding:"5px 8px",fontSize:11}}
                      title={u.role==="admin"?"Retirer admin":"Promouvoir admin"}>
                      {u.role==="admin"?"🛡️ -Admin":"🛡️ Admin"}
                    </button>
                  )}
                  {canDelete    &&<button onClick={()=>setDeletingU(u)} style={{...btn(),background:"#fee2e2",color:"#ef4444",padding:"5px 8px",fontSize:11}} title="Supprimer">🗑️</button>}
                  {isProtected  &&!isCurrentUser&&<span style={{fontSize:10,color:isSuperuser?"#f59e0b":"#7c3aed",padding:"5px 4px"}}>🔒</span>}
                </div>
              </div>
            </div>
            );
          })}
          {visibleUsers.length===0&&<div style={{...card,textAlign:"center",padding:40,color:"#94a3b8"}}>Aucun utilisateur dans votre périmètre.</div>}
        </div>
      </div>
    </div>
  );
}
