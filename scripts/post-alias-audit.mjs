#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const postsDir = path.join(ROOT, 'posts');

if (!fs.existsSync(postsDir)) {
  console.error('posts directory not found');
  process.exit(1);
}

const dirs = fs
  .readdirSync(postsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const failures = [];
const numbers = [];

for (const dir of dirs) {
  const m = dir.match(/^sample-post-(\d{3})$/);
  if (!m) {
    failures.push(`Invalid post alias format: ${dir}`);
    continue;
  }
  numbers.push(Number(m[1]));

  const postHtmlPath = path.join(postsDir, dir, 'index.html');
  if (!fs.existsSync(postHtmlPath)) {
    failures.push(`Missing index.html for ${dir}`);
    continue;
  }

  const html = fs.readFileSync(postHtmlPath, 'utf8');
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ?? '';
  const expectedCanonicalPath = `/posts/${dir}/`;

  if (!canonical.includes(expectedCanonicalPath)) {
    failures.push(`Canonical mismatch for ${dir}: expected path ${expectedCanonicalPath}`);
  }

  const heading = html.match(/<h1>([^<]+)<\/h1>/i)?.[1]?.trim();
  if (!heading) failures.push(`Missing <h1> in posts/${dir}/index.html`);
}

if (numbers.length) {
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  for (let i = min; i <= max; i += 1) {
    if (!numbers.includes(i)) {
      failures.push(`Missing post alias sample-post-${String(i).padStart(3, '0')}`);
    }
  }
}

const listPage = path.join(ROOT, 'list', 'index.html');
if (fs.existsSync(listPage)) {
  const listHtml = fs.readFileSync(listPage, 'utf8');
  for (const dir of dirs) {
    const expectedRef = `../posts/${dir}/`;
    if (!listHtml.includes(expectedRef)) {
      failures.push(`list/index.html missing link to ${expectedRef}`);
    }
  }
}

if (failures.length) {
  console.error('Post alias audit failed:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`post-alias-audit: OK (${dirs.length} post aliases verified)`);
