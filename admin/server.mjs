#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  ROOT_DIR,
  buildSite,
  buildTaxonomy,
  deletePostMarkdown,
  findPost,
  loadPosts,
  normalizePostPayload,
  removePostOutput,
  writePost,
} from '../scripts/site-lib.mjs';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const ADMIN_PORT = Number(process.env.ADMIN_PORT || 59051);
const ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1';
const COOKIE_NAME = 'opflow_admin_session';
const SESSION_TOKEN = crypto.createHash('sha256').update(`opflow::${ADMIN_PASSWORD}`).digest('hex');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const adminPublicDir = path.join(ROOT_DIR, 'admin', 'public');
const assetsDir = path.join(ROOT_DIR, 'assets');
const contentPostsDir = path.join(ROOT_DIR, 'content', 'posts');
const categoriesRegistryPath = path.join(ROOT_DIR, 'content', 'categories.json');
const apiTokenStorePath = path.join(ROOT_DIR, 'content', 'api-tokens.json');
const uploadDir = path.join(assetsDir, 'uploads');
const DEFAULT_CATEGORY = '未分类';
const API_VERSION = 'v1';

function normalizeCategoryName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('category name is required');
  return name;
}

function sortCategoryNames(categories) {
  return [...categories].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function categorySetFromPosts(posts) {
  const set = new Set();
  for (const post of posts) {
    set.add(normalizeCategoryName(post.category));
  }
  return set;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

async function readCategoryRegistry() {
  try {
    const raw = await fs.readFile(categoriesRegistryPath, 'utf8');
    const parsed = JSON.parse(raw);
    const source = Array.isArray(parsed) ? parsed : parsed?.categories;
    if (!Array.isArray(source)) throw new Error('categories.json must be an array or { categories: [] }');
    const categories = new Set(
      source
        .map((item) => String(item ?? '').trim())
        .filter(Boolean),
    );
    return { exists: true, categories };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, categories: new Set() };
    }
    throw error;
  }
}

async function writeCategoryRegistry(categories) {
  await fs.mkdir(path.dirname(categoriesRegistryPath), { recursive: true });
  const payload = { categories: sortCategoryNames(categories) };
  await fs.writeFile(categoriesRegistryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function ensureCategoryRegistry({ posts = null, extraCategories = [] } = {}) {
  const { exists, categories: current } = await readCategoryRegistry();
  const next = new Set(current);
  next.add(DEFAULT_CATEGORY);

  for (const name of extraCategories) {
    if (name == null) continue;
    next.add(normalizeCategoryName(name));
  }

  if (posts) {
    for (const name of categorySetFromPosts(posts)) {
      next.add(name);
    }
  }

  if (!exists || !setsEqual(current, next)) {
    await writeCategoryRegistry(next);
  }

  return next;
}

function buildCategoryRows(categories, posts) {
  const counts = new Map();
  for (const post of posts) {
    const name = normalizeCategoryName(post.category);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return sortCategoryNames(categories).map((name) => ({ name, count: counts.get(name) || 0 }));
}

function normalizeTagName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('tag name is required');
  return name;
}

function postMetadata(post) {
  const { slug, title, date, status, category, tags, summary } = post;
  return { slug, title, date, status, category, tags, summary };
}

function normalizeStatusFilter(value, defaultStatus = 'all') {
  const status = String(value ?? defaultStatus).trim().toLowerCase();
  if (!status || status === 'all') return 'all';
  if (status === 'published' || status === 'draft') return status;
  throw new Error('status must be all, published or draft');
}

function filterPostsByStatus(posts, status) {
  if (status === 'all') return posts;
  return posts.filter((post) => post.status === status);
}

function parseBooleanFlag(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function buildTagRows(posts) {
  const taxonomy = buildTaxonomy(posts);
  return Object.entries(taxonomy.tags)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      const byCount = b.count - a.count;
      if (byCount !== 0) return byCount;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
}

function dedupeTags(tags) {
  const set = new Set();
  const next = [];
  for (const tag of tags) {
    const normalized = String(tag ?? '').trim();
    if (!normalized || set.has(normalized)) continue;
    set.add(normalized);
    next.push(normalized);
  }
  return next;
}

function nowIso() {
  return new Date().toISOString();
}

function hashApiToken(token) {
  return crypto.createHash('sha256').update(`opflow-agent::${token}`).digest('hex');
}

function normalizeTokenName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('token name is required');
  if (name.length > 80) throw new Error('token name is too long (max 80 chars)');
  return name;
}

function toPublicTokenRecord(record) {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt || null,
    revokedAt: record.revokedAt || null,
  };
}

function sortTokenRecords(records) {
  return [...records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function readApiTokenStore() {
  try {
    const raw = await fs.readFile(apiTokenStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    const source = Array.isArray(parsed?.tokens) ? parsed.tokens : [];

    const tokens = source
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id ?? '').trim(),
        name: String(item.name ?? '').trim(),
        prefix: String(item.prefix ?? '').trim(),
        hash: String(item.hash ?? '').trim(),
        createdAt: String(item.createdAt ?? '').trim() || nowIso(),
        updatedAt: String(item.updatedAt ?? '').trim() || nowIso(),
        lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt).trim() : null,
        revokedAt: item.revokedAt ? String(item.revokedAt).trim() : null,
      }))
      .filter((item) => item.id && item.name && item.prefix && item.hash);

    return { exists: true, tokens };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, tokens: [] };
    }
    throw error;
  }
}

async function writeApiTokenStore(tokens) {
  await fs.mkdir(path.dirname(apiTokenStorePath), { recursive: true });
  const payload = {
    tokens: sortTokenRecords(tokens),
  };
  await fs.writeFile(apiTokenStorePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function listApiTokenRecords() {
  const store = await readApiTokenStore();
  return sortTokenRecords(store.tokens).map(toPublicTokenRecord);
}

async function createApiTokenRecord(name) {
  const tokenName = normalizeTokenName(name);
  const token = `opflow_${crypto.randomBytes(8).toString('hex')}.${crypto.randomBytes(24).toString('hex')}`;
  const createdAt = nowIso();
  const record = {
    id: crypto.randomUUID(),
    name: tokenName,
    prefix: token.slice(0, 18),
    hash: hashApiToken(token),
    createdAt,
    updatedAt: createdAt,
    lastUsedAt: null,
    revokedAt: null,
  };

  const store = await readApiTokenStore();
  const next = [...store.tokens, record];
  await writeApiTokenStore(next);

  return {
    token,
    record: toPublicTokenRecord(record),
  };
}

async function revokeApiTokenRecord(id) {
  const tokenId = String(id ?? '').trim();
  if (!tokenId) throw new Error('token id is required');

  const store = await readApiTokenStore();
  const target = store.tokens.find((item) => item.id === tokenId);
  if (!target) return null;

  if (!target.revokedAt) {
    const ts = nowIso();
    target.revokedAt = ts;
    target.updatedAt = ts;
    await writeApiTokenStore(store.tokens);
  }

  return toPublicTokenRecord(target);
}

function extractApiTokenFromRequest(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  const fromHeader = String(req.headers['x-api-token'] || req.headers['x-opflow-token'] || '').trim();
  if (fromHeader) return fromHeader;

  return '';
}

async function requireApiWriteToken(req, res, next) {
  try {
    const token = extractApiTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: 'Missing API token. Use Authorization: Bearer <token>' });
      return;
    }

    const store = await readApiTokenStore();
    const tokenHash = hashApiToken(token);
    const matched = store.tokens.find((item) => item.hash === tokenHash && !item.revokedAt);

    if (!matched) {
      res.status(401).json({ error: 'Invalid API token' });
      return;
    }

    matched.lastUsedAt = nowIso();
    matched.updatedAt = matched.lastUsedAt;
    await writeApiTokenStore(store.tokens);

    req.agentToken = toPublicTokenRecord(matched);
    next();
  } catch (error) {
    next(error);
  }
}

function sanitizeBaseFilename(value) {
  return String(value)
    .normalize('NFKD')
    .replaceAll(/[^\w.-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .toLowerCase();
}

function parseMultipartBoundary(contentType) {
  const match = String(contentType ?? '').match(/multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  return (match?.[1] || match?.[2] || '').trim();
}

async function parseImagePartFromMultipart(req) {
  const boundary = parseMultipartBoundary(req.headers['content-type']);
  if (!boundary) throw new Error('Expected multipart/form-data');

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 10 * 1024 * 1024) throw new Error('Upload too large (max 10MB)');
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('latin1');
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    if (!part || part === '--' || part === '--\r\n') continue;
    const trimmed = part.startsWith('\r\n') ? part.slice(2) : part;
    const headerEnd = trimmed.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headersText = trimmed.slice(0, headerEnd);
    let bodyText = trimmed.slice(headerEnd + 4);
    if (bodyText.endsWith('\r\n')) bodyText = bodyText.slice(0, -2);
    if (bodyText.endsWith('--')) bodyText = bodyText.slice(0, -2);

    const disposition = headersText.match(/content-disposition:[^\r\n]*/i)?.[0] || '';
    const fieldName = disposition.match(/name="([^"]+)"/i)?.[1] || '';
    const originalName = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
    const mimeType = headersText.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase() || '';

    if (fieldName !== 'image') continue;
    if (!originalName) throw new Error('image is required');
    if (!/^image\//.test(mimeType)) throw new Error('Only image mime types are allowed');

    return {
      originalName,
      mimeType,
      buffer: Buffer.from(bodyText, 'latin1'),
    };
  }

  throw new Error('image is required');
}

async function createPostAndBuild(input) {
  const payload = normalizePostPayload(input);
  const existing = await loadPosts();
  if (findPost(existing, payload.slug)) {
    throw new Error('slug already exists');
  }

  await writePost(payload);
  await ensureCategoryRegistry({ extraCategories: [payload.category] });
  const build = await buildSite();
  return { post: payload, build };
}

async function updatePostAndBuild(currentSlug, input) {
  const posts = await loadPosts();
  const existing = findPost(posts, currentSlug);
  if (!existing) {
    const error = new Error('Post not found');
    error.statusCode = 404;
    throw error;
  }

  const payload = normalizePostPayload(input, { allowSlugMismatch: true, slugFromPath: currentSlug });

  if (payload.slug !== currentSlug && findPost(posts, payload.slug)) {
    throw new Error('new slug already exists');
  }

  await writePost(payload);
  await ensureCategoryRegistry({ extraCategories: [payload.category] });
  if (payload.slug !== currentSlug) {
    await deletePostMarkdown(currentSlug);
    await removePostOutput(currentSlug);
  }

  const build = await buildSite();
  return { post: payload, build };
}

async function deletePostAndBuild(slug) {
  const posts = await loadPosts();
  if (!findPost(posts, slug)) {
    const error = new Error('Post not found');
    error.statusCode = 404;
    throw error;
  }

  await deletePostMarkdown(slug);
  await removePostOutput(slug);
  const build = await buildSite();
  return { build };
}

async function createCategory(nameInput) {
  const name = normalizeCategoryName(nameInput);
  const posts = await loadPosts();
  const categories = await ensureCategoryRegistry({ posts });
  if (categories.has(name)) {
    const error = new Error('category already exists');
    error.statusCode = 409;
    throw error;
  }

  categories.add(name);
  await writeCategoryRegistry(categories);
  return { category: { name, count: 0 } };
}

async function deleteCategoryAndReassign(targetInput, reassignInput = DEFAULT_CATEGORY) {
  const target = normalizeCategoryName(targetInput);
  if (target === DEFAULT_CATEGORY) {
    const error = new Error('default category cannot be deleted');
    error.statusCode = 400;
    throw error;
  }

  const posts = await loadPosts();
  const categories = await ensureCategoryRegistry({ posts });
  if (!categories.has(target)) {
    const error = new Error('category not found');
    error.statusCode = 404;
    throw error;
  }

  const postsInCategory = posts.filter((post) => normalizeCategoryName(post.category) === target);
  const reassignTo = normalizeCategoryName(reassignInput || DEFAULT_CATEGORY);

  if (postsInCategory.length && reassignTo === target) {
    const error = new Error('reassignTo must be different from deleted category');
    error.statusCode = 400;
    throw error;
  }

  let nextPosts = posts;
  if (postsInCategory.length) {
    for (const post of postsInCategory) {
      await writePost({ ...post, category: reassignTo });
    }
    nextPosts = posts.map((post) => (normalizeCategoryName(post.category) === target ? { ...post, category: reassignTo } : post));
    await buildSite();
  }

  const nextCategories = new Set(categories);
  nextCategories.add(reassignTo);
  for (const name of categorySetFromPosts(nextPosts)) {
    nextCategories.add(name);
  }
  nextCategories.delete(target);
  await writeCategoryRegistry(nextCategories);

  return {
    reassigned: postsInCategory.length,
    reassignTo: postsInCategory.length ? reassignTo : null,
  };
}

async function renameTagAndBuild(fromInput, toInput) {
  const from = normalizeTagName(fromInput);
  const to = normalizeTagName(toInput);
  if (from === to) {
    return { updatedPosts: 0, from, to };
  }

  const posts = await loadPosts();
  let updatedPosts = 0;

  for (const post of posts) {
    if (!post.tags.includes(from)) continue;
    const nextTags = dedupeTags(post.tags.map((tag) => (tag === from ? to : tag)));
    await writePost({ ...post, tags: nextTags });
    updatedPosts += 1;
  }

  if (updatedPosts > 0) {
    await buildSite();
  }

  return { updatedPosts, from, to };
}

async function deleteTagAndBuild(tagInput) {
  const target = normalizeTagName(tagInput);
  const posts = await loadPosts();
  let updatedPosts = 0;

  for (const post of posts) {
    if (!post.tags.includes(target)) continue;
    const nextTags = post.tags.filter((tag) => tag !== target);
    await writePost({ ...post, tags: nextTags });
    updatedPosts += 1;
  }

  if (updatedPosts > 0) {
    await buildSite();
  }

  return { removedTag: target, updatedPosts };
}

function isAuthed(req) {
  return req.cookies?.[COOKIE_NAME] === SESSION_TOKEN;
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function sendAuthCookie(res) {
  res.cookie(COOKIE_NAME, SESSION_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 1000 * 60 * 60 * 12,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
}

function sendErrorWithStatus(res, error, fallback = 400) {
  const statusCode = Number(error?.statusCode || fallback);
  const message = error instanceof Error
    ? error.message
    : String(error?.message || 'Unknown error');
  res.status(statusCode).json({ error: message });
}

app.post('/admin/api/login', (req, res) => {
  const password = String(req.body?.password ?? '');
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  sendAuthCookie(res);
  res.json({ ok: true });
});

app.post('/admin/api/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/admin/api/me', (req, res) => {
  res.json({ authenticated: isAuthed(req) });
});

app.get('/admin/api/agent-tokens', requireAuth, async (_req, res, next) => {
  try {
    const tokens = await listApiTokenRecords();
    res.json({ tokens });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/api/agent-tokens', requireAuth, async (req, res, next) => {
  try {
    const result = await createApiTokenRecord(req.body?.name);
    res.status(201).json({ ok: true, token: result.record, plainToken: result.token });
  } catch (error) {
    next(error);
  }
});

app.delete('/admin/api/agent-tokens/:id', requireAuth, async (req, res, next) => {
  try {
    const revoked = await revokeApiTokenRecord(req.params.id);
    if (!revoked) {
      res.status(404).json({ error: 'token not found' });
      return;
    }
    res.json({ ok: true, token: revoked });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/api/posts', requireAuth, async (_req, res, next) => {
  try {
    const posts = await loadPosts();
    const metadata = posts.map(({ slug, title, date, status, category, tags, summary }) => ({
      slug,
      title,
      date,
      status,
      category,
      tags,
      summary,
    }));
    res.json({ posts: metadata });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/api/posts/:slug', requireAuth, async (req, res, next) => {
  try {
    const posts = await loadPosts();
    const post = findPost(posts, req.params.slug);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json({ post });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/api/upload-image', requireAuth, async (req, res, next) => {
  try {
    const image = await parseImagePartFromMultipart(req);
    const ext = path.extname(image.originalName || '').toLowerCase().slice(0, 16);
    const stemFromOriginal = path.basename(image.originalName || 'image', ext);
    const stem = sanitizeBaseFilename(stemFromOriginal) || 'image';
    const nonce = crypto.randomBytes(6).toString('hex');
    const filename = `${stem}-${Date.now()}-${nonce}${ext || '.img'}`;
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), image.buffer);
    res.json({ ok: true, url: `/assets/uploads/${filename}` });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/api/categories', requireAuth, async (_req, res, next) => {
  try {
    const posts = await loadPosts();
    const categories = await ensureCategoryRegistry({ posts });
    res.json({ categories: buildCategoryRows(categories, posts) });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/api/categories', requireAuth, async (req, res, next) => {
  try {
    const result = await createCategory(req.body?.name);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'category already exists') {
      sendErrorWithStatus(res, { message: error.message, statusCode: 409 });
      return;
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.delete('/admin/api/categories/:name', requireAuth, async (req, res, next) => {
  try {
    const target = normalizeCategoryName(decodeURIComponent(req.params.name));
    const reassignTo = req.body?.reassignTo == null
      ? DEFAULT_CATEGORY
      : normalizeCategoryName(req.body.reassignTo);

    const result = await deleteCategoryAndReassign(target, reassignTo);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.post('/admin/api/posts', requireAuth, async (req, res, next) => {
  try {
    const result = await createPostAndBuild(req.body);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'slug already exists') {
      sendErrorWithStatus(res, { message: error.message, statusCode: 409 });
      return;
    }
    next(error);
  }
});

app.put('/admin/api/posts/:slug', requireAuth, async (req, res, next) => {
  try {
    const result = await updatePostAndBuild(req.params.slug, req.body);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'new slug already exists') {
        sendErrorWithStatus(res, { message: error.message, statusCode: 409 });
        return;
      }
      if (error.message === 'Post not found') {
        sendErrorWithStatus(res, { message: error.message, statusCode: 404 });
        return;
      }
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.delete('/admin/api/posts/:slug', requireAuth, async (req, res, next) => {
  try {
    const result = await deletePostAndBuild(req.params.slug);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Post not found') {
      sendErrorWithStatus(res, { message: error.message, statusCode: 404 });
      return;
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.get('/admin/api/taxonomy', requireAuth, async (_req, res, next) => {
  try {
    const posts = await loadPosts();
    const categories = await ensureCategoryRegistry({ posts });
    const taxonomy = buildTaxonomy(posts);
    for (const name of sortCategoryNames(categories)) {
      if (!(name in taxonomy.categories)) {
        taxonomy.categories[name] = 0;
      }
    }
    res.json(taxonomy);
  } catch (error) {
    next(error);
  }
});

app.post('/admin/api/rebuild', requireAuth, async (_req, res, next) => {
  try {
    const result = await buildSite();
    res.json({ ok: true, build: result });
  } catch (error) {
    next(error);
  }
});

app.get(`/api/${API_VERSION}/health`, (_req, res) => {
  res.json({ ok: true, version: API_VERSION });
});

app.get(`/api/${API_VERSION}/posts`, async (req, res, next) => {
  try {
    const status = normalizeStatusFilter(req.query.status, 'published');
    const includeContent = parseBooleanFlag(req.query.includeContent);
    const q = String(req.query.q ?? '').trim().toLowerCase();

    const posts = filterPostsByStatus(await loadPosts(), status).filter((post) => {
      if (!q) return true;
      return (
        post.slug.toLowerCase().includes(q)
        || post.title.toLowerCase().includes(q)
        || post.summary.toLowerCase().includes(q)
        || post.category.toLowerCase().includes(q)
        || post.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    const items = includeContent ? posts : posts.map(postMetadata);
    res.json({ posts: items, total: items.length, status });
  } catch (error) {
    next(error);
  }
});

app.get(`/api/${API_VERSION}/posts/:slug`, async (req, res, next) => {
  try {
    const post = findPost(await loadPosts(), req.params.slug);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json({ post });
  } catch (error) {
    next(error);
  }
});

app.post(`/api/${API_VERSION}/posts`, requireApiWriteToken, async (req, res, next) => {
  try {
    const result = await createPostAndBuild(req.body);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'slug already exists') {
      sendErrorWithStatus(res, { message: error.message, statusCode: 409 });
      return;
    }
    next(error);
  }
});

app.put(`/api/${API_VERSION}/posts/:slug`, requireApiWriteToken, async (req, res, next) => {
  try {
    const result = await updatePostAndBuild(req.params.slug, req.body);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'new slug already exists') {
        sendErrorWithStatus(res, { message: error.message, statusCode: 409 });
        return;
      }
      if (error.message === 'Post not found') {
        sendErrorWithStatus(res, { message: error.message, statusCode: 404 });
        return;
      }
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.delete(`/api/${API_VERSION}/posts/:slug`, requireApiWriteToken, async (req, res, next) => {
  try {
    const result = await deletePostAndBuild(req.params.slug);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Post not found') {
      sendErrorWithStatus(res, { message: error.message, statusCode: 404 });
      return;
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.get(`/api/${API_VERSION}/categories`, async (req, res, next) => {
  try {
    const status = normalizeStatusFilter(req.query.status, 'all');
    const posts = filterPostsByStatus(await loadPosts(), status);
    const categories = await ensureCategoryRegistry({ posts });
    res.json({ categories: buildCategoryRows(categories, posts), status });
  } catch (error) {
    next(error);
  }
});

app.post(`/api/${API_VERSION}/categories`, requireApiWriteToken, async (req, res, next) => {
  try {
    const result = await createCategory(req.body?.name);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'category already exists') {
      sendErrorWithStatus(res, { message: error.message, statusCode: 409 });
      return;
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.delete(`/api/${API_VERSION}/categories/:name`, requireApiWriteToken, async (req, res, next) => {
  try {
    const target = normalizeCategoryName(decodeURIComponent(req.params.name));
    const reassignTo = req.body?.reassignTo == null
      ? DEFAULT_CATEGORY
      : normalizeCategoryName(req.body.reassignTo);

    const result = await deleteCategoryAndReassign(target, reassignTo);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.get(`/api/${API_VERSION}/tags`, async (req, res, next) => {
  try {
    const status = normalizeStatusFilter(req.query.status, 'all');
    const posts = filterPostsByStatus(await loadPosts(), status);
    res.json({ tags: buildTagRows(posts), status });
  } catch (error) {
    next(error);
  }
});

app.post(`/api/${API_VERSION}/tags/rename`, requireApiWriteToken, async (req, res, next) => {
  try {
    const result = await renameTagAndBuild(req.body?.from, req.body?.to);
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.delete(`/api/${API_VERSION}/tags/:name`, requireApiWriteToken, async (req, res, next) => {
  try {
    const result = await deleteTagAndBuild(decodeURIComponent(req.params.name));
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      sendErrorWithStatus(res, error);
      return;
    }
    next(error);
  }
});

app.get(`/api/${API_VERSION}/taxonomy`, async (req, res, next) => {
  try {
    const status = normalizeStatusFilter(req.query.status, 'all');
    const posts = filterPostsByStatus(await loadPosts(), status);
    const categories = await ensureCategoryRegistry({ posts });
    const taxonomy = buildTaxonomy(posts);
    for (const name of sortCategoryNames(categories)) {
      if (!(name in taxonomy.categories)) {
        taxonomy.categories[name] = 0;
      }
    }
    res.json({ ...taxonomy, status });
  } catch (error) {
    next(error);
  }
});

app.post(`/api/${API_VERSION}/rebuild`, requireApiWriteToken, async (_req, res, next) => {
  try {
    const result = await buildSite();
    res.json({ ok: true, build: result });
  } catch (error) {
    next(error);
  }
});

app.use('/assets', express.static(assetsDir));
app.use('/content/posts', express.static(contentPostsDir));
app.use('/admin', express.static(adminPublicDir));

function isSafeSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug ?? ''));
}

async function sendGeneratedHtml(res, filePath) {
  try {
    const html = await fs.readFile(filePath, 'utf8');
    res.type('html').send(html);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      res.status(404).send('Not found');
      return;
    }
    console.error('[sendGeneratedHtml]', filePath, error);
    res.status(500).send('Internal server error');
  }
}

async function sendBinary(res, filePath, contentType) {
  try {
    const data = await fs.readFile(filePath);
    res.type(contentType).send(data);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      res.status(404).send('Not found');
      return;
    }
    console.error('[sendBinary]', filePath, error);
    res.status(500).send('Internal server error');
  }
}

app.get('/', async (_req, res) => {
  await sendGeneratedHtml(res, path.join(ROOT_DIR, 'index.html'));
});

for (const section of ['list', 'categories', 'tags', 'about']) {
  app.get([`/${section}`, `/${section}/`], async (_req, res) => {
    await sendGeneratedHtml(res, path.join(ROOT_DIR, section, 'index.html'));
  });
}

app.get(['/posts/:slug', '/posts/:slug/'], async (req, res) => {
  const { slug } = req.params;
  if (!isSafeSlug(slug)) {
    res.status(404).send('Not found');
    return;
  }
  await sendGeneratedHtml(res, path.join(ROOT_DIR, 'posts', slug, 'index.html'));
});

app.use('/posts', express.static(path.join(ROOT_DIR, 'posts')));
app.get('/favicon.ico', async (_req, res) => {
  await sendBinary(res, path.join(ROOT_DIR, 'favicon.ico'), 'image/x-icon');
});

app.use((error, _req, res, _next) => {
  const statusCode = Number(error?.statusCode || 400);
  const message = error instanceof Error ? error.message : String(error?.message || 'Unknown error');
  res.status(statusCode).json({ error: message });
});

async function start() {
  try {
    const posts = await loadPosts();
    await ensureCategoryRegistry({ posts });
    await buildSite();
  } catch (error) {
    console.error('Initial build failed:', error);
    process.exit(1);
  }

  app.listen(ADMIN_PORT, ADMIN_HOST, () => {
    console.log(`Server running at http://${ADMIN_HOST}:${ADMIN_PORT} (admin: /admin)`);
  });
}

start();
