# AGENTS.md

Website renderer, search and publishing for the Arc Forge docs site. Content
source: each product repository's `docs/` (see `README.md`).

## Rule

- Do not hand-edit mirror output: `docs/**` and `.arcforge-sync/**`.
- Fix the source in the product repository, or fix the renderer or workflow
  here, and let the sync regenerate.

## Editable here

- `scripts/docs-site/**`: renderer, design, search and checks.
- `site.config.json`: the product list.
- `.github/workflows/{pages,docs-code-ci}.yml`.
- `package.json`, `package-lock.json`, `README.md`, `AGENTS.md`.

## Checks

`npm test` and `npm run docs:check` before a pull request. For a screenshot,
build with `DOCS_SITE_BASE=/`, run `npm run docs:serve`, and name the
viewport.

This repository is public: no customer names or data in pages, commits,
issues or pull requests.
