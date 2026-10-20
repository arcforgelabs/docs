// Markdown to HTML with source-relative link rewriting.
import path from "node:path";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import hljs from "highlight.js";
import { routeForFile } from "./content.mjs";

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Resolves a link written in docs/<file> the way GitHub would:
// - another page in docs/ -> its site route
// - a non-page file in docs/ -> the copied asset
// - anything outside docs/ -> the file on GitHub
export function resolveLink(href, { file, product, base, pageFiles }) {
  if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return { href };
  const [rawPath, hash = ""] = href.split("#");
  const suffix = hash ? `#${hash}` : "";
  if (!rawPath) return { href };
  let decoded = rawPath;
  try {
    decoded = decodeURI(rawPath);
  } catch {}
  const fromDocs = decoded.startsWith("/")
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded));
  const productBase = `${base}${product.id}/`;
  if (fromDocs.startsWith("../")) {
    const repoPath = path.posix.normalize(`docs/${fromDocs}`);
    return { href: `https://github.com/${product.repository}/blob/${product.branch || "main"}/${repoPath}${suffix}`, external: true };
  }
  if (/\.(md|mdx)$/i.test(fromDocs) || pageFiles.has(`${fromDocs}.md`)) {
    const target = /\.(md|mdx)$/i.test(fromDocs) ? fromDocs : `${fromDocs}.md`;
    if (pageFiles.has(target)) {
      const route = routeForFile(target);
      return { href: `${productBase}${route ? `${route}/` : ""}${suffix}`, route };
    }
    // A page the mirror does not carry: link to its source on GitHub.
    return { href: `https://github.com/${product.repository}/blob/${product.branch || "main"}/docs/${fromDocs}${suffix}`, external: true, missing: true };
  }
  return { href: `${productBase}${fromDocs}${suffix}`, asset: fromDocs };
}

export function createRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      if (lang === "mermaid") return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
      if (lang && hljs.getLanguage(lang)) {
        return `<pre class="code"><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      }
      return `<pre class="code"><code class="hljs">${escapeHtml(code)}</code></pre>`;
    },
  });
  md.use(anchor, {
    slugify,
    level: [2, 3, 4],
    permalink: anchor.permalink.linkInsideHeader({ symbol: "#", placement: "after", ariaHidden: true, class: "heading-anchor", renderAttrs: () => ({ "data-pagefind-ignore": "" }) }),
  });
  // Tables scroll on their own instead of widening the page.
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
  md.renderer.rules.table_close = () => "</table></div>";
  return md;
}

// Renders one page. Returns the HTML, its h2/h3 outline, and every link
// target so the build can copy assets and the smoke check can test them.
export function renderPage(md, page, ctx) {
  const env = { links: [], assets: [] };
  const rewrite = (tokens) => {
    for (const token of tokens) {
      if (token.children) rewrite(token.children);
      const attr = token.type === "link_open" ? "href" : token.type === "image" ? "src" : null;
      if (!attr) continue;
      const value = token.attrGet(attr);
      const resolved = resolveLink(value, { ...ctx, file: page.file });
      token.attrSet(attr, resolved.href);
      if (resolved.external && token.type === "link_open") token.attrSet("rel", "noopener");
      if (resolved.asset) env.assets.push(resolved.asset);
      env.links.push(resolved);
    }
  };
  // Drop the first H1; the layout prints the title.
  const body = page.body.replace(/^\s*#\s+.+\r?\n/, "");
  const tokens = md.parse(body, env);
  rewrite(tokens);
  const outline = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open" && (token.tag === "h2" || token.tag === "h3")) {
      const inline = tokens[i + 1];
      outline.push({ level: Number(token.tag[1]), id: token.attrGet("id"), text: inline.children.filter((c) => c.type === "text" || c.type === "code_inline").map((c) => c.content).join("") });
    }
  }
  // Raw HTML <img src> in Markdown gets the same rewrite.
  let html = md.renderer.render(tokens, md.options, env);
  html = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (all, pre, src, post) => {
    const resolved = resolveLink(src, { ...ctx, file: page.file });
    if (resolved.asset) env.assets.push(resolved.asset);
    return `${pre}${resolved.href}${post}`;
  });
  return { html, outline, links: env.links, assets: env.assets, hasMermaid: html.includes('class="mermaid"') };
}
