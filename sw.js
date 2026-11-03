/* OviAssist : service worker
   1. Mises à jour : la page est toujours demandée au site d'abord (réseau
      d'abord), la copie gardée ne sert que sans connexion.
   2. Hors connexion : l'application et ses icônes restent utilisables.
   3. Notifications : reçoit et affiche les rappels envoyés par le serveur. */
var CACHE = 'oviassist-app-v1';
var COQUILLE = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'badge-96.png'];
var EXTERNES = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(COQUILLE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('oviassist-app-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.cache === 'no-store') return;   // vérification de version : toujours le réseau
  var url = new URL(req.url);

  // Page de l'application : réseau d'abord (version la plus récente), copie si hors connexion
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (rep) {
      if (rep && rep.ok) { var copie = rep.clone(); caches.open(CACHE).then(function (c) { c.put('./', copie); }); }
      return rep;
    }).catch(function () {
      return caches.match('./').then(function (r) { return r || caches.match(req); });
    }));
    return;
  }
  // Fichiers du site (manifeste, icônes) : copie immédiate, mise à jour en arrière-plan
  if (url.origin === self.location.origin && /\/(manifest\.webmanifest|icon-192\.png|icon-512\.png|badge-96\.png)$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (enCache) {
        var reseau = fetch(req).then(function (rep) { if (rep && rep.ok) c.put(req, rep.clone()); return rep; }).catch(function () { return enCache; });
        return enCache || reseau;
      });
    }));
    return;
  }
  // Polices et graphiques : gardés pour fonctionner hors connexion
  if (EXTERNES.test(req.url)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (enCache) {
        return enCache || fetch(req).then(function (rep) { if (rep && (rep.ok || rep.type === 'opaque')) c.put(req, rep.clone()); return rep; });
      });
    }));
  }
  // Tout le reste (météo, serveur de notifications) : réseau, jamais mis en cache
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  var titre = d.title || 'OviAssist';
  e.waitUntil(self.registration.showNotification(titre, {
    body: d.body || 'Vous avez un rappel.',
    icon: 'icon-192.png',
    badge: 'badge-96.png',
    tag: d.tag || 'ovi-rappel',
    renotify: true,
    lang: 'fr',
    vibrate: [120, 60, 120],
    data: { page: d.page || 'rappels' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var page = (e.notification.data && e.notification.data.page) || 'rappels';
  var cible = new URL('./?page=' + encodeURIComponent(page), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenetres) {
    for (var i = 0; i < fenetres.length; i++) {
      var f = fenetres[i];
      if (f.url.indexOf(self.registration.scope) === 0 && 'focus' in f) {
        f.postMessage({ type: 'ovi-page', page: page });
        return f.focus();
      }
    }
    return self.clients.openWindow(cible);
  }));
});
