# opflow-website

Static website structure clone for engineering practice and delivery workflow hardening.

## Purpose and Constraints

- Purpose: maintain a static site that mirrors information architecture and interaction behavior for testing and deployment rehearsal.
- Constraint: this repository is **structure clone only**. Do not copy proprietary or copyrighted source content from external sites.
- Constraint: keep visible site content stable unless a change request explicitly asks for content updates.
- Mechanism: all post source content is Markdown-only (`content/posts/*.md`, local data, not versioned in Git); public HTML is generated from Markdown and should not be edited manually.

## Directory Tree

```text
.
├── admin/
│   ├── public/
│   └── server.mjs
├── assets/
│   ├── hero.svg
│   ├── main.js
│   ├── post-renderer.js
│   └── style.css
├── content/
│   └── posts/*.md            # local source of truth (gitignored)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   └── RELEASE.md
├── scripts/
│   ├── build-site.mjs
│   ├── migrate-html-to-md.mjs
│   ├── convert-posts-html-to-markdown.mjs
│   ├── site-lib.mjs
│   ├── check-links.mjs
│   ├── check-metadata.mjs
│   ├── check-top-btn.mjs
│   ├── check-markdown-source.mjs
│   └── post-alias-audit.mjs
├── CONTRIBUTING.md
└── package.json

# Generated at build time (gitignored)
# - index.html
# - about/ categories/ list/ tags/
# - posts/<slug>/index.html
```

## Quick Start

Requirements:

- Node.js 18+
- Python 3 (for static server)

Install:

```bash
npm install
```

Build static pages from markdown source:

```bash
npm run build:site
```

If you import legacy HTML content once, run:

```bash
npm run content:migrate
npm run content:normalize
```

Serve locally:

```bash
npm run serve
```

Or run on a random free port:

```bash
npm run serve:random
```

## Markdown-only Post Pipeline

- Edit posts only in `content/posts/*.md` (local data; not committed).
- Frontmatter fields: `slug`, `title`, `date`, `status`, `category`, `tags`, `summary`.
- `npm run build:site` generates page shells (`posts/*`, `index`, `list`, `categories`, `tags`).
- Post **正文 Markdown 在用户浏览器中渲染**（`assets/post-renderer.js` + `markdown-it`）。
- Post 页面代码块使用 `highlight.js` + GitHub 风格主题进行客户端语法高亮。
- 生成的 HTML 只是构建产物，默认 **不入库**（已在 `.gitignore` 中忽略）。
- `npm run check:markdown-source` ensures post bodies do not contain raw HTML tags.

## QA Commands

```bash
npm run check:links
npm run check:top-btn
npm run check:metadata
npm run check:post-alias
npm run check:markdown-source
npm run qa
```

## Admin Backend

Run the admin backend:

```bash
ADMIN_PASSWORD=change-me-now ADMIN_HOST=127.0.0.1 ADMIN_PORT=59051 npm run admin
```

Then open `http://127.0.0.1:59051/admin`.

Admin API/UI behavior:

- Uses `content/posts/*.md` as source of truth (Markdown-only body content, local-only data).
- Post frontmatter supports `status: "published" | "draft"`; missing status defaults to `published`.
- Static generation (`posts/*`, homepage/list/categories/tags, numeric aliases) includes only `published` posts.
- Create/edit/delete operations rewrite markdown and rebuild static pages.
- Admin editor includes a markdown toolbar and image upload button.
- Image upload endpoint: authenticated `POST /admin/api/upload-image` with multipart field `image`, returning `/assets/uploads/<filename>`.
- Category registry is persisted in `content/categories.json`; startup auto-merges categories found in existing markdown posts.
- Category management API (authenticated):
  - `GET /admin/api/categories` returns `{ categories: [{ name, count }] }`
  - `POST /admin/api/categories` with body `{ name }` creates a category
  - `DELETE /admin/api/categories/:name` with optional body `{ reassignTo }` migrates posts (default `未分类`) then deletes the category
- Admin supports API Token management (`/admin/api/agent-tokens`) for external agent write access:
  - `GET /admin/api/agent-tokens` list token metadata
  - `POST /admin/api/agent-tokens` with `{ name }` create token (plaintext shown once)
  - `DELETE /admin/api/agent-tokens/:id` revoke token

### External Agent API (`/api/v1`)

- Swagger 页面：`/api/docs`
- OpenAPI 文档：`/api/v1/openapi.json`

Read operations are public, write operations require token.

### Post Raw Mirrors (for machine fetch/citation)

For each published post page URL (`/posts/<slug>/`), machine-readable mirrors are available:

- Query mirror on same URL:
  - `/posts/<slug>/?format=raw` → markdown source
  - `/posts/<slug>/?format=json` → JSON payload
- Extension mirrors:
  - `/posts/<slug>.md` → markdown source
  - `/posts/<slug>.json` → JSON payload

- Read endpoints:
  - `GET /api/v1/health`
  - `GET /api/v1/posts?status=published|draft|all&includeContent=1&q=keyword`
  - `GET /api/v1/posts/:slug`
  - `GET /api/v1/categories?status=published|draft|all`
  - `GET /api/v1/tags?status=published|draft|all`
  - `GET /api/v1/taxonomy?status=published|draft|all`
- Write endpoints (Bearer token required):
  - `POST /api/v1/posts`
  - `PUT /api/v1/posts/:slug`
  - `DELETE /api/v1/posts/:slug`
  - `POST /api/v1/categories`
  - `DELETE /api/v1/categories/:name`
  - `POST /api/v1/tags/rename`
  - `DELETE /api/v1/tags/:name`

Token usage:

```bash
curl -X POST http://127.0.0.1:59051/api/v1/posts \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"demo-post","title":"Demo","date":"2026-02-24","status":"published","category":"github trend","tags":["demo"],"summary":"summary","content":"# hello"}'
```

Security note:

- Change `ADMIN_PASSWORD` before exposing the service anywhere.
- Never commit or share plaintext API tokens.

## Automated encrypted backup release

Script: `scripts/daily_release_backup.sh`

What it does:

- Creates a full-site snapshot (code + local data) from the project working tree
- Compresses it as `tar.gz`, then encrypts with AES-256 (`openssl`)
- Encrypts backup artifact with a daily-rotated password (distributed via private channel)
- Publishes/updates GitHub release tag `backup-YYYYMMDD` and uploads asset
- Deletes old `backup-*` releases older than 30 days (`--cleanup-tag`)

Manual run:

```bash
cd /home/ubuntu/.openclaw/workspace-liuyun/projects/opflow-website
./scripts/daily_release_backup.sh
```

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`.

- Triggers on `push` and `pull_request` to `main` and `master`.
- Uses `actions/checkout@v4` and `actions/setup-node@v4` with Node.js `22`.
- Installs dependencies with `npm install --no-package-lock --registry=https://registry.npmjs.org --no-audit --no-fund` and runs `npm run qa`.

## Deployment Notes (opflow.cc)

Recommended rollout sequence:

1. Deploy and validate on a random high port first (for example `58050`) to avoid impacting live traffic.
2. Run QA checks and manual smoke tests against that port.
3. Migrate serving to port `80` only after validation passes.
4. Keep rollback path simple (previous build + previous port mapping).

Detailed process is documented in `docs/DEPLOYMENT.md`.

Generated pages append a deterministic `?v=<timestamp-pair>` query to `assets/style.css` and `assets/main.js` for cache busting.
