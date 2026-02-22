#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const DISALLOWED_HTML_RE = /<\/?(?:p|h[1-6]|ul|ol|li|pre|code|blockquote|a|img|div|span|br|hr|table|thead|tbody|tr|td|th|em|strong)\b/i;

async function run() {
  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
  const violations = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(POSTS_DIR, entry.name);
    const raw = await fs.readFile(filePath, 'utf8');
    const { content } = matter(raw);
    const match = content.match(DISALLOWED_HTML_RE);
    if (match) {
      const idx = match.index ?? 0;
      const line = content.slice(0, idx).split('\n').length;
      violations.push(`${path.relative(ROOT, filePath)}:${line} contains HTML tag <${match[0].replace(/[<>/]/g, '')}>`);
    }
  }

  if (violations.length) {
    console.error('Markdown source check failed: HTML tags found in post content');
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
  }

  console.log('check-markdown-source: OK (all post bodies are pure Markdown)');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
