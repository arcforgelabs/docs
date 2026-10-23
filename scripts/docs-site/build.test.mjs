import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { routeForFile, parseVersion, compareVersions, releasesFor, latestStable, navRoutes, releaseList } from "./content.mjs";
import { resolveLink } from "./markdown.mjs";
import { build, normalizeBase } from "./build.mjs";

test("routes follow file names, lower case with dashes", () => {
  assert.equal(routeForFile("DATA_MODEL.md"), "data-model");
  assert.equal(routeForFile("index.md"), "");
  assert.equal(routeForFile("releases/index.md"), "releases");
  assert.equal(routeForFile("concepts/surveyor.md"), "concepts/surveyor");
  assert.equal(routeForFile("releases/2026.10.32.md"), "releases/2026.10.32");
});

test("versions sort numerically, and a beta sorts below its stable", () => {
  const sorted = ["2026.10.9", "2026.10.32", "2026.10.32-beta.2", "2026.9.40"].map(parseVersion).sort(compareVersions);
  assert.deepEqual(sorted.map((v) => `${v.parts.join(".")}${v.beta === null ? "" : `-beta.${v.beta}`}`), ["2026.9.40", "2026.10.9", "2026.10.32-beta.2", "2026.10.32"]);
  assert.equal(parseVersion("index"), null);
});

test("a correction sorts above its stable release and becomes the latest", () => {
  const sorted = ["2026.10.32-1", "2026.10.32", "2026.10.33-beta.1", "2026.10.31"].map(parseVersion).sort(compareVersions);
  assert.deepEqual(sorted.map((v) => v.correction), [0, 0, 1, 0]);
  const page = (route) => ({ route, file: `${route}.md`, frontmatter: {} });
  const releases = releasesFor([page("releases/2026.10.32"), page("releases/2026.10.32-1"), page("releases/2026.10.33-beta.1")]);
  assert.equal(latestStable(releases).page.route, "releases/2026.10.32-1");
});

test("the release list is newest first, with the highest stable marked latest", () => {
  const page = (route, summary = "") => ({ route, file: `${route}.md`, summary, frontmatter: {} });
  const releases = releasesFor([page("releases/2026.10.9"), page("releases/2026.10.40-beta.1"), page("releases/2026.10.32", "Faster invoices.")]);
  assert.equal(releaseList(releases), ["- [v2026.10.40-beta.1](2026.10.40-beta.1.md)", "- [v2026.10.32](2026.10.32.md) (latest) - Faster invoices.", "- [v2026.10.9](2026.10.9.md)"].join("\n"));
});

test("the badge follows the highest stable page that is not hidden", () => {
  const page = (route, frontmatter = {}) => ({ route, frontmatter });
  const releases = releasesFor([page("releases"), page("releases/2026.10.33", { draft: true }), page("releases/2026.10.32"), page("releases/2026.10.40-beta.1"), page("releases/2026.10.9")]);
  assert.equal(latestStable(releases).page.route, "releases/2026.10.32");
});

test("links resolve to routes, assets, or GitHub", () => {
  const ctx = { file: "concepts/surveyor.md", product: { id: "field", repository: "arcforgelabs/field", branch: "main" }, base: "/docs/", pageFiles: new Set(["XERO.md", "concepts/surveyor.md"]) };
  assert.equal(resolveLink("../XERO.md#settings", ctx).href, "/docs/field/xero/#settings");
  assert.equal(resolveLink("../../server/index.js", ctx).href, "https://github.com/arcforgelabs/field/blob/main/server/index.js");
  assert.equal(resolveLink("img/a.png", ctx).href, "/docs/field/concepts/img/a.png");
  assert.equal(resolveLink("https://example.com", ctx).href, "https://example.com");
  assert.equal(resolveLink("#top", ctx).href, "#top");
  assert.equal(resolveLink("../GONE.md", ctx).missing, true);
});

test("navigation reads tabs, and OpenClaw's language-nested tabs", () => {
  const groups = [{ group: "A", pages: ["index", { group: "B", pages: ["b/index", "c"] }] }];
  assert.deepEqual(navRoutes({ navigation: { tabs: [{ tab: "T", groups }] } }), ["", "b", "c"]);
  assert.deepEqual(navRoutes({ navigation: { languages: [{ language: "en", tabs: [{ tab: "T", groups }] }] } }), ["", "b", "c"]);
});

test("base path is always wrapped in slashes", () => {
  assert.equal(normalizeBase(undefined), "/");
  assert.equal(normalizeBase("docs"), "/docs/");
  assert.equal(normalizeBase("/docs/"), "/docs/");
});

test("a build renders pages, markdown copies, redirects and the home page", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-site-"));
  fs.writeFileSync(path.join(root, "site.config.json"), JSON.stringify({ name: "Docs", description: "d", products: [{ id: "app", name: "App", repository: "o/app" }] }));
  const docs = path.join(root, "docs/app");
  fs.mkdirSync(path.join(docs, "releases"), { recursive: true });
  fs.writeFileSync(path.join(docs, "docs.json"), JSON.stringify({ name: "App", redirects: [{ source: "/old", destination: "/guide" }], navigation: { tabs: [{ tab: "T", groups: [{ group: "G", pages: ["index", "guide"] }] }] } }));
  fs.writeFileSync(path.join(docs, "index.md"), "# Home\n\nSee [the guide](GUIDE.md#use-it).\n");
  fs.writeFileSync(path.join(docs, "GUIDE.md"), "---\ntitle: Guide\n---\n# Guide\n\n## Use it\n\nText.\n");
  fs.writeFileSync(path.join(docs, "releases/2026.10.1.md"), "---\nsummary: First notes.\n---\n# v2026.10.1\n");
  fs.writeFileSync(path.join(docs, "releases/index.md"), "# Release notes\n\n## Releases\n\n<!-- docs-releases:list -->\n");
  const out = path.join(root, "dist/docs-site");
  build({ root, out, base: "/docs/" });
  const guide = fs.readFileSync(path.join(out, "app/guide/index.html"), "utf8");
  assert.match(guide, /<h1>Guide<\/h1>/);
  assert.match(guide, /id="use-it"/);
  assert.match(guide, /href="\/docs\/app\/releases\/2026.10.1\/"[^>]*>v2026.10.1/);
  assert.match(fs.readFileSync(path.join(out, "app/index.html"), "utf8"), /href="\/docs\/app\/guide\/#use-it"/);
  assert.ok(fs.existsSync(path.join(out, "app/guide.md")));
  assert.match(fs.readFileSync(path.join(out, "app/old/index.html"), "utf8"), /url=\/docs\/app\/guide/);
  assert.match(fs.readFileSync(path.join(out, "index.html"), "utf8"), /v2026.10.1 · 4 pages/);
  const list = fs.readFileSync(path.join(out, "app/releases/index.html"), "utf8");
  assert.match(list, /<a href="\/docs\/app\/releases\/2026.10.1\/">v2026.10.1<\/a> \(latest\) - First notes./);
  assert.match(fs.readFileSync(path.join(out, "app/releases.md"), "utf8"), /- \[v2026.10.1\]\(2026.10.1.md\) \(latest\) - First notes./);
});

test("a build fails when docs.json names a missing page", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-site-"));
  fs.writeFileSync(path.join(root, "site.config.json"), JSON.stringify({ name: "Docs", products: [{ id: "app", name: "App", repository: "o/app" }] }));
  fs.mkdirSync(path.join(root, "docs/app"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/app/docs.json"), JSON.stringify({ navigation: { tabs: [{ tab: "T", groups: [{ group: "G", pages: ["nope"] }] }] } }));
  assert.throws(() => build({ root, out: path.join(root, "dist") }), /missing page "nope"/);
});
