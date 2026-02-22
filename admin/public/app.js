const STATUS_LABEL = {
  published: '发布',
  draft: '草稿',
};

const DEFAULT_CATEGORY = '未分类';

const EMPTY_FORM = {
  slug: '',
  title: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'published',
  category: DEFAULT_CATEGORY,
  tags: [],
  summary: '',
  content: '',
};

const state = {
  posts: [],
  categories: [],
  filtered: [],
  selectedSlug: null,
  selectedSlugs: new Set(),
  collapsedCategories: new Set(),
};

const md = window.markdownit({ html: true, linkify: true, breaks: true });

const elements = {
  loginPanel: document.getElementById('login-panel'),
  workspace: document.getElementById('workspace'),
  loginForm: document.getElementById('login-form'),
  password: document.getElementById('password'),
  postTree: document.getElementById('post-tree'),
  search: document.getElementById('search'),
  form: document.getElementById('editor-form'),
  status: document.getElementById('status'),
  selectedCount: document.getElementById('selected-count'),
  bulkCategory: document.getElementById('bulk-category'),
  bulkCategoryBtn: document.getElementById('bulk-category-btn'),
  bulkStatus: document.getElementById('bulk-status'),
  bulkStatusBtn: document.getElementById('bulk-status-btn'),
  bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
  categoryCreateInput: document.getElementById('category-create-input'),
  categoryCreateBtn: document.getElementById('category-create-btn'),
  categoryDeleteSelect: document.getElementById('category-delete-select'),
  categoryDeleteBtn: document.getElementById('category-delete-btn'),
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
  elements.status.style.color = isError ? '#b42318' : '#334155';
}

function updateSelectedCount() {
  elements.selectedCount.textContent = `已选 ${state.selectedSlugs.size} 篇`;
}

function normalizeCategory(category) {
  return String(category || '').trim() || DEFAULT_CATEGORY;
}

function categoryCountMap() {
  return new Map(state.categories.map((item) => [item.name, item.count]));
}

function categoryNames() {
  const names = new Set(state.categories.map((item) => item.name));
  names.add(DEFAULT_CATEGORY);
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function renderCategorySelectOptions(select, options, currentValue) {
  select.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.value)}"${option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');

  if (currentValue && options.some((option) => !option.disabled && option.value === currentValue)) {
    select.value = currentValue;
  }
}

function renderCategoryControls() {
  const names = categoryNames();
  const currentEditorCategory = normalizeCategory(elements.fields.category.value);
  const currentBulkCategory = normalizeCategory(elements.bulkCategory.value);
  const currentDeleteCategory = elements.categoryDeleteSelect.value;

  renderCategorySelectOptions(
    elements.fields.category,
    names.map((name) => ({ value: name, label: name })),
    currentEditorCategory,
  );

  renderCategorySelectOptions(
    elements.bulkCategory,
    names.map((name) => ({ value: name, label: name })),
    currentBulkCategory,
  );

  const deletable = names.filter((name) => name !== DEFAULT_CATEGORY);
  const deleteOptions = [
    { value: '', label: '选择要删除的分类', disabled: true },
    ...deletable.map((name) => {
      const count = state.categories.find((item) => item.name === name)?.count || 0;
      return { value: name, label: `${name}（${count} 篇）` };
    }),
  ];

  renderCategorySelectOptions(elements.categoryDeleteSelect, deleteOptions, currentDeleteCategory);
  if (!elements.categoryDeleteSelect.value && deleteOptions[1]) {
    elements.categoryDeleteSelect.value = deleteOptions[1].value;
  }
  elements.categoryDeleteBtn.disabled = deletable.length === 0;
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
    const message = payload?.error || `请求失败（${response.status}）`;
    throw new Error(message);
  }

  return payload;
}

async function loadCategories() {
  const payload = await api('/categories');
  state.categories = (payload.categories || [])
    .map((item) => ({
      name: normalizeCategory(item.name),
      count: Number(item.count) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  renderCategoryControls();
}

function readForm() {
  return {
    slug: elements.fields.slug.value.trim(),
    title: elements.fields.title.value.trim(),
    date: elements.fields.date.value.trim(),
    status: elements.fields.status.value,
    category: normalizeCategory(elements.fields.category.value),
    tags: elements.fields.tags.value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    summary: elements.fields.summary.value.trim(),
    content: elements.fields.content.value,
  };
}

function writeForm(post) {
  const data = post || EMPTY_FORM;
  elements.fields.slug.value = data.slug;
  elements.fields.title.value = data.title;
  elements.fields.date.value = data.date;
  elements.fields.status.value = data.status || 'published';

  const formCategory = normalizeCategory(data.category);
  const names = categoryNames();
  elements.fields.category.value = names.includes(formCategory) ? formCategory : DEFAULT_CATEGORY;

  elements.fields.tags.value = (data.tags || []).join(', ');
  elements.fields.summary.value = data.summary;
  elements.fields.content.value = data.content;
  updatePreview();
}

function updatePreview() {
  elements.preview.innerHTML = md.render(elements.fields.content.value || '');
}

function getFilteredPosts() {
  const query = elements.search.value.trim().toLowerCase();
  return state.posts.filter((post) => {
    if (!query) return true;
    return (
      post.title.toLowerCase().includes(query)
      || post.slug.toLowerCase().includes(query)
      || normalizeCategory(post.category).toLowerCase().includes(query)
    );
  });
}

function buildCategoryTree(posts, query) {
  const categoryToPosts = new Map();
  for (const post of posts) {
    const category = normalizeCategory(post.category);
    if (!categoryToPosts.has(category)) categoryToPosts.set(category, []);
    categoryToPosts.get(category).push(post);
  }

  const known = categoryNames();
  for (const category of categoryToPosts.keys()) {
    if (!known.includes(category)) {
      known.push(category);
    }
  }

  const rows = known
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((category) => [category, categoryToPosts.get(category) || []]);

  for (const [, items] of rows) {
    items.sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
  }

  if (!query) return rows;
  return rows.filter(([category, items]) => items.length > 0 || category.toLowerCase().includes(query));
}

function renderTree() {
  const query = elements.search.value.trim().toLowerCase();
  state.filtered = getFilteredPosts();
  const categories = buildCategoryTree(state.filtered, query);
  const counts = categoryCountMap();

  if (!categories.length) {
    elements.postTree.innerHTML = '<li class="empty-tip">没有匹配的文章</li>';
    updateSelectedCount();
    return;
  }

  elements.postTree.innerHTML = categories
    .map(([category, posts]) => {
      const isCollapsed = state.collapsedCategories.has(category);
      const checkedInCategory = posts.filter((post) => state.selectedSlugs.has(post.slug)).length;
      const categoryCount = counts.get(category) ?? posts.length;

      return `
        <li class="category-node" data-category="${escapeHtml(category)}">
          <div class="category-head">
            <button type="button" class="category-toggle" data-action="toggle-category" data-category="${escapeHtml(category)}" title="展开或折叠分类" aria-label="展开或折叠分类">${isCollapsed ? '▸' : '▾'}</button>
            <input type="checkbox" class="category-checkbox" data-category="${escapeHtml(category)}" ${posts.length > 0 && checkedInCategory > 0 && checkedInCategory === posts.length ? 'checked' : ''} ${posts.length === 0 ? 'disabled' : ''}>
            <span class="category-name">${escapeHtml(category)}</span>
            <span class="category-count">${categoryCount} 篇</span>
          </div>
          <ul class="post-children ${isCollapsed ? 'hidden' : ''}">
            ${posts
              .map((post) => {
                const status = post.status || 'published';
                const isActive = post.slug === state.selectedSlug;
                return `
                  <li class="post-row${isActive ? ' active' : ''}${status === 'draft' ? ' draft' : ''}" data-slug="${escapeHtml(post.slug)}">
                    <input type="checkbox" class="post-checkbox" data-slug="${escapeHtml(post.slug)}" ${state.selectedSlugs.has(post.slug) ? 'checked' : ''}>
                    <button type="button" class="post-open" data-action="select-post" data-slug="${escapeHtml(post.slug)}">
                      <strong>${escapeHtml(post.title)}</strong>
                      <span class="post-meta">
                        <span>${escapeHtml(post.date)}</span>
                        <span class="badge status-${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
                      </span>
                    </button>
                  </li>
                `;
              })
              .join('')}
          </ul>
        </li>
      `;
    })
    .join('');

  updateSelectedCount();
}

async function loadPosts(selectSlug = null) {
  const payload = await api('/posts');
  state.posts = payload.posts || [];
  state.posts.sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));

  const allSlugs = new Set(state.posts.map((post) => post.slug));
  state.selectedSlugs = new Set([...state.selectedSlugs].filter((slug) => allSlugs.has(slug)));

  if (selectSlug && allSlugs.has(selectSlug)) {
    state.selectedSlug = selectSlug;
  } else if (!state.selectedSlug || !allSlugs.has(state.selectedSlug)) {
    state.selectedSlug = state.posts[0]?.slug || null;
  }

  renderTree();

  if (state.selectedSlug) {
    await selectPost(state.selectedSlug);
  } else {
    writeForm(null);
  }
}

async function refreshData(selectSlug = null) {
  await loadCategories();
  await loadPosts(selectSlug);
}

async function getPostDetails(slug) {
  const payload = await api(`/posts/${encodeURIComponent(slug)}`);
  return payload.post;
}

async function selectPost(slug) {
  state.selectedSlug = slug;
  renderTree();
  const post = await getPostDetails(slug);
  writeForm(post);
}

async function checkSession() {
  const me = await api('/me');
  if (me.authenticated) {
    elements.loginPanel.classList.add('hidden');
    elements.workspace.classList.remove('hidden');
    await refreshData();
  } else {
    elements.loginPanel.classList.remove('hidden');
    elements.workspace.classList.add('hidden');
    writeForm(null);
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
  if (tool === 'h2') return replaceSelection({ prefix: '## ', placeholder: '二级标题' });
  if (tool === 'bold') return replaceSelection({ prefix: '**', suffix: '**', placeholder: '加粗文本' });
  if (tool === 'italic') return replaceSelection({ prefix: '*', suffix: '*', placeholder: '斜体文本' });
  if (tool === 'code') return replaceSelection({ prefix: '`', suffix: '`', placeholder: '代码' });
  if (tool === 'link') return replaceSelection({ prefix: '[', suffix: '](https://example.com)', placeholder: '链接文本' });
  if (tool === 'quote') return prefixSelectedLines('> ');
  if (tool === 'ul') return prefixSelectedLines('- ');
  if (tool === 'code-block') return replaceSelection({ prefix: '\n```\n', suffix: '\n```\n', placeholder: 'code here' });
  if (tool === 'image-upload') elements.imageUploadInput.click();
}

async function uploadImageAndInsert(file) {
  const fd = new FormData();
  fd.append('image', file);
  const payload = await api('/upload-image', {
    method: 'POST',
    body: fd,
  });

  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'image';
  replaceSelection({ prefix: `![${baseName}](${payload.url})` });
  setStatus(`图片上传成功：${payload.url}`);
}

function getSelectedSlugs() {
  return [...state.selectedSlugs];
}

async function runBatch(selected, worker, doneMessage) {
  if (!selected.length) {
    setStatus('请先勾选要操作的文章', true);
    return;
  }

  const errors = [];
  for (const slug of selected) {
    try {
      await worker(slug);
    } catch (error) {
      errors.push(`${slug}: ${error.message}`);
    }
  }

  if (errors.length) {
    const preview = errors.slice(0, 3).join('；');
    const suffix = errors.length > 3 ? `；另有 ${errors.length - 3} 条失败` : '';
    setStatus(`批量操作部分失败（${errors.length}/${selected.length}）：${preview}${suffix}`, true);
  } else {
    setStatus(doneMessage);
  }

  await refreshData(state.selectedSlug);
}

async function batchUpdateCategory() {
  const category = normalizeCategory(elements.bulkCategory.value);
  const selected = getSelectedSlugs();
  await runBatch(
    selected,
    async (slug) => {
      const post = await getPostDetails(slug);
      await api(`/posts/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...post, category }),
      });
    },
    `批量改分类完成，共处理 ${selected.length} 篇`,
  );
}

async function batchUpdateStatus() {
  const status = elements.bulkStatus.value;
  const selected = getSelectedSlugs();
  await runBatch(
    selected,
    async (slug) => {
      const post = await getPostDetails(slug);
      await api(`/posts/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...post, status }),
      });
    },
    `批量改状态完成，已设为“${STATUS_LABEL[status] || status}”`,
  );
}

async function batchDelete() {
  const selected = getSelectedSlugs();
  if (!selected.length) {
    setStatus('请先勾选要删除的文章', true);
    return;
  }

  if (!window.confirm(`确认批量删除 ${selected.length} 篇文章吗？`)) {
    return;
  }

  await runBatch(
    selected,
    async (slug) => {
      await api(`/posts/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      });
      state.selectedSlugs.delete(slug);
      if (state.selectedSlug === slug) {
        state.selectedSlug = null;
      }
    },
    `批量删除完成，共删除 ${selected.length} 篇`,
  );
}

async function createCategory() {
  const name = elements.categoryCreateInput.value.trim();
  if (!name) {
    setStatus('请输入分类名', true);
    return;
  }

  await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  elements.categoryCreateInput.value = '';
  setStatus(`分类“${name}”已创建`);
  await refreshData(state.selectedSlug);
}

async function deleteCategory() {
  const name = elements.categoryDeleteSelect.value;
  if (!name) {
    setStatus('请先选择要删除的分类', true);
    return;
  }

  const meta = state.categories.find((item) => item.name === name);
  const count = meta?.count || 0;

  if (count > 0) {
    const ok = window.confirm(`分类“${name}”下有 ${count} 篇文章，删除后将默认迁移到“${DEFAULT_CATEGORY}”。是否继续？`);
    if (!ok) return;
    await api(`/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reassignTo: DEFAULT_CATEGORY }),
    });
    setStatus(`分类“${name}”已删除，${count} 篇文章已迁移到“${DEFAULT_CATEGORY}”`);
  } else {
    const ok = window.confirm(`确认删除空分类“${name}”吗？`);
    if (!ok) return;
    await api(`/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    setStatus(`分类“${name}”已删除`);
  }

  await refreshData(state.selectedSlug);
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/login', {
      method: 'POST',
      body: JSON.stringify({ password: elements.password.value }),
    });
    elements.password.value = '';
    setStatus('登录成功');
    await checkSession();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.search.addEventListener('input', renderTree);

elements.postTree.addEventListener('click', async (event) => {
  const toggleBtn = event.target.closest('[data-action="toggle-category"]');
  if (toggleBtn) {
    const category = toggleBtn.dataset.category;
    if (state.collapsedCategories.has(category)) {
      state.collapsedCategories.delete(category);
    } else {
      state.collapsedCategories.add(category);
    }
    renderTree();
    return;
  }

  const postBtn = event.target.closest('[data-action="select-post"]');
  if (!postBtn) return;

  const slug = postBtn.dataset.slug;
  if (!slug) return;

  try {
    await selectPost(slug);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.postTree.addEventListener('change', (event) => {
  const postCheckbox = event.target.closest('.post-checkbox');
  if (postCheckbox) {
    const slug = postCheckbox.dataset.slug;
    if (!slug) return;

    if (postCheckbox.checked) {
      state.selectedSlugs.add(slug);
    } else {
      state.selectedSlugs.delete(slug);
    }
    updateSelectedCount();
    return;
  }

  const categoryCheckbox = event.target.closest('.category-checkbox');
  if (!categoryCheckbox) return;

  const category = categoryCheckbox.dataset.category;
  const categoryPosts = state.filtered.filter((post) => normalizeCategory(post.category) === category);
  for (const post of categoryPosts) {
    if (categoryCheckbox.checked) {
      state.selectedSlugs.add(post.slug);
    } else {
      state.selectedSlugs.delete(post.slug);
    }
  }
  renderTree();
});

elements.newBtn.addEventListener('click', () => {
  state.selectedSlug = null;
  writeForm(null);
  renderTree();
});

elements.rebuildBtn.addEventListener('click', async () => {
  try {
    const payload = await api('/rebuild', { method: 'POST', body: JSON.stringify({}) });
    setStatus(`重建完成：共生成 ${payload.build.postCount} 篇文章`);
    await refreshData(state.selectedSlug);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.logoutBtn.addEventListener('click', async () => {
  try {
    await api('/logout', { method: 'POST', body: JSON.stringify({}) });
    state.selectedSlug = null;
    state.selectedSlugs.clear();
    setStatus('已退出登录');
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
      setStatus('文章已保存并重建站点');
      state.selectedSlugs.add(formData.slug);
    } else {
      await api('/posts', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setStatus('文章已创建并重建站点');
      state.selectedSlugs.add(formData.slug);
    }

    state.selectedSlug = formData.slug;
    await refreshData(formData.slug);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.deleteBtn.addEventListener('click', async () => {
  if (!state.selectedSlug) {
    setStatus('请先选择要删除的文章', true);
    return;
  }

  if (!window.confirm(`确认删除文章 ${state.selectedSlug} 吗？`)) {
    return;
  }

  try {
    await api(`/posts/${encodeURIComponent(state.selectedSlug)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    state.selectedSlugs.delete(state.selectedSlug);
    setStatus('文章已删除并重建站点');
    state.selectedSlug = null;
    await refreshData();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.bulkCategoryBtn.addEventListener('click', () => {
  batchUpdateCategory().catch((error) => setStatus(error.message, true));
});

elements.bulkStatusBtn.addEventListener('click', () => {
  batchUpdateStatus().catch((error) => setStatus(error.message, true));
});

elements.bulkDeleteBtn.addEventListener('click', () => {
  batchDelete().catch((error) => setStatus(error.message, true));
});

elements.categoryCreateBtn.addEventListener('click', () => {
  createCategory().catch((error) => setStatus(error.message, true));
});

elements.categoryCreateInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  createCategory().catch((error) => setStatus(error.message, true));
});

elements.categoryDeleteBtn.addEventListener('click', () => {
  deleteCategory().catch((error) => setStatus(error.message, true));
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
