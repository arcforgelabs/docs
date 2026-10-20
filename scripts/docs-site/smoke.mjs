// Checks the built site: every page, every internal link and anchor, and the
// Pagefind search bundle. Run after `npm run docs:build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

export function smoke({ out = path.join(root, "dist/docs-site"), reportFile = path.join(root, "dist/docs-site-report.json") } = {}) {
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const base = report.base;
  const errors = [];
  const fileFor = (url) => {
    const rel = decodeURI(url.slice(base.length));
    if (!rel || rel.endsWith("/")) return path.join(out, rel, "index.html");
    return path.join(out, rel);
  };
  const idsCache = new Map();
  const idsIn = (file) => {
    if (!idsCache.has(file)) idsCache.set(file, new Set([...fs.readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    return idsCache.get(file);
  };

  for (const page of report.pages) {
    if (!fs.existsSync(fileFor(page.url))) errors.push(`missing page ${page.url}`);
  }
  for (const link of report.links) {
    const [url, hash] = link.href.split("#");
    if (link.external || !url.startsWith(base)) {
      if (!url && hash) {
        const file = fileFor(link.from);
        if (fs.existsSync(file) && !idsIn(file).has(decodeURIComponent(hash))) errors.push(`${link.from}: no heading #${hash}`);
      }
      continue;
    }
    const file = fileFor(url);
    if (!fs.existsSync(file)) {
      errors.push(`${link.from}: broken link ${link.href}`);
      continue;
    }
    if (hash && file.endsWith(".html") && !idsIn(file).has(decodeURIComponent(hash))) errors.push(`${link.from}: no heading #${hash} on ${url}`);
  }
  for (const required of ["index.html", "404.html", "llms.txt", "assets/site.css", "assets/site.js", "pagefind/pagefind-ui.js", "pagefind/pagefind-entry.json"]) {
    if (!fs.existsSync(path.join(out, required))) errors.push(`missing ${required}`);
  }
  const warnings = report.links.filter((l) => l.missing).map((l) => `${l.from}: links to a page the mirror does not carry (${l.href})`);
  return { errors, warnings, pages: report.pages.length, links: report.links.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = smoke();
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (result.errors.length) {
    for (const e of result.errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  console.log(`Smoke passed: ${result.pages} pages, ${result.links} links.`);
}
