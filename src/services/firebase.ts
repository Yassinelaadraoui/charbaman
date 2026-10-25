import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Firestore,
  addDoc,
  collection,
  getDocs,
  initializeFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import type { ScoreEntry } from './storage';

// Values come from .env (see .env.example). EXPO_PUBLIC_ vars are inlined at build time,
// so they must be read with dot access.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let db: Firestore | null = null;

function getDb(): Firestore | null {
  if (!firebaseEnabled) return null;
  if (db) return db;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  // Long polling is the most reliable transport inside React Native.
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  return db;
}

// One collection per mode (leaderboards/{mode}/scores) so ordering by score
// needs no composite index.
const scoresRef = (d: Firestore, mode: string) => collection(d, 'leaderboards', mode, 'scores');

export async function submitScore(mode: string, entry: ScoreEntry): Promise<boolean> {
  const d = getDb();
  if (!d) return false;
  try {
    await addDoc(scoresRef(d, mode), {
      name: entry.name.slice(0, 16),
      score: Math.floor(entry.score),
      cans: Math.floor(entry.cans),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.warn('submitScore failed', err);
    return false;
  }
}

export async function fetchTop(mode: string, count = 20): Promise<ScoreEntry[] | null> {
  const d = getDb();
  if (!d) return null;
  try {
    const snap = await getDocs(query(scoresRef(d, mode), orderBy('score', 'desc'), limit(count)));
    return snap.docs.map((doc) => {
      const v = doc.data();
      return { name: String(v.name ?? '???'), score: Number(v.score ?? 0), cans: Number(v.cans ?? 0), at: v.createdAt?.toMillis?.() ?? 0 };
    });
  } catch (err) {
    console.warn('fetchTop failed', err);
    return null;
  }
}
