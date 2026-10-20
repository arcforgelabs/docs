// Renders the mirrored docs trees in docs/<product>/ into dist/docs-site.
// Run `npm run docs:build`. DOCS_SITE_BASE sets the URL prefix (GitHub Pages
// serves this repo at /docs/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withReleaseList, loadProduct, latestStable, navRoutes, missingNavPages } from "./content.mjs";
import { createRenderer, renderPage } from "./markdown.mjs";
import { shell, sidebarHtml, outlineHtml, releaseBadge, pageUrl, esc } from "./layout.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export function normalizeBase(value) {
  let base = value || "/";
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return base;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function redirectHtml(target) {
  return `<!doctype html><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0; url=${esc(target)}"><link rel="canonical" href="${esc(target)}"><a href="${esc(target)}">${esc(target)}</a>\n`;
}

export function build({ root = repoRoot, out = path.join(root, "dist/docs-site"), base = normalizeBase(process.env.DOCS_SITE_BASE) } = {}) {
  const site = JSON.parse(fs.readFileSync(path.join(root, "site.config.json"), "utf8"));
  const docsRoot = path.join(root, "docs");
  const products = site.products.map((p) => loadProduct(docsRoot, p));
  const problems = [];
  for (const product of products) {
    for (const route of missingNavPages(product)) problems.push(`${product.id}: docs.json names missing page "${route}"`);
  }
  if (problems.length) throw new Error(problems.join("\n"));

  fs.rmSync(out, { recursive: true, force: true });
  const md = createRenderer();
  const report = { pages: [], links: [] };

  for (const product of products) {
    const byRoute = new Map(product.pages.map((page) => [page.route, page]));
    const order = navRoutes(product.config).filter((route) => byRoute.has(route));
    const latest = latestStable(product.releases);
    const badge = releaseBadge(base, product, latest);
    const pageFiles = new Set(product.pages.map((page) => page.file));
    const assets = new Set();
    const llms = [`# ${product.config.name || product.name}`, "", product.config.description || "", ""];

    for (const listed of product.pages) {
      const page = withReleaseList(listed, product.releases);
      const rendered = renderPage(md, page, { product, base, pageFiles });
      rendered.assets.forEach((a) => assets.add(a));
      const index = order.indexOf(page.route);
      const prev = index > 0 ? byRoute.get(order[index - 1]) : null;
      const next = index >= 0 && index < order.length - 1 ? byRoute.get(order[index + 1]) : null;
      const sourcePath = `docs/${page.file}`;
      const editUrl = `https://github.com/${product.repository}/edit/${product.branch || "main"}/${sourcePath}`;
      const mdUrl = `${pageUrl(base, product, page.route).replace(/\/$/, "")}.md`;
      const crumb = page.route ? `<div class="crumbs" data-pagefind-ignore><a href="${base}${product.id}/">${esc(product.name)}</a></div>` : "";
      const lede = page.summary || page.description;
      const pager = prev || next
        ? `<nav class="pager" data-pagefind-ignore>${prev ? `<a class="prev" href="${pageUrl(base, product, prev.route)}"><small>Previous</small>${esc(prev.title)}</a>` : ""}${next ? `<a class="next" href="${pageUrl(base, product, next.route)}"><small>Next</small>${esc(next.title)}</a>` : ""}</nav>`
        : "";
      const syncLine = product.sync.sha ? `<span>Source <a href="https://github.com/${product.repository}/tree/${product.sync.sha}">${esc(product.sync.sha.slice(0, 7))}</a></span>` : "";
      const body = `<article>${crumb}<h1>${esc(page.title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ""}${rendered.html}${pager}<div class="page-foot" data-pagefind-ignore><a href="${editUrl}">Edit this page on GitHub</a><a href="${mdUrl}">Markdown</a>${syncLine}</div></article>`;
      const mobileProducts = `<nav class="mobile-products">${products.map((p) => `<a href="${base}${p.id}/">${esc(p.name)}</a>`).join("")}</nav>`;
      const html = shell({
        site,
        base,
        title: page.title,
        description: page.description || page.summary,
        product,
        products,
        body,
        sidebar: mobileProducts + sidebarHtml(product, { base, product, byRoute, current: page.route }),
        outline: outlineHtml(rendered.outline),
        badge,
        mermaid: rendered.hasMermaid,
        markdownUrl: mdUrl,
        pagefindFilter: product.name,
      });
      const dir = path.join(out, product.id, page.route);
      write(path.join(dir, "index.html"), html);
      write(path.join(out, product.id, page.route ? `${page.route}.md` : "index.md"), page.source);
      llms.push(`- [${page.title}](${mdUrl})${lede ? `: ${lede}` : ""}`);
      report.pages.push({ product: product.id, route: page.route, url: pageUrl(base, product, page.route) });
      for (const link of rendered.links) report.links.push({ from: pageUrl(base, product, page.route), ...link });
    }

    for (const asset of [...product.assets]) {
      const src = path.join(product.dir, asset);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(path.join(out, product.id, asset)), { recursive: true });
        fs.copyFileSync(src, path.join(out, product.id, asset));
      }
    }
    for (const asset of assets) {
      if (!product.assets.includes(asset)) problems.push(`${product.id}: missing asset ${asset}`);
    }
    for (const redirect of product.config.redirects || []) {
      const from = String(redirect.source).replace(/^\/+|\/+$/g, "");
      const to = String(redirect.destination).replace(/^\/+/, "");
      write(path.join(out, product.id, from, "index.html"), redirectHtml(`${base}${product.id}/${to}`));
    }
    write(path.join(out, product.id, "llms.txt"), `${llms.join("\n")}\n`);
  }
  if (problems.length) throw new Error(problems.join("\n"));

  // Home: one card per product, with its latest release.
  const cards = products
    .map((product) => {
      const latest = latestStable(product.releases);
      const version = latest ? `v${latest.page.route.slice("releases/".length)}` : "No release yet";
      return `<a class="card" href="${base}${product.id}/"><h2>${esc(product.config.name || product.name)}</h2><p>${esc(product.config.description || "")}</p><span class="meta">${esc(version)} · ${product.pages.length} pages</span></a>`;
    })
    .join("");
  const home = `<section class="hero"><h1>${esc(site.name)}</h1><p>${esc(site.description)}</p></section><div class="cards">${cards}</div>`;
  write(path.join(out, "index.html"), shell({ site, base, title: site.name, description: site.description, products, body: home }));
  write(
    path.join(out, "404.html"),
    shell({ site, base, title: "Page not found", products, body: `<section class="hero"><h1>Page not found</h1><p>The page moved or does not exist. <a href="${base}">Go to the docs home</a>.</p></section>` }),
  );
  write(path.join(out, "llms.txt"), `# ${site.name}\n\n${site.description}\n\n${products.map((p) => `- [${p.name}](${base}${p.id}/llms.txt)`).join("\n")}\n`);
  write(path.join(out, ".nojekyll"), "");

  const assetsOut = path.join(out, "assets");
  fs.mkdirSync(assetsOut, { recursive: true });
  for (const name of fs.readdirSync(path.join(here, "assets"))) fs.copyFileSync(path.join(here, "assets", name), path.join(assetsOut, name));
  const mermaid = path.join(root, "node_modules/mermaid/dist/mermaid.min.js");
  if (fs.existsSync(mermaid)) fs.copyFileSync(mermaid, path.join(assetsOut, "mermaid.min.js"));
  write(path.join(root, "dist/docs-site-report.json"), JSON.stringify({ base, ...report }, null, 2));
  return { base, products: products.map((p) => ({ id: p.id, pages: p.pages.length })), out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = build();
  console.log(`Built ${result.products.map((p) => `${p.id} (${p.pages} pages)`).join(", ")} at ${result.base} -> ${path.relative(process.cwd(), result.out)}`);
}
