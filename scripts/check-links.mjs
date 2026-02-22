#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'qa-screenshots', 'ref-html', 'docs', 'scripts']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') {
      if (entry.name !== '.gitignore') {
        continue;
      }
    }
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function resolveLocalTarget(filePath, rawValue) {
  const value = rawValue.trim();
  if (!value || value.startsWith('#')) return null;
  if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(value)) return null;

  const clean = value.split('#')[0].split('?')[0];
  const base = path.dirname(filePath);
  const target = clean.startsWith('/')
    ? path.join(ROOT, clean.replace(/^\/+/, ''))
    : path.resolve(base, clean);

  const candidates = [target];
  if (target.endsWith(path.sep)) {
    candidates.push(path.join(target, 'index.html'));
  } else {
    candidates.push(path.join(target, 'index.html'));
  }

  return { clean, candidates };
}

const htmlFiles = walk(ROOT);
const failures = [];

for (const filePath of htmlFiles) {
  const html = fs.readFileSync(filePath, 'utf8');
  const attrRegex = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/g;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const raw = match[2];
    const resolved = resolveLocalTarget(filePath, raw);
    if (!resolved) continue;
    const exists = resolved.candidates.some((candidate) => fs.existsSync(candidate));
    if (!exists) {
      failures.push(`${path.relative(ROOT, filePath)} -> ${resolved.clean}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Broken local links/assets found:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`check-links: OK (${htmlFiles.length} HTML files scanned)`);
