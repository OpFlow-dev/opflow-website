(function () {
  'use strict';

  const container = document.querySelector('#post-content[data-markdown-src]');
  if (!container) return;

  let mermaidInitialized = false;

  function stripFrontmatter(markdown) {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  }

  function renderError(message) {
    container.innerHTML = `<p>${message}</p>`;
  }

  function highlightCodeBlocks() {
    if (!window.hljs || typeof window.hljs.highlightElement !== 'function') return;

    const blocks = container.querySelectorAll('pre code:not(.language-mermaid):not(.lang-mermaid)');
    blocks.forEach((block) => window.hljs.highlightElement(block));
  }

  async function renderMermaidBlocks() {
    if (!window.mermaid || typeof window.mermaid.initialize !== 'function') return;

    const blocks = container.querySelectorAll('pre code.language-mermaid, pre code.lang-mermaid');
    if (!blocks.length) return;

    if (!mermaidInitialized) {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
      });
      mermaidInitialized = true;
    }

    const nodes = [];
    blocks.forEach((block) => {
      const pre = block.closest('pre');
      if (!pre) return;

      const host = document.createElement('div');
      host.className = 'mermaid';
      host.textContent = block.textContent || '';

      pre.replaceWith(host);
      nodes.push(host);
    });

    if (!nodes.length) return;

    try {
      await window.mermaid.run({ nodes });
    } catch (error) {
      console.error('[mermaid] render failed', error);
    }
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
      await renderMermaidBlocks();
      highlightCodeBlocks();
    } catch (error) {
      renderError('正文加载失败，请稍后重试。');
      console.error(error);
    }
  }

  renderPostMarkdown();
})();
