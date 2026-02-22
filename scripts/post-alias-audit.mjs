#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ROOT = process.cwd();
const contentDir = path.join(ROOT, 'content', 'posts');
const postsDir = path.join(ROOT, 'posts');
const listPage = path.join(ROOT, 'list', 'index.html');

if (!fs.existsSync(contentDir)) {
  console.error('content/posts directory not found');
  process.exit(1);
}
if (!fs.existsSync(postsDir)) {
  console.error('posts directory not found');
  process.exit(1);
}

const mdFiles = fs
  .readdirSync(contentDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.md'))
  .map((d) => d.name)
  .sort();

const failures = [];
const seen = new Set();
const listHtml = fs.existsSync(listPage) ? fs.readFileSync(listPage, 'utf8') : '';

for (const file of mdFiles) {
  const markdownPath = path.join(contentDir, file);
  const parsed = matter(fs.readFileSync(markdownPath, 'utf8'));
  const slug = String(parsed.data?.slug ?? '').trim();

  if (!slug) {
    failures.push(`Missing slug in ${path.relative(ROOT, markdownPath)}`);
    continue;
  }
  if (seen.has(slug)) {
    failures.push(`Duplicate slug in content: ${slug}`);
    continue;
  }
  seen.add(slug);

  const postHtmlPath = path.join(postsDir, slug, 'index.html');
  if (!fs.existsSync(postHtmlPath)) {
    failures.push(`Missing output HTML for slug ${slug}`);
    continue;
  }

  const html = fs.readFileSync(postHtmlPath, 'utf8');
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ?? '';
  const expectedCanonicalPath = `/posts/${slug}/`;

  if (!canonical.includes(expectedCanonicalPath)) {
    failures.push(`Canonical mismatch for ${slug}: expected path ${expectedCanonicalPath}`);
  }

  const heading = html.match(/<h1>([^<]+)<\/h1>/i)?.[1]?.trim();
  if (!heading) failures.push(`Missing <h1> in posts/${slug}/index.html`);

  const expectedRef = `../posts/${slug}/`;
  if (listHtml && !listHtml.includes(expectedRef)) {
    failures.push(`list/index.html missing link to ${expectedRef}`);
  }

  const numeric = slug.match(/^sample-post-(\d{3})$/);
  if (numeric) {
    const n = Number(numeric[1]);
    const alias = `sample-post-${n}`;
    if (alias !== slug) {
      const aliasPath = path.join(postsDir, alias);
      if (!fs.existsSync(aliasPath)) {
        failures.push(`Missing numeric alias ${alias} -> ${slug}`);
      } else {
        const stat = fs.lstatSync(aliasPath);
        if (stat.isSymbolicLink()) {
          const target = fs.readlinkSync(aliasPath);
          if (target !== slug) {
            failures.push(`Alias ${alias} points to ${target}, expected ${slug}`);
          }
        }
      }
    }
  }
}

if (failures.length) {
  console.error('Post alias audit failed:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`post-alias-audit: OK (${mdFiles.length} markdown posts verified)`);
