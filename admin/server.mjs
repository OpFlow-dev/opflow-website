#!/usr/bin/env node
import crypto from 'node:crypto';
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
    const metadata = posts.map(({ slug, title, date, category, tags, summary }) => ({
      slug,
      title,
      date,
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

app.use('/admin', express.static(adminPublicDir));

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(400).json({ error: message });
});

app.listen(ADMIN_PORT, ADMIN_HOST, () => {
  console.log(`Admin server running at http://${ADMIN_HOST}:${ADMIN_PORT}/admin`);
});
