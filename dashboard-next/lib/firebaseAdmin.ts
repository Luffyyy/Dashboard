import admin from 'firebase-admin';

function initAdmin() {
  // access apps via any to avoid typing mismatch in firebase-admin typings
  if ((admin as any).apps && (admin as any).apps.length) return;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    return;
  }

  const svc = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (svc) {
    let parsed: any;
    try {
      parsed = typeof svc === 'string' && svc.trim().startsWith('{') ? JSON.parse(svc) : JSON.parse(Buffer.from(svc, 'base64').toString('utf8'));
    } catch (err) {
      // If parsing fails, try raw JSON parse
      parsed = JSON.parse(svc as string);
    }
    admin.initializeApp({ credential: (admin as any).credential.cert(parsed) });
    return;
  }

  // If no explicit credentials provided, try initialize with default env
  try {
    admin.initializeApp();
  } catch (err) {
    // leave uninitialized; callers should handle failure
    console.warn('firebase-admin initialize failed:', err);
  }
}

export async function getMessagesForClient(clientId: string) {
  initAdmin();
  if (!((admin as any).apps && (admin as any).apps.length)) throw new Error('Firebase admin not initialized');
  const db = (admin as any).firestore();
  const colRef = db.collection('datasets').doc(clientId).collection('messages');
  const snap = await colRef.get();
  const docs = snap.docs.map((d: any) => ({ ...(d.data() as any), id: d.id }));
  // try to sort by createAt if present
  docs.sort((a: any, b: any) => {
    const A = a.createAt || '';
    const B = b.createAt || '';
    if (A < B) return -1;
    if (A > B) return 1;
    return 0;
  });
  return docs;
}
