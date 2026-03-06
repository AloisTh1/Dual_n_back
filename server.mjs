import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetDir = process.argv[2] || "web";
const webRoot = path.resolve(__dirname, targetDir);
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function resolvePath(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0];
  const requested = clean === "/" ? "/index.html" : clean;
  const normalized = path.normalize(requested).replace(/^([.][.][\\/])+/, "");
  return path.join(webRoot, normalized);
}

createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || "/");
    if (!filePath.startsWith(webRoot)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`Serving ${targetDir} at http://localhost:${port}`);
});
