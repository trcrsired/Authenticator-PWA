# Authenticator PWA

A Progressive Web App port of the Authenticator extension for TOTP/HOTP two-factor codes.

## Get it

- **PWA**: install directly from <https://authenticator-pwa.pages.dev> in any modern browser
- **PWA Store**: listed on [PWA Store](https://pwa-store-7x5.pages.dev)
- **Microsoft Store**: also available as a packaged app there

## Why a PWA?

Because it should have been one all along. Google's original Authenticator shipped as a browser extension — a format that doesn't work on mobile at all and renders poorly on platforms like Edge — which effectively forced users onto the mobile **app** for a task that is nothing more than a counter, a secret, and HMAC. There is no technical reason an authenticator needs to be a native app or a desktop-only extension; every capability it needs (crypto, storage, camera, offline operation) is available to a web page today.

I am a strong believer in PWAs: installable, offline-capable, cross-platform, no store gatekeeping, no forced app ecosystem. This project is that belief applied to an authenticator.

## Privacy

- **All data is stored offline in your browser's storage.** Your secrets never leave the device unless you explicitly export them yourself.
- **We do not collect any of your data.** No analytics, no telemetry, no accounts, no servers. There is nothing to send anything to.

## Features

- TOTP / HOTP code generation (WebAssembly, with a JS fallback)
- Manual account entry, QR image import, and live camera QR scanning
- Optional password encryption (Argon2id) and optional WebAuthn user verification (Face ID / fingerprint / screen lock) for app unlock and exports
- Import/export: file backups (plain or encrypted), one-line otpauth text, and `otpauth-migration://` QR transfer compatible with Google Authenticator
- Offline-first via service worker, installable as a PWA

## Development

```bash
cd source
npm ci
npm run build    # webpack + sass -> public/
npm run wasm     # rebuild wasm/otp.wasm from ../cpp/otp.cpp (needs clang)
npm run serve    # local dev server
```

Deployment: any static host works. For Cloudflare Pages, root directory `source`, build command `npm ci && npm run build`, output `public` — or deploy `source/` as-is, since built `css/`/`dist/` are committed.

## License

[GPLv3](LICENSE)
