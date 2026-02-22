#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CONTENT_POSTS_DIR,
  ROOT_DIR,
  serializePostMarkdown,
  normalizePostPayload,
} from './site-lib.mjs';

const POSTS_DIR = path.join(ROOT_DIR, 'posts');
const TAGS_PAGE = path.join(ROOT_DIR, 'tags', 'index.html');

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function extractArticle(html) {
  const match = html.match(/<article class="typo">([\s\S]*?)<\/article>/i);
  if (!match) return '';
  return match[1].trim();
}

function removeOnce(text, regex) {
  const match = text.match(regex);
  if (!match) return text;
  return text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length);
}

function parseTagsBySlug(html) {
  const mapping = new Map();
  const sectionRegex = /<h2 class="post-list-header" id="([^"]+)">[\s\S]*?<\/h2><ul class="m-list">([\s\S]*?)<\/ul>/g;

  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const tag = decodeHtml(sectionMatch[1]).trim();
    if (!tag || tag === 'recent') continue;

    const linksHtml = sectionMatch[2];
    const linkRegex = /href="\.\.\/posts\/([^/]+)\/"/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(linksHtml)) !== null) {
      const slug = linkMatch[1].trim();
      if (!mapping.has(slug)) mapping.set(slug, []);
      const list = mapping.get(slug);
      if (!list.includes(tag)) list.push(tag);
    }
  }

  return mapping;
}

function extractSummary(bodyHtml, fallbackTitle) {
  const paragraphs = [...bodyHtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((item) => item[1]);
  for (const paragraph of paragraphs) {
    const plain = decodeHtml(paragraph.replaceAll(/<[^>]+>/g, '').trim());
    if (!plain) continue;
    if (plain.startsWith('发布时间：')) continue;
    return plain;
  }
  return fallbackTitle;
}

async function migrate() {
  await fs.mkdir(CONTENT_POSTS_DIR, { recursive: true });
  const tagIndexHtml = await fs.readFile(TAGS_PAGE, 'utf8');
  const tagsBySlug = parseTagsBySlug(tagIndexHtml);

  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
  let migrated = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const postHtmlPath = path.join(POSTS_DIR, slug, 'index.html');

    try {
      await fs.access(postHtmlPath);
    } catch {
      continue;
    }

    const html = await fs.readFile(postHtmlPath, 'utf8');
    const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? slug);
    const article = extractArticle(html);

    const metaMatch = article.match(/发布时间：([0-9]{4}-[0-9]{2}-[0-9]{2})\s*｜\s*分类：([^<\n]+)/);
    const date = metaMatch?.[1]?.trim() ?? '2026-01-01';
    const category = decodeHtml(metaMatch?.[2]?.trim() ?? '未分类');

    const summary = extractSummary(article, title);

    let body = article;
    body = removeOnce(body, /<h1>[\s\S]*?<\/h1>/i);
    body = removeOnce(body, /<p>\s*发布时间：[\s\S]*?<\/p>/i);
    body = removeOnce(body, /<p>[\s\S]*?<\/p>/i);
    body = body.trim();

    const normalized = normalizePostPayload({
      slug,
      title,
      date,
      category,
      tags: tagsBySlug.get(slug) ?? [],
      summary,
      content: body || `<p>${summary}</p>`,
    });

    const markdownPath = path.join(CONTENT_POSTS_DIR, `${slug}.md`);
    await fs.writeFile(markdownPath, serializePostMarkdown(normalized), 'utf8');
    migrated += 1;
  }

  console.log(`migrate-html-to-md: OK (${migrated} posts migrated)`);
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
