# opflow-website

Static website structure clone for engineering practice and delivery workflow hardening.

## Purpose and Constraints

- Purpose: maintain a static site that mirrors information architecture and interaction behavior for testing and deployment rehearsal.
- Constraint: this repository is **structure clone only**. Do not copy proprietary or copyrighted source content from external sites.
- Constraint: keep visible site content stable unless a change request explicitly asks for content updates.

## Directory Tree

```text
.
├── about/
├── admin/
│   ├── public/
│   └── server.mjs
├── assets/
│   ├── hero.svg
│   ├── main.js
│   └── style.css
├── categories/
├── content/
│   └── posts/*.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   └── RELEASE.md
├── list/
├── posts/
│   ├── sample-post-001/
│   ├── ...
│   └── sample-post-148/
├── scripts/
│   ├── build-site.mjs
│   ├── migrate-html-to-md.mjs
│   ├── site-lib.mjs
│   ├── check-links.mjs
│   ├── check-metadata.mjs
│   ├── check-top-btn.mjs
│   └── post-alias-audit.mjs
├── tags/
├── CONTRIBUTING.md
├── index.html
└── package.json
```

## Quick Start

Requirements:

- Node.js 18+
- Python 3 (for static server)

Install:

```bash
npm install
```

Generate markdown content and rebuild static pages:

```bash
npm run content:migrate
npm run build:site
```

Serve locally:

```bash
npm run serve
```

Or run on a random free port:

```bash
npm run serve:random
```

## QA Commands

```bash
npm run check:links
npm run check:top-btn
npm run check:metadata
npm run check:post-alias
npm run qa
```

## Admin Backend

Run the admin backend:

```bash
ADMIN_PASSWORD=change-me-now ADMIN_PORT=59051 npm run admin
```

Then open `http://127.0.0.1:59051/admin`.

Admin API/UI behavior:

- Uses `content/posts/*.md` as source of truth.
- Create/edit/delete operations rewrite markdown and rebuild static pages.
- Manual rebuild is available from the UI and `POST /admin/api/rebuild`.

Security note:

- Change `ADMIN_PASSWORD` before exposing the service anywhere.

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`.

- Triggers on `push` and `pull_request` to `main` and `master`.
- Uses `actions/checkout@v4` and `actions/setup-node@v4` with Node.js `22`.
- Installs dependencies with `npm ci --no-audit --no-fund` and runs `npm run qa`.

## Deployment Notes (opflow.cc)

Recommended rollout sequence:

1. Deploy and validate on a random high port first (for example `58050`) to avoid impacting live traffic.
2. Run QA checks and manual smoke tests against that port.
3. Migrate serving to port `80` only after validation passes.
4. Keep rollback path simple (previous build + previous port mapping).

Detailed process is documented in `docs/DEPLOYMENT.md`.
