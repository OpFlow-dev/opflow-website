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
  fields: {
    slug: document.getElementById('slug'),
    title: document.getElementById('title'),
    date: document.getElementById('date'),
    category: document.getElementById('category'),
    tags: document.getElementById('tags'),
    summary: document.getElementById('summary'),
    content: document.getElementById('content'),
  },
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? '#8d2b1f' : '#1f1a16';
}

async function api(path, options = {}) {
  const response = await fetch(`/admin/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
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
    category: '',
    tags: [],
    summary: '',
    content: '',
  };

  elements.fields.slug.value = data.slug;
  elements.fields.title.value = data.title;
  elements.fields.date.value = data.date;
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
      return `<li class="post-item${activeClass}" data-slug="${post.slug}"><strong>${post.title}</strong><p>${post.date} · ${post.slug}</p></li>`;
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

checkSession().catch((error) => setStatus(error.message, true));
