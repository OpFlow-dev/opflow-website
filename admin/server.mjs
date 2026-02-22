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
const uploadDir = path.join(assetsDir, 'uploads');

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

app.post('/admin/api/posts', requireAuth, async (req, res, next) => {
  try {
    const payload = normalizePostPayload(req.body);
    const existing = await loadPosts();
    if (findPost(existing, payload.slug)) {
      res.status(409).json({ error: 'slug already exists' });
      return;
    }

    await writePost(payload);
    const buildResult = await buildSite();
    res.status(201).json({ ok: true, post: payload, build: buildResult });
  } catch (error) {
    next(error);
  }
});

app.put('/admin/api/posts/:slug', requireAuth, async (req, res, next) => {
  try {
    const currentSlug = req.params.slug;
    const posts = await loadPosts();
    const existing = findPost(posts, currentSlug);
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const payload = normalizePostPayload(req.body, { allowSlugMismatch: true, slugFromPath: currentSlug });

    if (payload.slug !== currentSlug && findPost(posts, payload.slug)) {
      res.status(409).json({ error: 'new slug already exists' });
      return;
    }

    await writePost(payload);
    if (payload.slug !== currentSlug) {
      await deletePostMarkdown(currentSlug);
      await removePostOutput(currentSlug);
    }

    const buildResult = await buildSite();
    res.json({ ok: true, post: payload, build: buildResult });
  } catch (error) {
    next(error);
  }
});

app.delete('/admin/api/posts/:slug', requireAuth, async (req, res, next) => {
  try {
    const posts = await loadPosts();
    if (!findPost(posts, req.params.slug)) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    await deletePostMarkdown(req.params.slug);
    await removePostOutput(req.params.slug);
    const buildResult = await buildSite();
    res.json({ ok: true, build: buildResult });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/api/taxonomy', requireAuth, async (_req, res, next) => {
  try {
    const posts = await loadPosts();
    res.json(buildTaxonomy(posts));
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
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(400).json({ error: message });
});

async function start() {
  try {
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
