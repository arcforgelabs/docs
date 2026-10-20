# Arc Forge docs

Website renderer, search and publishing for the Arc Forge docs site:
https://arcforgelabs.github.io/docs/

Each product's docs are authored in its own repository, under `docs/`, and
synced here. This repository owns the renderer, design, search and hosting.
It copies the model of [openclaw/docs](https://github.com/openclaw/docs).

| Product | Source | Site path |
| --- | --- | --- |
| Flow | [arcforgelabs/flow](https://github.com/arcforgelabs/flow) `docs/` | `/docs/flow/` |
| Field | [arcforgelabs/field](https://github.com/arcforgelabs/field) `docs/` | `/docs/field/` |

## How it works

1. Docs are authored in each product repository, under `docs/`, with the
   navigation in `docs/docs.json`.
2. `<product>/.github/workflows/docs-sync-publish.yml` runs on each push to
   `main` that touches `docs/`. It checks `docs/docs.json` and mirrors the
   tree into `docs/<product>/` here, with the source commit in
   `.arcforge-sync/<product>.json`.
3. `.github/workflows/pages.yml` runs on that push. It tests the renderer,
   builds the site, checks every page and link, and deploys to GitHub Pages.

## Editing rules

- Change the renderer, design, search and hosting in this repository.
- Do not edit `docs/**` or `.arcforge-sync/**` here. They are mirror output;
  the next sync replaces them. Edit the product repository's `docs/` instead.
- Add a product: add it to `site.config.json`, then copy
  `scripts/docs-sync-publish.mjs` and `.github/workflows/docs-sync-publish.yml`
  into its repository.

## Source format

- `docs/docs.json`: `name`, `description`, `redirects` and
  `navigation.tabs[].groups[].pages[]`, the shape OpenClaw's `docs.json` uses.
  A group can nest groups.
- A page's route is its file path, lower case, with `_` as `-`:
  `docs/DATA_MODEL.md` is `/<product>/data-model/`, and `index.md` is its
  folder.
- Front matter `title`, `summary` and `description` are optional. Without a
  `title`, the first `#` heading is the title.
- Links between pages are plain relative Markdown links, as on GitHub. A link
  to a file outside `docs/` opens it on GitHub.
- ` ```mermaid ` blocks render as diagrams.
- Release pages are `docs/releases/<version>.md` (`YYYY.M.N`, betas
  `YYYY.M.N-beta.N`). The header badge and the home card follow the highest
  stable page that is not `hidden`, `draft` or `unreleased`.
- Every page also has a Markdown copy at `<route>.md`, and each product has
  `llms.txt`.

## Static site build

- `npm run docs:build` renders `docs/` into `dist/docs-site` and indexes it
  with Pagefind for search. `DOCS_SITE_BASE` sets the URL prefix; Pages sets
  it from its own `base_path`.
- `npm run docs:smoke` checks every page, internal link, heading anchor and
  the search bundle.
- `npm run docs:check` runs both.
- `npm run docs:serve` serves `dist/docs-site` at http://127.0.0.1:4173
  (build with the default base `/` first).

## Local checks

CI uses Node 24. Run `npm ci`, then `npm test` and `npm run docs:check`.

## Secrets

None here. Each product repository needs the `ARCFORGE_DOCS_SYNC_TOKEN`
secret to push the mirror: a fine-grained token with Contents read and write
on this repository only. Without it, the sync job skips.

## Licence

MIT (`LICENSE`). Parts of the renderer and the sync script are adapted from
openclaw/docs and openclaw/openclaw (MIT).
