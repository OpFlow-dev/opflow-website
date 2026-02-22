#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const HTML_FILES = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.venv', 'qa-screenshots', 'ref-html', 'docs', 'scripts'].includes(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      HTML_FILES.push(path.join(dir, entry.name));
    }
  }
}

walk(ROOT);

function getTagContent(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

const failures = [];

for (const filePath of HTML_FILES) {
  const rel = path.relative(ROOT, filePath);
  const html = fs.readFileSync(filePath, 'utf8');

  if (!/^<!DOCTYPE html>/i.test(html)) failures.push(`${rel}: missing <!DOCTYPE html>`);
  if (!/<html\s+lang=["'][^"']+["']/i.test(html)) failures.push(`${rel}: missing html lang`);
  if (!/<meta\s+charset=["']utf-8["']/i.test(html)) failures.push(`${rel}: missing utf-8 charset`);
  if (!/<meta\s+name=["']viewport["']\s+content=["'][^"']+["']/i.test(html)) failures.push(`${rel}: missing viewport`);
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*["']/i.test(html)) failures.push(`${rel}: missing robots`);

  const title = getTagContent(html, /<title>([^<]+)<\/title>/i);
  const metaTitle = getTagContent(html, /<meta\s+name=["']title["']\s+content=["']([^"']*)["']/i);
  const metaDesc = getTagContent(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const canonical = getTagContent(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);

  if (!title) failures.push(`${rel}: missing title`);
  if (!metaTitle) failures.push(`${rel}: missing meta title`);
  if (!metaDesc) failures.push(`${rel}: missing meta description`);
  if (!canonical) failures.push(`${rel}: missing canonical`);

  if (title && metaTitle && title !== metaTitle) {
    failures.push(`${rel}: title and meta title mismatch`);
  }

  if (canonical && !/^https:\/\/opflow\.cc(?::\d+)?\//.test(canonical)) {
    failures.push(`${rel}: canonical should point to opflow.cc`);
  }
}

if (failures.length) {
  console.error('Metadata checks failed:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`check-metadata: OK (${HTML_FILES.length} HTML files validated)`);
