const state = {
  posts: [],
  filtered: [],
  selectedSlug: null,
};

const md = window.markdownit({ html: true, linkify: true, breaks: true });

const elements = {
  loginPanel: document.getElementById('login-panel'),
  workspace: document.getElementById('workspace'),
  loginForm: document.getElementById('login-form'),
  password: document.getElementById('password'),
  postList: document.getElementById('post-list'),
  search: document.getElementById('search'),
  form: document.getElementById('editor-form'),
  status: document.getElementById('status'),
  rebuildBtn: document.getElementById('rebuild-btn'),
  newBtn: document.getElementById('new-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  preview: document.getElementById('preview'),
  toolbar: document.querySelector('.toolbar'),
  imageUploadInput: document.getElementById('image-upload-input'),
  fields: {
    slug: document.getElementById('slug'),
    title: document.getElementById('title'),
    date: document.getElementById('date'),
    status: document.getElementById('status-field'),
    category: document.getElementById('category'),
    tags: document.getElementById('tags'),
    summary: document.getElementById('summary'),
    content: document.getElementById('content'),
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? '#8d2b1f' : '#1f1a16';
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/admin/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function readForm() {
  return {
    slug: elements.fields.slug.value.trim(),
    title: elements.fields.title.value.trim(),
    date: elements.fields.date.value.trim(),
    status: elements.fields.status.value,
    category: elements.fields.category.value.trim(),
    tags: elements.fields.tags.value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    summary: elements.fields.summary.value.trim(),
    content: elements.fields.content.value,
  };
}

function writeForm(post) {
  const data = post || {
    slug: '',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    status: 'published',
    category: '',
    tags: [],
    summary: '',
    content: '',
  };

  elements.fields.slug.value = data.slug;
  elements.fields.title.value = data.title;
  elements.fields.date.value = data.date;
  elements.fields.status.value = data.status || 'published';
  elements.fields.category.value = data.category;
  elements.fields.tags.value = (data.tags || []).join(', ');
  elements.fields.summary.value = data.summary;
  elements.fields.content.value = data.content;
  updatePreview();
}

function updatePreview() {
  elements.preview.innerHTML = md.render(elements.fields.content.value || '');
}

function renderList() {
  const query = elements.search.value.trim().toLowerCase();
  state.filtered = state.posts.filter((post) => {
    if (!query) return true;
    return post.title.toLowerCase().includes(query) || post.slug.toLowerCase().includes(query);
  });

  elements.postList.innerHTML = state.filtered
    .map((post) => {
      const activeClass = post.slug === state.selectedSlug ? ' active' : '';
      const status = post.status || 'published';
      const draftClass = status === 'draft' ? ' draft' : '';
      return `<li class="post-item${activeClass}${draftClass}" data-slug="${escapeHtml(post.slug)}"><strong>${escapeHtml(post.title)}</strong><p class="meta-line"><span>${escapeHtml(post.date)} · ${escapeHtml(post.slug)}</span><span class="badge status-${status}">${escapeHtml(status)}</span></p></li>`;
    })
    .join('');
}

async function loadPosts(selectSlug = null) {
  const payload = await api('/posts');
  state.posts = payload.posts || [];
  state.posts.sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
  if (selectSlug) {
    state.selectedSlug = selectSlug;
  } else if (!state.selectedSlug && state.posts[0]) {
    state.selectedSlug = state.posts[0].slug;
  }
  renderList();

  if (state.selectedSlug) {
    await selectPost(state.selectedSlug);
  } else {
    writeForm(null);
  }
}

async function selectPost(slug) {
  state.selectedSlug = slug;
  renderList();
  const payload = await api(`/posts/${encodeURIComponent(slug)}`);
  writeForm(payload.post);
}

async function checkSession() {
  const me = await api('/me');
  if (me.authenticated) {
    elements.loginPanel.classList.add('hidden');
    elements.workspace.classList.remove('hidden');
    await loadPosts();
  } else {
    elements.loginPanel.classList.remove('hidden');
    elements.workspace.classList.add('hidden');
  }
}

function replaceSelection({ prefix = '', suffix = '', placeholder = '' }) {
  const textarea = elements.fields.content;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const insertion = `${prefix}${selected || placeholder}${suffix}`;
  textarea.setRangeText(insertion, start, end, 'end');
  if (!selected && placeholder) {
    const cursorStart = start + prefix.length;
    const cursorEnd = cursorStart + placeholder.length;
    textarea.setSelectionRange(cursorStart, cursorEnd);
  }
  textarea.focus();
  updatePreview();
}

function prefixSelectedLines(prefix) {
  const textarea = elements.fields.content;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;

  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndRaw = text.indexOf('\n', end);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;

  const block = text.slice(lineStart, lineEnd);
  const updated = block
    .split('\n')
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join('\n');

  textarea.setRangeText(updated, lineStart, lineEnd, 'end');
  textarea.focus();
  updatePreview();
}

function applyTool(tool) {
  if (tool === 'h2') {
    replaceSelection({ prefix: '## ', placeholder: 'Heading' });
    return;
  }
  if (tool === 'bold') {
    replaceSelection({ prefix: '**', suffix: '**', placeholder: 'bold text' });
    return;
  }
  if (tool === 'italic') {
    replaceSelection({ prefix: '*', suffix: '*', placeholder: 'italic text' });
    return;
  }
  if (tool === 'code') {
    replaceSelection({ prefix: '`', suffix: '`', placeholder: 'code' });
    return;
  }
  if (tool === 'link') {
    replaceSelection({ prefix: '[', suffix: '](https://example.com)', placeholder: 'link text' });
    return;
  }
  if (tool === 'quote') {
    prefixSelectedLines('> ');
    return;
  }
  if (tool === 'ul') {
    prefixSelectedLines('- ');
    return;
  }
  if (tool === 'code-block') {
    replaceSelection({ prefix: '\n```\n', suffix: '\n```\n', placeholder: 'code here' });
    return;
  }
  if (tool === 'image-upload') {
    elements.imageUploadInput.click();
  }
}

async function uploadImageAndInsert(file) {
  const fd = new FormData();
  fd.append('image', file);
  const payload = await api('/upload-image', {
    method: 'POST',
    body: fd,
  });

  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'image';
  const markdown = `![${baseName}](${payload.url})`;
  replaceSelection({ prefix: markdown });
  setStatus(`Image uploaded: ${payload.url}`);
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/login', {
      method: 'POST',
      body: JSON.stringify({ password: elements.password.value }),
    });
    elements.password.value = '';
    setStatus('Logged in');
    await checkSession();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.search.addEventListener('input', renderList);

elements.postList.addEventListener('click', async (event) => {
  const item = event.target.closest('.post-item');
  if (!item) return;
  const { slug } = item.dataset;
  if (!slug) return;

  try {
    await selectPost(slug);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.newBtn.addEventListener('click', () => {
  state.selectedSlug = null;
  writeForm(null);
  renderList();
});

elements.rebuildBtn.addEventListener('click', async () => {
  try {
    const payload = await api('/rebuild', { method: 'POST', body: JSON.stringify({}) });
    setStatus(`Rebuilt ${payload.build.postCount} posts`);
    await loadPosts(state.selectedSlug);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.logoutBtn.addEventListener('click', async () => {
  try {
    await api('/logout', { method: 'POST', body: JSON.stringify({}) });
    state.selectedSlug = null;
    setStatus('Logged out');
    await checkSession();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = readForm();

  try {
    if (state.selectedSlug) {
      await api(`/posts/${encodeURIComponent(state.selectedSlug)}`, {
        method: 'PUT',
        body: JSON.stringify(formData),
      });
      setStatus('Post updated and site rebuilt');
    } else {
      await api('/posts', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setStatus('Post created and site rebuilt');
    }

    state.selectedSlug = formData.slug;
    await loadPosts(formData.slug);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.deleteBtn.addEventListener('click', async () => {
  if (!state.selectedSlug) {
    setStatus('Select a post to delete', true);
    return;
  }

  if (!window.confirm(`Delete post ${state.selectedSlug}?`)) {
    return;
  }

  try {
    await api(`/posts/${encodeURIComponent(state.selectedSlug)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    setStatus('Post deleted and site rebuilt');
    state.selectedSlug = null;
    await loadPosts();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.fields.content.addEventListener('input', updatePreview);

elements.toolbar.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-tool]');
  if (!btn) return;
  applyTool(btn.dataset.tool);
});

elements.imageUploadInput.addEventListener('change', async () => {
  const [file] = elements.imageUploadInput.files || [];
  elements.imageUploadInput.value = '';
  if (!file) return;

  try {
    await uploadImageAndInsert(file);
  } catch (error) {
    setStatus(error.message, true);
  }
});

checkSession().catch((error) => setStatus(error.message, true));
