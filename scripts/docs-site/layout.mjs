// Page chrome: header, product switcher, sidebar, article, outline, footer.
import { navigationTabs, normalizeNavRoute } from "./content.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function pageUrl(base, product, route) {
  return `${base}${product.id}/${route ? `${route}/` : ""}`;
}

function navList(entries, ctx, depth = 0) {
  const items = entries.map((entry) => {
    if (typeof entry === "string") {
      const route = normalizeNavRoute(entry);
      const page = ctx.byRoute.get(route);
      if (!page) return "";
      const current = route === ctx.current ? ' aria-current="page"' : "";
      return `<li><a href="${pageUrl(ctx.base, ctx.product, route)}"${current}>${esc(page.sidebarTitle || page.frontmatter.sidebarTitle || page.title)}</a></li>`;
    }
    const pages = entry.pages || [];
    const open = containsRoute(pages, ctx.current) || depth === 0 ? " open" : "";
    return `<li><details${open}><summary>${esc(entry.group)}</summary>${navList(pages, ctx, depth + 1)}</details></li>`;
  });
  return `<ul>${items.join("")}</ul>`;
}

function containsRoute(entries, route) {
  return entries.some((entry) => (typeof entry === "string" ? normalizeNavRoute(entry) === route : containsRoute(entry.pages || [], route)));
}

export function sidebarHtml(product, ctx) {
  const tabs = navigationTabs(product.config);
  return tabs
    .map((tab) => `<section class="nav-tab"><h2>${esc(tab.tab)}</h2>${(tab.groups || []).map((group) => `<div class="nav-group"><h3>${esc(group.group)}</h3>${navList(group.pages || [], ctx, 1)}</div>`).join("")}</section>`)
    .join("");
}

export function outlineHtml(outline) {
  if (outline.length < 2) return "";
  return `<nav class="outline" aria-label="On this page"><h2>On this page</h2><ul>${outline.map((h) => `<li class="l${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("")}</ul></nav>`;
}

export function releaseBadge(base, product, latest) {
  if (!latest) return "";
  const version = latest.page.route.slice("releases/".length);
  return `<a class="release-badge" href="${pageUrl(base, product, latest.page.route)}" title="Latest release">v${esc(version)}</a>`;
}

export function shell({ site, base, title, description, product, products, body, sidebar = "", outline = "", badge = "", mermaid = false, markdownUrl = "", pagefindFilter = "" }) {
  const productLinks = products
    .map((p) => `<a href="${base}${p.id}/"${product && p.id === product.id ? ' aria-current="true"' : ""}>${esc(p.name)}</a>`)
    .join("");
  const fullTitle = product && title !== product.name ? `${title} · ${product.name} docs` : title;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.description)}">
<meta name="color-scheme" content="light dark">
${markdownUrl ? `<link rel="alternate" type="text/markdown" href="${markdownUrl}">` : ""}
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="${base}assets/site.css">
<link rel="stylesheet" href="${base}pagefind/pagefind-ui.css">
<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<header class="top">
  <a class="brand" href="${base}">Arc Forge Labs <span>Docs</span></a>
  <nav class="products" aria-label="Products">${productLinks}</nav>
  ${badge}
  <button class="search-open" type="button" aria-label="Search" data-search-open><span>Search</span><kbd>/</kbd></button>
  <button class="theme" type="button" aria-label="Change light or dark mode" data-theme-toggle></button>
  ${sidebar ? '<button class="menu" type="button" aria-label="Open menu" aria-expanded="false" data-menu-toggle><span></span></button>' : ""}
</header>
<div class="search-panel" hidden data-search-panel><div class="search-box" data-search-box></div></div>
<div class="frame${sidebar ? "" : " no-sidebar"}">
  ${sidebar ? `<aside class="sidebar" data-sidebar>${sidebar}</aside>` : ""}
  <main id="content" data-pagefind-body${pagefindFilter ? ` data-pagefind-filter="product:${esc(pagefindFilter)}"` : ""}>${body}</main>
  ${outline ? `<aside class="toc">${outline}</aside>` : ""}
</div>
<footer class="foot"><span>Arc Forge Labs</span><a href="https://github.com/arcforgelabs">GitHub</a></footer>
<script src="${base}pagefind/pagefind-ui.js"></script>
<script src="${base}assets/site.js" data-base="${base}"></script>
${mermaid ? `<script src="${base}assets/mermaid.min.js"></script><script>(function(){var t=document.documentElement.dataset.theme;var dark=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;mermaid.initialize({startOnLoad:true,theme:dark?"dark":"neutral"});})();</script>` : ""}
</body>
</html>
`;
}
