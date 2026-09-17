// Static build for deployment (e.g. Cloudflare Pages):
//   webpack bundles -> dist/
//   sass -> css/
//   runtime assets copied -> public/
//
// Run with: node scripts/build.js  (or `npm run build`)

const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const sass = require("sass");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public");

function runWebpack() {
  const config = require(path.join(root, "webpack.config.js"));
  config.mode = "production";
  delete config.devtool;
  config.output = { ...config.output, clean: true };
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        return reject(err);
      }
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString({ errors: true })));
      }
      console.log(stats.toString({ colors: false, chunks: false }));
      resolve();
    });
  });
}

function compileSass() {
  fs.mkdirSync(path.join(root, "css"), { recursive: true });
  for (const name of ["popup", "import"]) {
    const result = sass.compile(path.join(root, "sass", `${name}.scss`), {
      loadPaths: [path.join(root, "sass")],
      // _ui.scss predates the module system; quiet Dart Sass 3.0 notices
      silenceDeprecations: ["import", "global-builtin"],
    });
    fs.writeFileSync(path.join(root, "css", `${name}.css`), result.css);
  }
  fs.copyFileSync(
    path.join(root, "sass", "DroidSansMono.woff2"),
    path.join(root, "css", "DroidSansMono.woff2")
  );
  console.log("sass: popup.css, import.css");
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

async function main() {
  await runWebpack();
  compileSass();

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const item of [
    "index.html",
    "manifest.webmanifest",
    "sw.js",
    "css",
    "dist",
    "view",
    "policy",
    "images",
    "_locales",
    "wasm",
  ]) {
    const from = path.join(root, item);
    if (!fs.existsSync(from)) {
      continue;
    }
    const to = path.join(outDir, item);
    if (fs.statSync(from).isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
  console.log("public/ assembled");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
