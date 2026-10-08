/*
  sw.js – "service worker": permette di installare l'app e di aprirla anche senza connessione.
  Strategia: prima prova la rete (così si vedono subito le modifiche), se non c'è usa la copia salvata.
*/
// Nome della memoria dell'app: cambiandolo (per esempio con la data) i dispositivi buttano la copia vecchia
// e scaricano tutto da capo. Tenerlo uguale a "versioneApp" in js/config.js.
const CACHE = 'orario-dada-2026-10-09.2';
const FILE_APP = [
  './', 'index.html', 'manuale.html', 'css/app.css', 'css/brief.css', 'css/campanella.css', 'css/barra.css', 'css/smart.css', 'css/piantine.css', 'css/menu.css', 'css/avviso-per-te.css', 'css/calendario.css', 'manifest.webmanifest',
  'js/config.js', 'js/tema.js', 'js/dati.js', 'js/accesso.js', 'js/ruoli.js', 'js/nomi.js', 'js/autorizzazioni.js', 'js/supplenze.js', 'js/compresenze.js', 'js/piantine.js', 'js/viste.js', 'js/brief.js', 'js/smart.js', 'js/piano-attivita.js', 'js/impegni-drive.js', 'js/calendario.js', '../sostituzioni/js/docx.js', 'js/xlsx.js', 'js/quaranta-ore.js', 'js/storico-sostituzioni.js', '../sostituzioni/js/foglio.js', 'js/ingresso.js', 'js/intervallo.js', 'js/modifiche.js', 'js/storie.js', 'js/campanella.js', 'js/installa.js', 'js/condividi.js', 'js/avviso-per-te.js', 'js/pubblica-drive.js', 'js/pubblica-sostituzioni.js', 'js/app.js',
  'icone/icona.svg', 'icone/favicon.svg', 'icone/icona-192.png', 'icone/apple-touch-icon.png', 'icone/qr-app.svg',
  '../dati/orario.json', '../dati/campanella.json'
];

// Alla prima installazione salva i file dell'app
self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE_APP)).then(() => self.skipWaiting()));
});
// Quando la versione nuova prende il posto di quella vecchia: si cancellano le memorie vecchie
// e si prendono subito in carico le pagine aperte (che poi si ricaricano da sole, vedi app.js)
self.addEventListener('activate', evento => evento.waitUntil(
  caches.keys()
    .then(nomi => Promise.all(nomi.filter(n => n.startsWith('orario-dada') && n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', evento => {
  const richiesta = evento.request;
  // Solo file del nostro sito (non Google, non altri siti)
  if (richiesta.method !== 'GET' || new URL(richiesta.url).origin !== location.origin) return;
  evento.respondWith(
    // cache: 'no-cache' = chiede sempre al sito se il file è cambiato, invece di usare
    // la copia che il browser tiene per 10 minuti (così le modifiche si vedono subito)
    fetch(richiesta, { cache: 'no-cache' })
      .then(risposta => {
        if (risposta.ok) {
          const copia = risposta.clone();
          caches.open(CACHE).then(c => c.put(richiesta, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(richiesta, { ignoreSearch: true }))
  );
});

// Tocco sulla notifica "Orario cambiato" (vedi modifiche.js): porta in primo piano l'app, o la apre
self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  evento.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(finestre => {
    const app = finestre.find(f => f.url.includes('/app/'));
    // l'app aperta mostra subito le modifiche in stile storie (vedi storie.js)
    if (app) return app.focus().then(f => (f || app).postMessage({ tipo: 'apriStorie' }));
    return self.clients.openWindow('./?storie');
  }));
});
