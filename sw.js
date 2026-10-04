/* Viral Studio V4.90 — service worker de limpeza.
   Não intercepta navegação nem requisições para evitar redirects no Safari/iOS. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
    await self.clients.claim();
  })());
});
