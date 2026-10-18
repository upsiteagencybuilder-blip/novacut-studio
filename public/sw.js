/* NovaCut Studio service worker — offline-first shell */
const CACHE = 'novacut-v4'
const IS_DEV_HOST = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'
const PRECACHE = IS_DEV_HOST
  ? ['/manifest.webmanifest']
  : [
      '/',
      '/manifest.webmanifest',
      '/logo.svg',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/maskable-512.png',
      '/icons/apple-touch-icon.png',
      '/icons/favicon-64.png',
      '/samples/demo-1.jpg',
      '/samples/demo-2.jpg',
      '/samples/demo-3.jpg',
    ]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/* allow the page to activate a waiting worker (update flow) */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ activated: true })
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // static assets: cache-first — ONLY in production, where /_next/static URLs
  // are content-hashed and immutable. In dev, Turbopack reuses un-hashed URLs,
  // so caching them would serve stale code after every edit.
  if (
    !IS_DEV_HOST &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static') ||
      url.pathname.startsWith('/icons') ||
      url.pathname.startsWith('/samples') ||
      url.pathname === '/logo.svg' ||
      url.pathname === '/manifest.webmanifest')
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined)
            return res
          })
      )
    )
    return
  }

  // fonts: stale-while-revalidate
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            cache.put(req, res.clone()).catch(() => undefined)
            return res
          })
          .catch(() => hit)
        return hit || network
      })
    )
    return
  }

  // everything else: network-first with cache fallback (offline shell)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && (req.headers.get('accept') || '').includes('text/html')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined)
          }
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    )
  }
})
