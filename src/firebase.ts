import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0341200272",
  appId: "1:863892173083:web:b87c22a3bf1e25b03fe3be",
  apiKey: "AIzaSyA8fHzHJB91tysig1GzclmYlhpt_wmk660",
  authDomain: "gen-lang-client-0341200272.firebaseapp.com",
  storageBucket: "gen-lang-client-0341200272.firebasestorage.app",
  messagingSenderId: "863892173083",
  measurementId: ""
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app, "ai-studio-unityearningpaym-5cbe4b17-24a7-4c1e-873f-c99afad44c93");

export { app, db, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, onSnapshot };
