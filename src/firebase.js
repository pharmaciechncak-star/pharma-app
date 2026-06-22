// ============================================================
// firebase.js — Configuration PharmaStock CHNCAK
// ============================================================

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

// ── Configuration Firebase CHNCAK ──
const firebaseConfig = {
  apiKey:            "AIzaSyAHgqomj3Npdo5OnAaO2no4Xu61TyQZufE",
  authDomain:        "pharma-inventaire.firebaseapp.com",
  projectId:         "pharma-inventaire",
  storageBucket:     "pharma-inventaire.firebasestorage.app",
  messagingSenderId: "768525469457",
  appId:             "1:768525469457:web:6ec88a898be247796c2eb0",
};

const _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(_app);
const db   = getFirestore(_app);
const functions = getFunctions(_app, "us-central1");

// Proxy sécurisé vers Claude (la clé API reste côté serveur)
const askClaude = httpsCallable(functions, "askClaude");

export { auth, db, functions, askClaude, serverTimestamp, collection, doc, addDoc, getDoc,
         updateDoc, deleteDoc, query, orderBy, onSnapshot, setDoc,
         signInWithEmailAndPassword, signOut, onAuthStateChanged,
         createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword };

export default _app;
