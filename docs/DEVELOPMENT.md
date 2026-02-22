# Development

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3

## Local Setup

```bash
npm install
npm run build:site
npm run serve
```

Note: generated HTML (`index.html`, `about/`, `list/`, `categories/`, `tags/`, `posts/*`) is build output and is gitignored by design.

Only when importing legacy HTML post bodies:

```bash
npm run content:migrate
npm run content:normalize
npm run build:site
```

Default serve port in `package.json` is `58050` to mirror current canonical examples.

To use a random free port:

```bash
npm run serve:random
```

## QA Workflow

Run all checks before commit:

```bash
npm run qa
```

Or run checks one-by-one while iterating:

```bash
npm run check:links
npm run check:top-btn
npm run check:metadata
npm run check:post-alias
npm run check:markdown-source
```

## Admin Workflow

Start admin backend:

```bash
ADMIN_PASSWORD=change-me-now ADMIN_HOST=127.0.0.1 ADMIN_PORT=59051 npm run admin
```

Open `http://127.0.0.1:59051/admin`, then:

- Login with `ADMIN_PASSWORD`.
- Create/update/delete markdown posts.
- Set each post status as `published` or `draft` in the editor.
- Use the markdown toolbar for H2/bold/italic/code/link/quote/list/code-block snippets.
- Use toolbar `Upload Image` to select a local image and auto-insert markdown (`![alt](/assets/uploads/...)`) at cursor.
- Use `Rebuild` to regenerate static pages on demand.
- Use `分类管理` in the left panel to create/delete categories.
- Editor `分类` field is dropdown-only and is sourced from backend categories API.

All admin write operations trigger static regeneration automatically.

Category persistence:

- Registry file: `content/categories.json`.
- On server startup, the registry file is auto-created if missing, and categories from existing posts are merged in.
- Deleting a category with posts supports reassignment (`reassignTo`), defaulting to `未分类`.

Status semantics:

- `published`: included in generated `posts/<slug>/index.html`, home/list/categories/tags, and numeric alias checks.
- `draft`: stored in markdown but excluded from generated public pages.
- Missing `status` in old markdown is treated as `published` for backward compatibility.

## Markdown Authoring Rules

- Post body must be Markdown only; do not embed raw HTML tags for structure.
- Use fenced code blocks (```), Markdown headings/lists/blockquote/links instead of `<pre><code>`, `<h2>`, `<ul>` etc.
- Post body is rendered in the browser by `assets/post-renderer.js`; generated post HTML contains only metadata shell + markdown source pointer.
- Run `npm run check:markdown-source` before commit.

## Change Safety Rules

- Do not alter visible site content unless requested.
- Prefer additive infrastructure/docs changes.
- Keep scripts dependency-free when possible.
