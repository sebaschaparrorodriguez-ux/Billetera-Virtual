// Service worker: guarda la app en caché para que funcione sin internet.
const CACHE = 'billetera-virtual-v5';
const ARCHIVOS = [
  './',
  './index.html',
  './css/estilos.css',
  './js/app.js',
  './js/nube.js',
  './js/firebase-config.js',
  './manifest.webmanifest',
  './icon.svg',
];
// La tipografía (Google Fonts) y Firebase (gstatic) también se guardan para usarlas sin conexión.
const ORIGENES_EXTERNOS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Red primero (para recibir actualizaciones) y caché si no hay conexión.
self.addEventListener('fetch', (e) => {
  const origen = new URL(e.request.url).origin;
  if (e.request.method !== 'GET') return;
  if (origen !== location.origin && !ORIGENES_EXTERNOS.includes(origen)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
