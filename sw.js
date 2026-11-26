/* Estúdio Andala · service worker
   - Abre offline: o app inteiro está num único index.html, guardado na instalação.
   - Páginas: rede primeiro (recebe atualizações), cache como reserva.
   - Fontes do Google: guardadas na primeira visita e reutilizadas offline.
   Para publicar uma versão nova, mude VERSION. */
const VERSION = 'andala-v21';
const SHELL = ['./', './index.html', './pecas.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const FONTS = 'andala-fonts-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes do Google: cache primeiro
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }).catch(() => hit)))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Página de limpeza: sempre direto da rede, nunca pelo cache
  if (url.pathname.endsWith('/reset.html')) return;

  // Navegação: rede primeiro (sem usar o cache do navegador), cache só como reserva.
  // Só a página principal é guardada como index.html.
  if (req.mode === 'navigate') {
    const principal = url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        if (res.ok && principal) { const cp = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', './pecas.js', cp)); }
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Restante (ícones, manifest): cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
