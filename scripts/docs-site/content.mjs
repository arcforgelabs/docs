// Reads one product's mirrored docs tree: pages, routes, navigation and
// releases. Adapted from openclaw/docs scripts/docs-site (MIT).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// Mirror output never carries these; the sync script drops them too.
export const ignoredDocDirs = new Set(["review", ".i18n", "node_modules"]);
export const ignoredDocFiles = new Set(["AGENTS.md", "CLAUDE.md"]);

export function walkDocs(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDocDirs.has(entry.name)) continue;
      out.push(...walkDocs(full, base));
    } else if (!ignoredDocFiles.has(entry.name)) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

// docs/DATA_MODEL.md -> data-model; docs/releases/index.md -> releases
export function routeForFile(rel) {
  let route = rel.replace(/\.(md|mdx)$/i, "");
  route = route
    .split("/")
    .map((part) => part.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-"))
    .join("/");
  if (route === "index") return "";
  return route.replace(/\/index$/, "");
}

export function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  let data = {};
  try {
    data = YAML.parse(match[1]) || {};
  } catch {
    data = {};
  }
  return { data, body: source.slice(match[0].length) };
}

export function firstHeading(body) {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : "";
}

export function titleize(route) {
  const last = route.split("/").pop() || "Home";
  return last.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// YYYY.M.N with an optional -beta.N or correction -C suffix (the products'
// release.mjs tags). A beta sorts below its stable, a correction above it.
export function parseVersion(name) {
  const match = /^v?(\d{4})\.(\d{1,2})\.(\d+)(?:-beta\.(\d+)|-(\d+))?$/.exec(name);
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    beta: match[4] === undefined ? null : Number(match[4]),
    correction: match[5] === undefined ? 0 : Number(match[5]),
  };
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
  if (a.beta !== b.beta) {
    if (a.beta === null) return 1;
    if (b.beta === null) return -1;
    return a.beta - b.beta;
  }
  return (a.correction ?? 0) - (b.correction ?? 0);
}

export function loadProduct(docsRoot, product) {
  const dir = path.join(docsRoot, product.id);
  const files = fs.existsSync(dir) ? walkDocs(dir) : [];
  const pages = [];
  const assets = [];
  for (const rel of files) {
    if (/\.(md|mdx)$/i.test(rel)) {
      const source = fs.readFileSync(path.join(dir, rel), "utf8");
      const { data, body } = parseFrontmatter(source);
      const route = routeForFile(rel);
      pages.push({
        product: product.id,
        file: rel,
        route,
        title: String(data.title || firstHeading(body) || titleize(route)),
        summary: data.summary ? String(data.summary) : "",
        description: data.description ? String(data.description) : "",
        frontmatter: data,
        source,
        body,
      });
    } else if (rel !== "docs.json") {
      assets.push(rel);
    }
  }
  const configPath = path.join(dir, "docs.json");
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
  const syncPath = path.join(docsRoot, "..", ".arcforge-sync", `${product.id}.json`);
  const sync = fs.existsSync(syncPath) ? JSON.parse(fs.readFileSync(syncPath, "utf8")) : {};
  return { ...product, dir, pages, assets, config, sync, releases: releasesFor(pages) };
}

// Release pages: docs/releases/<version>.md. The badge follows the highest
// stable page that is not hidden, draft or unreleased (openclaw/docs rule).
export function releasesFor(pages) {
  return pages
    .filter((page) => page.route.startsWith("releases/"))
    .map((page) => ({ page, version: parseVersion(page.route.slice("releases/".length)) }))
    .filter(({ version, page }) => version && !page.frontmatter.hidden && !page.frontmatter.draft && !page.frontmatter.unreleased)
    .sort((a, b) => compareVersions(b.version, a.version));
}

export function latestStable(releases) {
  return releases.find(({ version }) => version.beta === null) || null;
}

// The releases index lists every release page, newest first, where its
// source has this marker. The highest stable release is marked latest.
export const RELEASE_LIST_MARKER = "<!-- docs-releases:list -->";

export function releaseList(releases) {
  const latest = latestStable(releases);
  return releases
    .map((release) => {
      const version = release.page.route.slice("releases/".length);
      const file = release.page.file.slice("releases/".length);
      const summary = release.page.summary ? ` - ${release.page.summary}` : "";
      return `- [v${version}](${file})${release === latest ? " (latest)" : ""}${summary}`;
    })
    .join("\n");
}

// The page with the marker replaced by the list. Other pages stay as they are.
export function withReleaseList(page, releases) {
  if (page.route !== "releases" || !page.body.includes(RELEASE_LIST_MARKER)) return page;
  const list = releases.length ? releaseList(releases) : "No release yet.";
  return { ...page, body: page.body.replace(RELEASE_LIST_MARKER, list), source: page.source.replace(RELEASE_LIST_MARKER, list) };
}

// docs.json navigation: { tabs: [{ tab, groups: [{ group, pages: [route | group] }] }] }.
// OpenClaw nests the same shape under navigation.languages[].
export function navigationTabs(config) {
  const nav = config.navigation || {};
  if (Array.isArray(nav.tabs)) return nav.tabs;
  if (Array.isArray(nav.languages)) return (nav.languages.find((l) => l.language === "en") || nav.languages[0] || {}).tabs || [];
  if (Array.isArray(nav.groups)) return [{ tab: "Docs", groups: nav.groups }];
  return [];
}

export function flattenNav(entries, out = []) {
  for (const entry of entries || []) {
    if (typeof entry === "string") out.push(entry);
    else if (entry && Array.isArray(entry.pages)) flattenNav(entry.pages, out);
    else if (entry && Array.isArray(entry.groups)) flattenNav(entry.groups, out);
  }
  return out;
}

export function navRoutes(config) {
  return navigationTabs(config).flatMap((tab) => flattenNav(tab.groups)).map(normalizeNavRoute);
}

export function normalizeNavRoute(route) {
  const clean = String(route).replace(/^\/+|\/+$/g, "");
  return clean === "index" ? "" : clean.replace(/\/index$/, "");
}

// Every page docs.json names must exist; the sync script runs the same check
// in the source repo before it publishes.
export function missingNavPages(product) {
  const routes = new Set(product.pages.map((page) => page.route));
  return navRoutes(product.config).filter((route) => !routes.has(route));
}
