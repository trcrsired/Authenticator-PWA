/* eslint-env serviceworker */
// Authenticator PWA service worker.
// Precaches the app shell and serves same-origin requests cache-first so the
// app works offline. Accounts live in localStorage — no data goes through here.

const VERSION = "v14";
const CORE_CACHE = `authenticator-core-${VERSION}`;
const RUNTIME_CACHE = `authenticator-runtime-${VERSION}`;

const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/css/popup.css",
  "/css/import.css",
  "/dist/popup.js",
  "/dist/import.js",
  "/dist/options.js",
  "/view/import",
  "/view/options",
  "/images/icon.webp",
  "/wasm/otp.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((err) => console.warn("Precache failed", err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CORE_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== location.origin) {
    return;
  }
  // Never cache the worker script itself — update checks must always
  // reach the network or a stale worker would never be replaced.
  if (url.pathname === "/sw.js") {
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(request, clone));
          }
          return response;
        })
    )
  );
});
