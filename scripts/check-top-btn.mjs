#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const mainJsPath = path.join(ROOT, 'assets', 'main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

if (!mainJs.includes("getElementById('top-btn')") || !mainJs.includes('window.scrollTo')) {
  console.error('assets/main.js is missing top button logic');
  process.exit(1);
}

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.venv', 'qa-screenshots', 'ref-html', 'docs', 'scripts'].includes(entry.name)) continue;
      walkHtml(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const htmlFiles = walkHtml(ROOT);
const failures = [];

for (const filePath of htmlFiles) {
  const html = fs.readFileSync(filePath, 'utf8');
  if (!/id=["']top-btn["']/.test(html)) {
    failures.push(`${path.relative(ROOT, filePath)} missing #top-btn`);
  }
  if (!/class=["'][^"']*top-btn[^"']*["']/.test(html)) {
    failures.push(`${path.relative(ROOT, filePath)} missing .top-btn class`);
  }
}

if (failures.length) {
  console.error('Top button checks failed:');
  for (const line of failures) console.error(`- ${line}`);
  process.exit(1);
}

console.log(`check-top-btn: OK (${htmlFiles.length} pages include top button)`);
