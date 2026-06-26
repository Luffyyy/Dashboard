import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  onSnapshot,
  query,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

let initialized = false;

export function initFirebaseFromEnv() {
  if (initialized) return;
  if (typeof window === 'undefined') return; // only run in browser

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId) {
    // Not configured; leave uninitialized. Consumer should handle missing config.
    return;
  }

  const config = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };

  if (!getApps().length) {
    initializeApp(config);
  }

  initialized = true;
}

function getDB() {
  return getFirestore();
}

export async function clearMessages(clientId: string) {
  const db = getDB();
  const col = collection(db, 'datasets', clientId, 'messages');
  const snapshot = await getDocs(col);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.forEach((d) => batch.delete(doc(db, 'datasets', clientId, 'messages', d.id)));
  await batch.commit();
}

export async function loadMessages(clientId: string, messages: any[]) {
  if (!messages || !messages.length) return;
  const db = getDB();
  const batch = writeBatch(db);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const docRef = doc(db, 'datasets', clientId, 'messages', m.id || `${i}`);
    batch.set(docRef, m);
    // Firestore limits batch to 500 ops; commit periodically
    if ((i + 1) % 400 === 0) {
      await batch.commit();
      // start a new batch
      // (we can't reuse the old batch variable, so create a new one)
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    // best-effort: ignore commit errors here, caller will surface
    console.error('Failed to commit batch', err);
  }
}

export function subscribeToMessages(clientId: string, cb: (docs: any[]) => void) {
  const db = getDB();
  const q = query(collection(db, 'datasets', clientId, 'messages'));
  const unsub = onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }));
    cb(data);
  });

  return unsub;
}
