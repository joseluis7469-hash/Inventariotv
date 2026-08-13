// firebase-config.js
// Usando Firebase v9/v10 Compat Libraries

const firebaseConfig = {
  apiKey: "AIzaSyAwUErYNP2epUjvDFUIpa07qRggLjBhBMg",
  authDomain: "tv-manager-z30y9.firebaseapp.com",
  projectId: "tv-manager-z30y9",
  storageBucket: "tv-manager-z30y9.firebasestorage.app",
  messagingSenderId: "708018006363",
  appId: "1:708018006363:web:c5c74539f1b24fef6fd27e"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Inicializar Servicios
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// Estado de autenticación
window.currentUser = null;
window.userPermissions = [];
window._authReady = false;

auth.onAuthStateChanged(async (user) => {
  if (user) {
    let doc = await db.collection('usuarios').doc(user.uid).get();
    if (!doc.exists) {
      // Crear documento de usuario por defecto si no existe (evita bucle de redirección)
      const defaultUserData = {
        name: user.displayName || user.email || 'Usuario',
        email: user.email,
        role: 'consulta',
        status: 'active',
        permissions: ['dashboard', 'inventario', 'movimientos', 'historial', 'nuevo_tv', 'editar_tv', 'asignar_tv'],
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await db.collection('usuarios').doc(user.uid).set(defaultUserData);
      doc = await db.collection('usuarios').doc(user.uid).get();
    }
    if (doc.exists && doc.data().status === 'active') {
      window.currentUser = { uid: user.uid, ...doc.data() };
      window.userPermissions = doc.data().permissions || [];
      // Sincronizar permisos según rol
      syncUserPermissions(user.uid);
    } else if (doc.exists && doc.data().status === 'inactive') {
      window.currentUser = null;
      // No redirigir para evitar bucle - mostrar mensaje de error
      const loader = document.getElementById('app-loader');
      if (loader) {
        loader.innerHTML = '<div style="text-align:center; color: #ff6b6b;"><h2 style="margin-bottom: 1rem;">⚠️ Cuenta Desactivada</h2><p>Tu cuenta ha sido desactivada. Contacta al administrador.</p><br><button onclick="firebase.auth().signOut(); window.location.href=\'users.html\';" style="padding:10px 20px; background:#ff4d6d; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Cerrar Sesión</button></div>';
      }
      return;
    } else {
      window.currentUser = null;
      return;
    }
  } else {
    window.currentUser = null;
    window.location.replace('users.html');
    return;
  }
  if (!window._authReady) {
    window._authReady = true;
    updateSidebarUser();
    checkAppReady();
  }
});

function updateSidebarUser() {
  const u = window.currentUser;
  if (!u) return;
  const initials = (u.name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  // Sidebar
  const infoBar = document.getElementById('userInfoBar');
  if (infoBar) infoBar.style.display = '';
  const avatar = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userDisplayRole');
  if (avatar) avatar.textContent = initials;
  if (nameEl) nameEl.textContent = u.name || u.email;
  if (roleEl) {
    const roleNames = { admin: '🛡️ Administrador', jefe_area: '🔧 Jefe de Área', tecnico: '🧑‍🔧 Técnico', recepcion: '🖥️ Recepción', consulta: '👁️ Consulta' };
    roleEl.textContent = roleNames[u.role] || u.role;
  }
  // Topbar
  const topbar = document.getElementById('topbarUser');
  if (topbar) topbar.style.display = 'flex';
  const tbAvatar = document.getElementById('topbarAvatar');
  const tbName = document.getElementById('topbarName');
  if (tbAvatar) tbAvatar.textContent = initials;
  if (tbName) tbName.textContent = u.name || u.email;
}

function hasPermission(perm) {
  return window.userPermissions.includes(perm);
}

// Todos los permisos disponibles por rol
const ROLE_ALL_PERMISSIONS = {
  admin: ['dashboard', 'inventario', 'movimientos', 'historial', 'nuevo_tv', 'editar_tv', 'eliminar_tv', 'gestionar_usuarios', 'asignar_tv', 'cambiar_serial', 'eliminar_movimiento', 'eliminar_fisico_tv', 'eliminar_fisico_movimiento', 'eliminar_fisico_acta', 'eliminar_base_datos'],
  jefe_area: ['dashboard', 'inventario', 'movimientos', 'historial', 'nuevo_tv', 'editar_tv', 'eliminar_tv', 'gestionar_usuarios', 'asignar_tv', 'cambiar_serial', 'eliminar_movimiento'],
  tecnico: ['dashboard', 'inventario', 'movimientos', 'historial', 'nuevo_tv', 'editar_tv', 'asignar_tv', 'eliminar_movimiento'],
  recepcion: ['dashboard', 'inventario', 'movimientos', 'historial', 'asignar_tv'],
  consulta: ['dashboard', 'inventario', 'historial']
};

// Asegurar que el usuario tenga los permisos correctos según su rol
async function syncUserPermissions(userUid) {
  try {
    const doc = await db.collection('usuarios').doc(userUid).get();
    if (doc.exists) {
      const role = doc.data().role;
      const expectedPerms = ROLE_ALL_PERMISSIONS[role] || [];
      const currentPerms = doc.data().permissions || [];
      const missing = expectedPerms.filter(p => !currentPerms.includes(p));
      const extra = currentPerms.filter(p => !expectedPerms.includes(p));
      if (missing.length > 0 || extra.length > 0) {
        await db.collection('usuarios').doc(userUid).update({ permissions: expectedPerms });
        window.userPermissions = expectedPerms;
      }
    }
  } catch (e) {
    console.warn('Error syncing user permissions:', e);
  }
}

// Estructura de estado en memoria
window.appData = {
  tvs: [],
  movimientos: [],
  metadata: {
    marcas: [],
    ubicaciones: [],
    areas: []
  }
};

// Variable para saber cuándo los datos iniciales han cargado
let tvsLoaded = false;
let movsLoaded = false;
let metadataLoaded = false;

function checkAppReady() {
  if (!window._authReady) return;
  if (tvsLoaded && movsLoaded && metadataLoaded) {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => loader.style.display = 'none', 300);
    }
    // Renderizar página activa inicial
    const activePage = document.querySelector('.nav-item.active');
    if (activePage) {
      showPage(activePage.dataset.page);
    } else {
      showPage('dashboard');
    }
  }
}

// Función para manejar errores de permisos
function handleSnapshotError(error) {
  console.error("Error en Firebase:", error);
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.innerHTML = `
      <div style="text-align:center; color: #ff6b6b; max-width: 400px;">
        <h2 style="margin-bottom: 1rem;">⚠️ Acceso Denegado</h2>
        <p style="margin-bottom: 1rem;">No tienes permisos para leer la base de datos de Firebase.</p>
        <p style="font-size: 0.85rem; color: #ccc;">Por favor, ve a la <strong>Consola de Firebase &gt; Firestore Database &gt; Reglas</strong> y cambialas a modo de prueba temporalmente:<br><br>
        <code style="background: rgba(0,0,0,0.3); padding: 5px; display:block; text-align:left;">allow read, write: if true;</code></p>
      </div>
    `;
  }
}

// Configurar Listeners en tiempo real
db.collection('tvs').onSnapshot(snapshot => {
  window.appData.tvs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (!tvsLoaded) {
    tvsLoaded = true;
    checkAppReady();
  } else {
    // Si ya cargó, actualizar vista actual
    const actPage = document.querySelector('.nav-item.active');
    if (actPage) showPage(actPage.dataset.page);
  }
}, handleSnapshotError);

db.collection('movimientos').onSnapshot(snapshot => {
  window.appData.movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (!movsLoaded) {
    movsLoaded = true;
    checkAppReady();
  } else {
    const actPage = document.querySelector('.nav-item.active');
    if (actPage) showPage(actPage.dataset.page);
  }
}, handleSnapshotError);

db.collection('config').doc('metadata').onSnapshot(snapshot => {
  if (snapshot.exists) {
    window.appData.metadata = snapshot.data();
  } else {
    // Inicializar documento vacío
    db.collection('config').doc('metadata').set({
      marcas: [],
      ubicaciones: [],
      areas: []
    }).catch(handleSnapshotError);
  }
  if (!metadataLoaded) {
    metadataLoaded = true;
    checkAppReady();
  } else {
    const actPage = document.querySelector('.nav-item.active');
    if (actPage) showPage(actPage.dataset.page);
  }
}, handleSnapshotError);

// Función auxiliar de una sola vez para subir datos del localStorage a Firebase
async function migrateLocalStorageToFirebase() {
  const localTVs = JSON.parse(localStorage.getItem('hpa_tvs') || '[]');
  const localMovs = JSON.parse(localStorage.getItem('hpa_movimientos') || '[]');
  const localMarcas = JSON.parse(localStorage.getItem('hpa_marcas') || '[]');
  const localUbicaciones = JSON.parse(localStorage.getItem('hpa_ubicaciones') || '[]');
  const localAreas = JSON.parse(localStorage.getItem('hpa_areas') || '[]');

  if (localTVs.length === 0 && localMovs.length === 0) return;

  const confirmMsg = `Se encontraron ${localTVs.length} TVs y ${localMovs.length} movimientos en tu navegador.\n¿Deseas migrar estos datos a la base de datos de Firebase ahora?\n\n(Aviso: Esto podría duplicar datos si ya lo hiciste antes)`;
  
  if (confirm(confirmMsg)) {
    try {
      // Subir Metadata
      await db.collection('config').doc('metadata').set({
        marcas: localMarcas,
        ubicaciones: localUbicaciones,
        areas: localAreas
      }, { merge: true });

      // Subir TVs
      const batchTVs = db.batch();
      localTVs.forEach(tv => {
        const docRef = db.collection('tvs').doc(tv.id);
        batchTVs.set(docRef, tv);
      });
      await batchTVs.commit();

      // Subir Movs (en lotes si son muchos, Firestore permite 500 ops por lote)
      const batches = [];
      let currentBatch = db.batch();
      let count = 0;
      localMovs.forEach(mov => {
        const docRef = db.collection('movimientos').doc(mov.id);
        currentBatch.set(docRef, mov);
        count++;
        if (count === 500) {
          batches.push(currentBatch.commit());
          currentBatch = db.batch();
          count = 0;
        }
      });
      if (count > 0) batches.push(currentBatch.commit());
      await Promise.all(batches);

      alert('Migración completada con éxito.');
      localStorage.removeItem('hpa_tvs');
      localStorage.removeItem('hpa_movimientos');
    } catch (err) {
      console.error(err);
      alert('Error al migrar los datos: ' + err.message);
    }
  }
}

// Para ejecutar manualmente desde la consola: window.migrateLocalStorageToFirebase();
window.migrateLocalStorageToFirebase = migrateLocalStorageToFirebase;

// Función para borrar todos los datos de Firebase
async function deleteAllFirebaseData() {
  if (!confirm('Se eliminarán TODOS los datos de Firestore e imágenes de actas.\n\n¿Estás seguro? Esta acción es irreversible.')) return;

  const log = (msg) => { console.log('[DELETE] ' + msg); };
  const errLog = (msg) => { console.error('[DELETE] ' + msg); };

  try {
    log('Iniciando borrado...');

    // 1. Borrar colección tvs (doc por doc)
    const tvsSnap = await db.collection('tvs').get();
    log(`Encontrados ${tvsSnap.size} TVs`);
    for (const doc of tvsSnap.docs) {
      await doc.ref.delete();
    }
    log('TVs borrados');

    // 2. Borrar colección movimientos (doc por doc)
    const movsSnap = await db.collection('movimientos').get();
    log(`Encontrados ${movsSnap.size} movimientos`);
    for (const doc of movsSnap.docs) {
      await doc.ref.delete();
    }
    log('Movimientos borrados');

    // 3. Borrar colección config
    const configSnap = await db.collection('config').get();
    for (const doc of configSnap.docs) {
      await doc.ref.delete();
    }
    log('Config borrada');

    // 4. Borrar imágenes de actas en Storage
    try {
      const actasRef = storage.ref('actas');
      const listResult = await actasRef.listAll();
      log(`Encontradas ${listResult.items.length} imágenes`);
      for (const item of listResult.items) {
        await item.delete();
      }
      log('Imágenes borradas');
    } catch (e) {
      log('Sin imágenes en Storage: ' + e.message);
    }

    log('BORRADO COMPLETO');
    alert('Todos los datos fueron eliminados correctamente.');
  } catch (err) {
    errLog('Error: ' + err.message);
    alert('Error al borrar: ' + err.message);
  }
}
window.deleteAllFirebaseData = deleteAllFirebaseData;
