import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, query, where, getDocFromServer, getDocsFromServer,
  runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

// The SDK is vendored. Disabled builds never initialize it or contact Firebase.
window.FirebaseAdapter = function(config) {
  const app = initializeApp(config, 'sortie-training');
  // Same persistence order/keys as getAuth, without its unused mobile popup
  // resolver or third-party script injection. Google uses our top-level flow.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
  const db = getFirestore(app);
  const identity = user => user ? { uid: user.uid, email: String(user.email || '').trim().toLowerCase(), verified: user.emailVerified } : null;
  const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const access = async uid => {
    const snap = await getDocFromServer(doc(db, 'access', uid));
    const membership = snap.exists() ? snap.data() : null;
    if (membership?.role === 'instructor' && membership.active === true) {
      const policy = await getDocFromServer(doc(db, 'security', 'instructor'));
      if (!policy.exists() || policy.data().uid !== uid) throw Error('INSTRUCTOR_REQUIRED');
    }
    return membership;
  };
  return {
    restore: async () => { await auth.authStateReady(); return identity(auth.currentUser); },
    onUser: fn => onAuthStateChanged(auth, user => fn(identity(user))),
    signIn: async token => identity((await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user),
    signOut: () => signOut(auth),
    access,
    async put(uid, item, base) {
      if (auth.currentUser?.uid !== uid) throw Error('ACCOUNT_MISMATCH');
      // Hash IDs support old imported record IDs, including slashes and Unicode.
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.id));
      const id = [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
      const current = doc(db, 'cadets', uid, 'flights', id);
      const revision = doc(current, 'revisions', item.digest);
      return runTransaction(db, async tx => {
        const [old, saved] = await Promise.all([tx.get(current), tx.get(revision)]);
        const value = { payload: item.payload, digest: item.digest, receivedAt: serverTimestamp() };
        if (!saved.exists()) tx.set(revision, value);
        if (old.exists() && old.data().digest === item.digest) return { conflict: false };
        if (old.exists() && old.data().digest !== base) return { conflict: true };
        if (!old.exists() && base) return { conflict: true };
        tx.set(current, value);
        return { conflict: false };
      });
    },
    complete: uid => updateDoc(doc(db, 'cadets', uid), { lastSyncAt: serverTimestamp() }),
    roster: async uid => rows(await getDocsFromServer(query(collection(db, 'cadets'), where('instructorId', '==', uid)))),
    flights: async uid => rows(await getDocsFromServer(collection(db, 'cadets', uid, 'flights'))),
    revisions: async (uid, id) => rows(await getDocsFromServer(collection(db, 'cadets', uid, 'flights', id, 'revisions')))
  };
};
