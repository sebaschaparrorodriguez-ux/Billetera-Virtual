// Cuentas y sincronización con Firebase (Authentication + Cloud Firestore).
// Se comunica con js/app.js a través de window.Billetera (app → nube: window.Nube).
//
// Estructura en Firestore:
//   usuarios/{uid}                    → { ajustes, actualizado }
//   usuarios/{uid}/movimientos/{id}   → un documento por movimiento
//
// Firestore guarda una copia en el dispositivo: sin señal se puede seguir registrando
// y los cambios se suben solos cuando vuelve la conexión.
import { firebaseConfig } from './firebase-config.js';

const VERSION_FIREBASE = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${VERSION_FIREBASE}`;
// Un lote de Firestore admite hasta 500 operaciones.
const TAMANO_LOTE = 400;

const Nube = { disponible: false, conectada: false };
window.Nube = Nube;

async function iniciarNube() {
  if (!firebaseConfig) {
    window.Billetera.nubeLista();
    return;
  }

  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const autenticacion = auth.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch (e) {
    // Navegadores sin IndexedDB (p. ej. algunos modos privados): funciona, pero sin copia offline.
    console.warn('Firestore sin caché persistente', e);
    db = fs.getFirestore(app);
  }

  const refPerfil = (uid) => fs.doc(db, 'usuarios', uid);
  const refMovimientos = (uid) => fs.collection(db, 'usuarios', uid, 'movimientos');
  const uidActual = () => {
    const uid = autenticacion.currentUser?.uid;
    if (!uid) throw new Error('No hay sesión iniciada');
    return uid;
  };

  Object.assign(Nube, {
    disponible: true,

    async registrar(correo, clave) {
      await auth.createUserWithEmailAndPassword(autenticacion, correo, clave);
    },

    async entrar(correo, clave) {
      await auth.signInWithEmailAndPassword(autenticacion, correo, clave);
    },

    salir: () => auth.signOut(autenticacion),

    recuperar: (correo) => auth.sendPasswordResetEmail(autenticacion, correo),

    // No se espera la confirmación del servidor: sin señal, la promesa queda pendiente
    // hasta que vuelva la conexión, pero el cambio ya quedó guardado en el dispositivo.
    guardarMovimientos(poner, quitar) {
      const uid = uidActual();
      const operaciones = [
        ...poner.map((m) => (lote) => lote.set(fs.doc(refMovimientos(uid), m.id), m)),
        ...quitar.map((id) => (lote) => lote.delete(fs.doc(refMovimientos(uid), id))),
      ];
      const envios = [];
      for (let i = 0; i < operaciones.length; i += TAMANO_LOTE) {
        const lote = fs.writeBatch(db);
        operaciones.slice(i, i + TAMANO_LOTE).forEach((op) => op(lote));
        envios.push(lote.commit());
      }
      return Promise.all(envios);
    },

    guardarAjustes(ajustes) {
      return fs.setDoc(refPerfil(uidActual()), {
        ajustes,
        actualizado: fs.serverTimestamp(),
      }, { merge: true });
    },
  });

  let cancelarEscuchas = [];
  const errorEscucha = (e) => {
    console.error('Error escuchando la nube', e);
  };

  auth.onAuthStateChanged(autenticacion, (usuario) => {
    cancelarEscuchas.forEach((cancelar) => cancelar());
    cancelarEscuchas = [];

    if (!usuario) {
      Nube.conectada = false;
      window.Billetera.alCerrarSesion();
      window.Billetera.nubeLista();
      return;
    }

    Nube.conectada = true;
    const ajustesIniciales = window.Billetera.alIniciarSesion({
      uid: usuario.uid,
      correo: usuario.email || '',
    });

    cancelarEscuchas.push(fs.onSnapshot(refPerfil(usuario.uid), (snap) => {
      if (snap.exists()) {
        const datos = snap.data();
        if (datos.ajustes) window.Billetera.recibirAjustes(datos.ajustes);
      } else if (!snap.metadata.fromCache) {
        // Cuenta nueva: se crea el perfil con los ajustes que ya tenía el dispositivo.
        Nube.guardarAjustes(ajustesIniciales).catch(errorEscucha);
      }
    }, errorEscucha));

    cancelarEscuchas.push(fs.onSnapshot(
      refMovimientos(usuario.uid),
      { includeMetadataChanges: true },
      (snap) => {
        window.Billetera.recibirMovimientos(
          snap.docs.map((d) => d.data()),
          { pendiente: snap.metadata.hasPendingWrites },
        );
      },
      errorEscucha,
    ));
  });

  window.Billetera.nubeLista();
}

iniciarNube().catch((e) => {
  console.warn('No se pudo cargar la nube; la app sigue funcionando en este dispositivo', e);
  Nube.disponible = false;
  window.Billetera?.nubeLista();
});
