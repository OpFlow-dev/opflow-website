import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

export const ROOT_DIR = process.cwd();
export const CONTENT_POSTS_DIR = path.join(ROOT_DIR, 'content', 'posts');
export const PUBLIC_POSTS_DIR = path.join(ROOT_DIR, 'posts');

const CANONICAL_BASE = 'https://opflow.cc:58050';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugifyAnchor(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9\-\u4e00-\u9fff]/g, '');
}

function parseDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }
  return new Date(`${dateString}T00:00:00.000Z`);
}

function postSort(a, b) {
  const d = b.date.localeCompare(a.date);
  if (d !== 0) return d;
  return a.slug.localeCompare(b.slug);
}

function toIsoDateTime(date) {
  return `${date}T00:00:00.000Z`;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeStatus(status) {
  const value = String(status ?? 'published').trim().toLowerCase();
  if (!value) return 'published';
  if (value === 'published' || value === 'draft') return value;
  throw new Error('status must be published or draft');
}

function validatePostPayload(input, { allowSlugMismatch = false, slugFromPath = null } = {}) {
  const slug = String(input.slug ?? slugFromPath ?? '').trim();
  const title = String(input.title ?? '').trim();
  const date = String(input.date ?? '').trim();
  const category = String(input.category ?? '').trim();
  const summary = String(input.summary ?? '').trim();
  const content = String(input.content ?? '').replace(/\r\n/g, '\n').trim();
  const tags = normalizeTags(input.tags);
  const status = normalizeStatus(input.status);

  if (!slug) throw new Error('slug is required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('slug must be kebab-case lowercase');
  if (!title) throw new Error('title is required');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  if (!category) throw new Error('category is required');
  if (!summary) throw new Error('summary is required');
  if (!content) throw new Error('content is required');

  if (!allowSlugMismatch && slugFromPath && slug !== slugFromPath) {
    throw new Error('slug in payload must match URL slug');
  }

  return { slug, title, date, category, tags, summary, content, status };
}

export function normalizePostPayload(input, options = {}) {
  return validatePostPayload(input, options);
}

function frontmatterValue(value) {
  return JSON.stringify(String(value));
}

export function serializePostMarkdown(post) {
  const lines = [
    '---',
    `slug: ${frontmatterValue(post.slug)}`,
    `title: ${frontmatterValue(post.title)}`,
    `date: ${frontmatterValue(post.date)}`,
    `status: ${frontmatterValue(post.status)}`,
    `category: ${frontmatterValue(post.category)}`,
    'tags:',
    ...post.tags.map((tag) => `  - ${frontmatterValue(tag)}`),
    `summary: ${frontmatterValue(post.summary)}`,
    '---',
    '',
    `${post.content.trim()}\n`,
  ];
  return lines.join('\n');
}

export function markdownPathForSlug(slug) {
  return path.join(CONTENT_POSTS_DIR, `${slug}.md`);
}

async function readPostFromFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const data = parsed.data ?? {};

  const post = {
    slug: String(data.slug ?? '').trim(),
    title: String(data.title ?? '').trim(),
    date: String(data.date ?? '').trim(),
    category: String(data.category ?? '').trim(),
    tags: normalizeTags(data.tags),
    summary: String(data.summary ?? '').trim(),
    content: String(parsed.content ?? '').trim(),
    status: normalizeStatus(data.status),
  };

  validatePostPayload(post);
  return post;
}

export async function loadPosts() {
  await fs.mkdir(CONTENT_POSTS_DIR, { recursive: true });
  const entries = await fs.readdir(CONTENT_POSTS_DIR, { withFileTypes: true });
  const posts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(CONTENT_POSTS_DIR, entry.name);
    const post = await readPostFromFile(filePath);
    posts.push(post);
  }

  posts.sort(postSort);
  return posts;
}

export async function writePost(post) {
  await fs.mkdir(CONTENT_POSTS_DIR, { recursive: true });
  const normalized = validatePostPayload(post);
  const target = markdownPathForSlug(normalized.slug);
  await fs.writeFile(target, serializePostMarkdown(normalized), 'utf8');
  return normalized;
}

export async function deletePostMarkdown(slug) {
  const target = markdownPathForSlug(slug);
  await fs.rm(target, { force: true });
}

function navLink(href, label, iconPath, active) {
  const activeClass = active ? ' class="active"' : '';
  return `<li><a href="${href}"${activeClass}><svg class="nav-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="${iconPath}"></path></svg><span>${label}</span></a></li>`;
}

function renderHeader(depth, active) {
  const prefix = '../'.repeat(depth);
  return `<header class="header">
    <div class="wrap">
      <h1 class="site-name">Opflow::Space</h1>
      <p class="site-slogan">Build, reflect, and iterate with clarity.</p>
      <nav class="site-nav">
        <ul>
        ${navLink(`${prefix}`, '首页', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', active === 'home')}
        ${navLink(`${prefix}list/`, '列表', 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z', active === 'list')}
        ${navLink(`${prefix}categories/`, '分类', 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z', active === 'categories')}
        ${navLink(`${prefix}tags/`, '标签', 'm21.41 11.58-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42M5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7', active === 'tags')}
        ${navLink(`${prefix}about/`, '关于', 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z', active === 'about')}
        </ul>
      </nav>
    </div>
  </header>`;
}

function renderPage({ title, description = title, canonicalPath, depth, active, contentHtml }) {
  const prefix = '../'.repeat(depth);
  const canonical = `${CANONICAL_BASE}${canonicalPath}`;
  const assetVersion = getAssetVersionForPage();
  return `<!DOCTYPE html>
<html lang="zh-cmn">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" type="image/x-icon" href="${prefix}favicon.ico">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="noarchive">
  <title>${escapeHtml(title)}</title>
  <meta name="title" content="${escapeHtml(title)}">
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="${prefix}assets/style.css?v=${assetVersion}">
</head>
<body>
  ${renderHeader(depth, active)}

  <main class="container wrap">
    <article class="typo">
      ${contentHtml}
    </article>
  </main>

  <button type="button" class="top-btn" id="top-btn" aria-label="回到顶部">
    <svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"></path></svg>
  </button>

  <footer class="footer"><div class="wrap"><div class="copyright"><p>&copy; 2026 Opflow::Space</p></div></div></footer>

  <script src="${prefix}assets/main.js?v=${assetVersion}"></script>
</body>
</html>`;
}

function renderPostList(posts, hrefPrefix) {
  return posts
    .map((post) => `<li class="list-item"><a href="${hrefPrefix}${post.slug}/"><span class="post-date"><time datetime="${toIsoDateTime(post.date)}">${post.date}</time></span><p class="post-title">${escapeHtml(post.title)}</p></a></li>`)
    .join(' ');
}

async function writePage(filePath, html) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, html, 'utf8');
}

function buildCategoryMap(posts) {
  const map = new Map();
  for (const post of posts) {
    if (!map.has(post.category)) map.set(post.category, []);
    map.get(post.category).push(post);
  }
  return [...map.entries()].sort((a, b) => {
    const byCount = b[1].length - a[1].length;
    if (byCount !== 0) return byCount;
    return a[0].localeCompare(b[0]);
  });
}

function buildTagMap(posts) {
  const map = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(post);
    }
  }
  return [...map.entries()].sort((a, b) => {
    const byCount = b[1].length - a[1].length;
    if (byCount !== 0) return byCount;
    return a[0].localeCompare(b[0]);
  });
}

async function ensurePostAliases(posts) {
  await fs.mkdir(PUBLIC_POSTS_DIR, { recursive: true });

  const entries = await fs.readdir(PUBLIC_POSTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    if (/^sample-post-\d+$/.test(entry.name)) {
      await fs.rm(path.join(PUBLIC_POSTS_DIR, entry.name), { force: true });
    }
  }

  for (const post of posts) {
    const match = post.slug.match(/^sample-post-(\d{3})$/);
    if (!match) continue;
    const alias = `sample-post-${Number(match[1])}`;
    if (alias === post.slug) continue;
    const aliasPath = path.join(PUBLIC_POSTS_DIR, alias);
    await fs.symlink(post.slug, aliasPath);
  }
}

async function getAssetVersion() {
  const stylePath = path.join(ROOT_DIR, 'assets', 'style.css');
  const mainPath = path.join(ROOT_DIR, 'assets', 'main.js');
  const [styleStat, mainStat] = await Promise.all([
    fs.stat(stylePath),
    fs.stat(mainPath),
  ]);
  return `${Math.trunc(styleStat.mtimeMs)}-${Math.trunc(mainStat.mtimeMs)}`;
}

let currentAssetVersion = '';

function getAssetVersionForPage() {
  return currentAssetVersion;
}

export async function buildSite() {
  currentAssetVersion = await getAssetVersion();
  const posts = await loadPosts();
  const publishedPosts = posts.filter((post) => post.status === 'published');
  const publishedPostSlugs = new Set(publishedPosts.map((post) => post.slug));

  await fs.mkdir(PUBLIC_POSTS_DIR, { recursive: true });
  const existingPostEntries = await fs.readdir(PUBLIC_POSTS_DIR, { withFileTypes: true });

  for (const entry of existingPostEntries) {
    const fullPath = path.join(PUBLIC_POSTS_DIR, entry.name);
    if (entry.isDirectory()) {
      if (!publishedPostSlugs.has(entry.name) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) {
        await fs.rm(fullPath, { recursive: true, force: true });
      }
    }
    if (entry.isSymbolicLink() && /^sample-post-\d+$/.test(entry.name)) {
      await fs.rm(fullPath, { force: true });
    }
  }

  for (const post of publishedPosts) {
    const postBody = md.render(post.content);
    const contentHtml = `
<h1>${escapeHtml(post.title)}</h1>
<p>发布时间：${escapeHtml(post.date)} ｜ 分类：${escapeHtml(post.category)}</p>
<p>${escapeHtml(post.summary)}</p>
${postBody}
`;

    const postHtml = renderPage({
      title: post.title,
      description: post.summary,
      canonicalPath: `/posts/${post.slug}/`,
      depth: 2,
      active: null,
      contentHtml,
    });

    await writePage(path.join(PUBLIC_POSTS_DIR, post.slug, 'index.html'), postHtml);
  }

  const recent = publishedPosts.slice(0, 10);
  const indexContent = `
<h1>首页</h1>
<p><img src="assets/hero.svg" style="aspect-ratio: 426/251; width: 100%;" alt="sample cover" fetchpriority="high"></p>
<blockquote>
  <p>Build, test, refine, and keep shipping with intention.</p>
  <p>-- Sample Note</p>
</blockquote>
<div class="post-list">
  <h2 class="post-list-header"><svg class="list-header-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8"></path><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"></path></svg>最近发布</h2>
  <ul class="m-list">${renderPostList(recent, 'posts/')}</ul>
</div>
<p class="more"><a href="list/">查看全部</a></p>
`;

  await writePage(path.join(ROOT_DIR, 'index.html'), renderPage({
    title: '首页',
    canonicalPath: '/',
    depth: 0,
    active: 'home',
    contentHtml: indexContent,
  }));

  const listContent = `<h1>列表</h1><div class="post-list"><ul class="m-list">${renderPostList(publishedPosts, '../posts/')}</ul></div>`;
  await writePage(path.join(ROOT_DIR, 'list', 'index.html'), renderPage({
    title: '列表',
    canonicalPath: '/list/',
    depth: 1,
    active: 'list',
    contentHtml: listContent,
  }));

  const categoryGroups = buildCategoryMap(publishedPosts);
  const categoryLinks = categoryGroups
    .map(([category, bucket]) => `<a href="#${slugifyAnchor(category)}">${escapeHtml(category)} (${bucket.length})</a>`)
    .join(' ');
  const categorySections = categoryGroups
    .map(([category, bucket]) => `<div class="post-list"><h2 class="post-list-header" id="${slugifyAnchor(category)}"><svg class="list-header-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z"></path></svg> ${escapeHtml(category)}</h2><ul class="m-list">${renderPostList(bucket, '../posts/')}</ul></div>`)
    .join(' ');

  const categoriesContent = `
<h1>分类</h1>
<div class="tag-list">${categoryLinks}</div>
<div class="post-list"><h2 class="post-list-header" id="recent"><svg class="list-header-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8"></path><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"></path></svg> 最近发布</h2><ul class="m-list">${renderPostList(recent, '../posts/')}</ul></div>
<div class="category-list">${categorySections}</div>
`;

  await writePage(path.join(ROOT_DIR, 'categories', 'index.html'), renderPage({
    title: '分类',
    canonicalPath: '/categories/',
    depth: 1,
    active: 'categories',
    contentHtml: categoriesContent,
  }));

  const tagGroups = buildTagMap(publishedPosts);
  const tagLinks = tagGroups
    .map(([tag, bucket]) => `<a href="#${slugifyAnchor(tag)}">${escapeHtml(tag)} (${bucket.length})</a>`)
    .join(' ');
  const tagSections = tagGroups
    .map(([tag, bucket]) => `<div class="post-list"><h2 class="post-list-header" id="${slugifyAnchor(tag)}"><svg class="list-header-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="m21.41 11.58-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42M5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7"></path></svg> ${escapeHtml(tag)}</h2><ul class="m-list">${renderPostList(bucket, '../posts/')}</ul></div>`)
    .join(' ');

  const tagsContent = `
<h1>标签</h1>
<div class="tag-list">${tagLinks}</div>
<div class="post-list"><h2 class="post-list-header" id="recent"><svg class="list-header-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8"></path><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"></path></svg> 最近发布</h2><ul class="m-list">${renderPostList(recent, '../posts/')}</ul></div>
<div class="tag-list">${tagSections}</div>
`;

  await writePage(path.join(ROOT_DIR, 'tags', 'index.html'), renderPage({
    title: '标签',
    canonicalPath: '/tags/',
    depth: 1,
    active: 'tags',
    contentHtml: tagsContent,
  }));

  await ensurePostAliases(publishedPosts);

  return { postCount: publishedPosts.length };
}

export function buildTaxonomy(posts) {
  const categories = Object.fromEntries(buildCategoryMap(posts).map(([name, bucket]) => [name, bucket.length]));
  const tags = Object.fromEntries(buildTagMap(posts).map(([name, bucket]) => [name, bucket.length]));
  return { categories, tags };
}

export function findPost(posts, slug) {
  return posts.find((post) => post.slug === slug) ?? null;
}

export async function removePostOutput(slug) {
  await fs.rm(path.join(PUBLIC_POSTS_DIR, slug), { recursive: true, force: true });
  const m = slug.match(/^sample-post-(\d{3})$/);
  if (m) {
    const alias = `sample-post-${Number(m[1])}`;
    if (alias !== slug) {
      await fs.rm(path.join(PUBLIC_POSTS_DIR, alias), { force: true });
    }
  }
}

export function fileDateToYyyyMmDd(input) {
  const date = parseDate(input);
  return date ? input : null;
}
