(function () {
  'use strict';

  var backToTopBtn = document.querySelector('.back-to-top');
  var navLinks = document.querySelectorAll('.site-nav a');

  function normalizePath(path) {
    if (!path) return '/';
    var p = path.replace(/\/index\.html$/, '/');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  function initBackToTop() {
    if (!backToTopBtn) return;

    function toggleBackToTop() {
      if (window.scrollY > 260) backToTopBtn.classList.add('visible');
      else backToTopBtn.classList.remove('visible');
    }

    backToTopBtn.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    toggleBackToTop();
  }

  function initActiveNavFallback() {
    if (!navLinks.length) return;

    var hasAriaCurrent = Array.prototype.some.call(navLinks, function (link) {
      return link.getAttribute('aria-current') === 'page';
    });
    if (hasAriaCurrent) return;

    var current = normalizePath(window.location.pathname);
    Array.prototype.forEach.call(navLinks, function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var linkPath = normalizePath(new URL(href, window.location.href).pathname);
      if (linkPath === current) {
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function init() {
    initBackToTop();
    initActiveNavFallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
