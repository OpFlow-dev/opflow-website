#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import TurndownService from 'turndown';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'content', 'posts');

const HTML_TAG_RE = /<\/?(?:p|h[1-6]|ul|ol|li|pre|code|blockquote|a|img|div|span|br|hr|table|thead|tbody|tr|td|th|em|strong)\b/i;

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
});

function normalizeMarkdown(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

async function run() {
  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
  let converted = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const file = path.join(POSTS_DIR, entry.name);
    const raw = await fs.readFile(file, 'utf8');
    const parsed = matter(raw);
    const source = parsed.content ?? '';

    if (!HTML_TAG_RE.test(source)) continue;

    const markdown = normalizeMarkdown(turndown.turndown(source));
    const next = matter.stringify(markdown, parsed.data, {
      lineWidth: 0,
      sortKeys: false,
    });

    await fs.writeFile(file, next, 'utf8');
    converted += 1;
  }

  console.log(`convert-posts-html-to-markdown: OK (${converted} files converted)`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
