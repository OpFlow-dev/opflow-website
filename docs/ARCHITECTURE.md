# Architecture

## Overview

This project is a static website with pre-rendered HTML pages and shared assets.

Core characteristics:

- No runtime framework dependency.
- Relative path linking between pages.
- Shared style and behavior through `assets/style.css` and `assets/main.js`.

## Content Topology

- `index.html`: landing page with recent posts.
- `list/index.html`: full post index.
- `categories/index.html`: category views and anchors.
- `tags/index.html`: tag views and anchors.
- `about/index.html`: profile/contact page.
- `posts/sample-post-*/index.html`: individual post pages.

## Shared UI Contracts

- Every page includes a top button with `id="top-btn"`.
- Every page includes metadata tags (`title`, `meta title`, `description`, canonical).
- Canonical URLs target `https://opflow.cc` (port may vary by environment).

## QA Layer

- `scripts/check-links.mjs`: local link and asset integrity.
- `scripts/check-top-btn.mjs`: top-button wiring and page-level presence.
- `scripts/check-metadata.mjs`: SEO/metadata baseline checks.
- `scripts/post-alias-audit.mjs`: post alias consistency and index references.
