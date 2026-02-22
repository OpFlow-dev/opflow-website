document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.typo > table').forEach((table) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'overflow-x-scroll';
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  if (window.innerWidth >= 1024) {
    document.querySelectorAll('.typo img').forEach((img) => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        const big = document.createElement('img');
        big.src = img.src;
        big.alt = img.alt || '';
        overlay.appendChild(big);
        overlay.addEventListener('click', () => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });
        document.body.appendChild(overlay);
      });
    });
  }

  const topBtn = document.getElementById('top-btn');
  if (topBtn) {
    topBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  window.w4096 = {
    showMessage(message, level = 'primary', timeout = 3000) {
      const el = document.createElement('div');
      el.className = `message-global ${level}`;
      el.innerText = message;
      document.body.appendChild(el);
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, timeout);
    }
  };
});
