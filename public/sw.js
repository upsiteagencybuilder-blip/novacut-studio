/* NovaCut Studio service worker — offline-first shell.
   Day 59 (full offline mode): the immutable PUBLIC assets (icons, logo, demo
   samples, manifest) are precached on EVERY host — they are static files, not
   build output, so dev caching cannot go stale. Code chunks stay host-gated:
   /_next/static is content-hashed and cache-first in PRODUCTION only, because
   dev Turbopack URLs are un-hashed and caching them would serve stale code.
   The page can query the cache via a GET_CACHE_STATUS message. */
const CACHE = 'novacut-v5'
const IS_DEV_HOST = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'
/* immutable public files — identical on every host */
const PUBLIC_ASSETS = [
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
const PRECACHE = IS_DEV_HOST ? PUBLIC_ASSETS : ['/', ...PUBLIC_ASSETS]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // addAll fails the whole batch on one 404 — precache piecewise instead
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))
      )
      .then(() => self.skipWaiting())
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

/* allow the page to activate a waiting worker (update flow) + query cache status */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ activated: true })
  }
  if (event.data && event.data.type === 'GET_CACHE_STATUS' && event.ports && event.ports[0]) {
    event.waitUntil(
      caches.open(CACHE).then(async (cache) => {
        const keys = await cache.keys()
        event.ports[0].postMessage({
          cache: CACHE,
          controlled: !!self.registration.active,
          entries: keys.length,
          urls: keys.slice(0, 30).map((r) => new URL(r.url).pathname),
        })
      })
    )
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // static assets: cache-first — /_next/static ONLY in production, where URLs
  // are content-hashed and immutable. In dev, Turbopack reuses un-hashed URLs,
  // so caching them would serve stale code after every edit. The PUBLIC_ASSETS
  // set is host-agnostic (already precached) and keeps its cache-first path.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static') ||
      url.pathname.startsWith('/icons') ||
      url.pathname.startsWith('/samples') ||
      url.pathname === '/logo.svg' ||
      url.pathname === '/manifest.webmanifest') &&
    (!url.pathname.startsWith('/_next/static') || !IS_DEV_HOST)
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
