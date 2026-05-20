// ============================================================
//  TimeFlies — firebase.js
//  Inicializa Firebase y expone window.DB sincronizado
// ============================================================
import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot }
                                   from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyBT1rJ8B63yQBVyRnPt_sMX25wASWDvs5I",
  authDomain:        "timeflies-f52f2.firebaseapp.com",
  projectId:         "timeflies-f52f2",
  storageBucket:     "timeflies-f52f2.firebasestorage.app",
  messagingSenderId: "216410671672",
  appId:             "1:216410671672:web:6f92e5e316fc6178df34cd"
};

const firebaseApp = initializeApp(firebaseConfig);
const firestore   = getFirestore(firebaseApp);

// ── Cache en memoria (misma interfaz que localStorage) ────────
const cache = { users: [], clients: [], entries: [] };

window.DB = {
  get users()   { return cache.users;   },
  get clients() { return cache.clients; },
  get entries() { return cache.entries; },
  save(key, val) {
    cache[key] = val;
    setDoc(doc(firestore, 'tf_data', key), { items: val })
      .catch(e => console.error('Firestore write error:', e));
  }
};

// ── Mostrar pantalla de carga hasta tener los datos ───────────
function showLoading(visible) {
  const el = document.getElementById('loading-screen');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

// ── Esperar DOM + datos antes de iniciar la app ───────────────
let domReady  = false;
let loadedCount = 0;
const COLLECTIONS = ['users', 'clients', 'entries'];

document.addEventListener('DOMContentLoaded', () => {
  domReady = true;
  tryStart();
});

function tryStart() {
  if (domReady && loadedCount >= COLLECTIONS.length && window.startApp) {
    showLoading(false);
    window.startApp();
  }
}

// ── Listeners en tiempo real ──────────────────────────────────
COLLECTIONS.forEach(key => {
  onSnapshot(doc(firestore, 'tf_data', key), snap => {
    const prev = JSON.stringify(cache[key]);
    cache[key] = snap.exists() ? (snap.data().items || []) : [];

    if (loadedCount < COLLECTIONS.length) {
      loadedCount++;
      tryStart();
    } else if (JSON.stringify(cache[key]) !== prev) {
      // Dato actualizado desde otro dispositivo → re-renderizar
      if (window.onFirebaseUpdate) window.onFirebaseUpdate(key);
    }
  }, err => {
    console.error('Firestore listener error:', err);
    // Fallback: iniciar igual aunque falle la conexión
    if (loadedCount < COLLECTIONS.length) {
      loadedCount++;
      tryStart();
    }
  });
});
