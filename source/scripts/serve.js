// Minimal static dev server for the Authenticator PWA.
// Serves the repo root with correct MIME types (wasm included) so the app,
// service worker, and otp.wasm all load over http://localhost:8080.

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 8080;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/" || urlPath === "/index.html") {
      urlPath = "/index.html";
    }
    const file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found: " + urlPath);
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Service-Worker-Allowed": "/",
      });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`Authenticator PWA dev server: http://localhost:${port}`);
  });
