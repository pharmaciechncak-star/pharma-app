import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profil, setProfil] = useState(null); // document utilisateurs (rôles, permissions)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const ref = doc(db, "utilisateurs", firebaseUser.uid);
        const snap = await getDoc(ref);
        setProfil(snap.exists() ? snap.data() : null);
      } else {
        setProfil(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  // Système flexible : on vérifie une permission précise, pas un rôle figé.
  // Un même agent peut cumuler plusieurs permissions (ex: lavage + conditionnement).
  const hasPermission = (permission) => {
    if (!profil) return false;
    if (profil.permissions?.includes("admin")) return true;
    return profil.permissions?.includes(permission) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, profil, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
