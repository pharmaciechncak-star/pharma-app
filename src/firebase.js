import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey:            "AIzaSyAHgqomj3Npdo5OnAaO2no4Xu61TyQZufE",
  authDomain:        "pharma-inventaire.firebaseapp.com",
  projectId:         "pharma-inventaire",
  storageBucket:     "pharma-inventaire.firebasestorage.app",
  messagingSenderId: "768525469457",
  appId:             "1:768525469457:web:6ec88a898be247796c2eb0",
};

export const _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth    = getAuth(_app);

export const db      = getFirestore(_app);

export const _appSecondary = getApps().find(a=>a.name==="secondary") || initializeApp(firebaseConfig, "secondary");

export const authSecondary = getAuth(_appSecondary);
