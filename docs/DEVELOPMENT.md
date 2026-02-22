# Development

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3

## Local Setup

```bash
npm install
npm run content:migrate
npm run build:site
npm run serve
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
```

## Admin Workflow

Start admin backend:

```bash
ADMIN_PASSWORD=change-me-now ADMIN_HOST=127.0.0.1 ADMIN_PORT=59051 npm run admin
```

Open `http://127.0.0.1:59051/admin`, then:

- Login with `ADMIN_PASSWORD`.
- Create/update/delete markdown posts.
- Use `Rebuild` to regenerate static pages on demand.

All admin write operations trigger static regeneration automatically.

## Change Safety Rules

- Do not alter visible site content unless requested.
- Prefer additive infrastructure/docs changes.
- Keep scripts dependency-free when possible.
