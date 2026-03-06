import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "web");
const distDir = path.join(root, "dist");

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function buildBundle(gameLogicSrc, appSrc) {
  const logic = stripBom(gameLogicSrc)
    .replace(/export\s+const\s+/g, "const ")
    .replace(/export\s+function\s+/g, "function ")
    .trim();

  const app = stripBom(appSrc)
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/gameLogic\.js["'];?\s*/m, "")
    .trim();

  return `${logic}\n\n${app}\n`;
}

function buildHtml(indexHtmlSrc) {
  return stripBom(indexHtmlSrc).replace("./react-app.js", "./app.bundle.js");
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const [indexHtml, stylesCss, gameLogic, reactApp] = await Promise.all([
  readFile(path.join(webDir, "index.html"), "utf8"),
  readFile(path.join(webDir, "styles.css"), "utf8"),
  readFile(path.join(webDir, "gameLogic.js"), "utf8"),
  readFile(path.join(webDir, "react-app.js"), "utf8"),
]);

const htmlOut = buildHtml(indexHtml);
const bundleOut = buildBundle(gameLogic, reactApp);

await Promise.all([
  writeFile(path.join(distDir, "index.html"), htmlOut, "utf8"),
  writeFile(path.join(distDir, "app.bundle.js"), bundleOut, "utf8"),
  writeFile(path.join(distDir, "styles.css"), stylesCss, "utf8"),
]);

await copyFile(path.join(distDir, "index.html"), path.join(distDir, "404.html"));

console.log("Built static site in dist/");
