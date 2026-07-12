import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { LOGO_CHNCAK_B64 } from "../../images";
import { Alert } from "../ui/FormControls";
import { label, input, btn } from "../../helpers/styles";

export function LoginPage({onLogin}){
  const [email,   setEmail]   = useState("");
  const [password,setPassword]= useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw,  setShowPw]  = useState(false);

  const tryLogin = async () => {
    if (!email || !password) { setErr("Veuillez saisir votre email et mot de passe."); return; }
    setLoading(true); setErr("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Charger le profil Firestore
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      let profile;
      if (snap.exists()) {
        profile = { uid: cred.user.uid, ...snap.data() };
      } else {
        // Premier utilisateur : créer profil admin automatiquement
        profile = {
          uid:   cred.user.uid,
          name:  cred.user.displayName || email.split("@")[0],
          email: cred.user.email,
          role:  "admin",
        };
        await setDoc(doc(db, "users", cred.user.uid), {
          ...profile, createdAt: serverTimestamp(),
        });
      }
      onLogin(profile);
    } catch(e) {
      const msgs = {
        "auth/wrong-password":    "Mot de passe incorrect.",
        "auth/user-not-found":    "Aucun compte avec cet email.",
        "auth/invalid-email":     "Format d'email invalide.",
        "auth/invalid-credential":"Email ou mot de passe incorrect.",
        "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
      };
      setErr(msgs[e.code] || "Erreur : " + e.message);
    } finally { setLoading(false); }
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:20,padding:32,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        {/* Logo complet CHNCAK */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src={LOGO_CHNCAK_B64} alt="CHNCAK PharmaStock"
            style={{width:"100%",maxWidth:360,height:"auto",borderRadius:14,marginBottom:16,boxShadow:"0 4px 20px rgba(8,145,178,0.25)"}}/>
          <div style={{fontSize:13,color:"#64748b",marginTop:4}}>Gestion des Inventaires Pharmaceutiques</div>
        </div>
        {err&&<Alert type="error">❌ {err}</Alert>}
        <div style={{marginBottom:14}}>
          <label style={label}>Email</label>
          <input style={input} type="email" value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="votre@email.com"
            onKeyDown={e=>e.key==="Enter"&&tryLogin()}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={label}>Mot de passe</label>
          <div style={{position:"relative"}}>
            <input style={{...input,paddingRight:38}} type={showPw?"text":"password"} value={password}
              onChange={e=>setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e=>e.key==="Enter"&&tryLogin()}/>
            <button onClick={()=>setShowPw(v=>!v)}
              style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:16,padding:0,lineHeight:1}}>
              {showPw?"🙈":"👁️"}
            </button>
          </div>
        </div>
        <button onClick={tryLogin} disabled={loading}
          style={{...btn(),width:"100%",padding:13,background:loading?"#cbd5e1":"linear-gradient(135deg,#0891b2,#0e7490)",color:"white",fontSize:15}}>
          {loading?"⏳ Connexion en cours...":"Se Connecter"}
        </button>
        <div style={{marginTop:16,fontSize:11,color:"#94a3b8",textAlign:"center"}}>
          🔒 Authentification sécurisée
        </div>
      </div>
    </div>
  );
}
