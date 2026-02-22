(function () {
  'use strict';

  const container = document.querySelector('#post-content[data-markdown-src]');
  if (!container) return;

  function stripFrontmatter(markdown) {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  }

  function renderError(message) {
    container.innerHTML = `<p>${message}</p>`;
  }

  function highlightCodeBlocks() {
    if (!window.hljs || typeof window.hljs.highlightElement !== 'function') return;

    const blocks = container.querySelectorAll('pre code');
    blocks.forEach((block) => window.hljs.highlightElement(block));
  }

  async function renderPostMarkdown() {
    const src = container.getAttribute('data-markdown-src');
    if (!src) return;

    if (typeof window.markdownit !== 'function') {
      renderError('Markdown 渲染器加载失败。');
      return;
    }

    try {
      const response = await fetch(src, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch markdown: ${response.status}`);
      }

      const raw = await response.text();
      const body = stripFrontmatter(raw).trim();

      const md = window.markdownit({
        html: false,
        linkify: true,
        typographer: false,
      });

      container.innerHTML = md.render(body);
      highlightCodeBlocks();
    } catch (error) {
      renderError('正文加载失败，请稍后重试。');
      console.error(error);
    }
  }

  renderPostMarkdown();
})();
