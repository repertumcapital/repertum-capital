
(function () {
  'use strict';

  /* ─── THEME TOGGLE ─────────────────────────────────────── */
  const html = document.documentElement;

  // 1) gespeichertes Theme lesen oder System-Standard verwenden
  const savedTheme = localStorage.getItem('rc-theme');
  let theme = savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  // 2) auf <html> setzen
  html.setAttribute('data-theme', theme);

    function updateToggle(btn) {
      if (!btn) return;
      const isDark = theme === 'dark';
      btn.setAttribute('aria-label', 'Switch to ' + (isDark ? 'light' : 'dark') + ' mode');
      btn.innerHTML = isDark
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }

  document.addEventListener('DOMContentLoaded', function () {
    const toggleBtns = document.querySelectorAll('[data-theme-toggle]');
    toggleBtns.forEach(btn => {
      updateToggle(btn);
      btn.addEventListener('click', function () {
        theme = theme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', theme);
        localStorage.setItem('rc-theme', theme);
        /* theme stored in memory only */
        toggleBtns.forEach(updateToggle);
      });
    });

    /* ─── STICKY NAV SCROLL SHADOW ───────────────────────── */
    const nav = document.querySelector('.nav');
    if (nav) {
      const onScroll = () => {
        nav.classList.toggle('nav--scrolled', window.scrollY > 10);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* ─── MOBILE HAMBURGER ───────────────────────────────── */
    const hamburger = document.querySelector('.nav__hamburger');
    const mobileMenu = document.querySelector('.nav__mobile');
    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', function () {
        const open = hamburger.classList.toggle('open');
        mobileMenu.classList.toggle('open', open);
        hamburger.setAttribute('aria-expanded', open);
      });
      // Close on link click
      mobileMenu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          hamburger.classList.remove('open');
          mobileMenu.classList.remove('open');
        });
      });
    }

    /* ─── ACTIVE NAV LINK ────────────────────────────────── */
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__links a, .nav__mobile a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === currentPage ||
          (currentPage === '' && href === 'index.html') ||
          (currentPage === 'index.html' && href === 'index.html')) {
        a.classList.add('active');
      }
    });

    /* ─── FILTER BUTTONS ────────────────────────────────── */
    document.querySelectorAll('.filter-bar').forEach(bar => {
      bar.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.dataset.filter;
          const target = btn.closest('section') || document;
          target.querySelectorAll('[data-sector]').forEach(row => {
            row.style.display = (!filter || filter === 'all' || row.dataset.sector === filter) ? '' : 'none';
          });
          target.querySelectorAll('[data-tag]').forEach(card => {
            const tags = (card.dataset.tag || '').split(',');
            card.style.display = (!filter || filter === 'all' || tags.includes(filter)) ? '' : 'none';
          });
        });
      });
    });

    /* ─── CHART TABS ─────────────────────────────────────── */
    document.querySelectorAll('.chart-tabs').forEach(tabGroup => {
      tabGroup.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', function () {
          tabGroup.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
        });
      });
    });

    /* ─── SORTABLE TABLE ─────────────────────────────────── */
    document.querySelectorAll('.data-table').forEach(table => {
      const headers = table.querySelectorAll('th[data-sort]');
      headers.forEach(th => {
        th.innerHTML += '<span class="sort-icon">↕</span>';
        th.addEventListener('click', function () {
          const key = th.dataset.sort;
          const asc = th.dataset.sortDir !== 'asc';
          headers.forEach(h => { h.classList.remove('sorted'); h.dataset.sortDir = ''; });
          th.classList.add('sorted');
          th.dataset.sortDir = asc ? 'asc' : 'desc';
          th.querySelector('.sort-icon').textContent = asc ? '↑' : '↓';

          const tbody = table.querySelector('tbody');
          if (!tbody) return;
          const rows = Array.from(tbody.querySelectorAll('tr'));
          rows.sort((a, b) => {
            const aCell = a.querySelector(`td[data-val-${key}]`);
            const bCell = b.querySelector(`td[data-val-${key}]`);
            const aVal = aCell ? parseFloat(aCell.dataset[`val${key.charAt(0).toUpperCase()}${key.slice(1)}`]) || aCell.textContent.trim() : '';
            const bVal = bCell ? parseFloat(bCell.dataset[`val${key.charAt(0).toUpperCase()}${key.slice(1)}`]) || bCell.textContent.trim() : '';
            if (typeof aVal === 'number' && typeof bVal === 'number') {
              return asc ? aVal - bVal : bVal - aVal;
            }
            return asc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
          });
          rows.forEach(r => tbody.appendChild(r));
        });
      });
    });

    /* ─── CONTACT FORM ───────────────────────────────────── */
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const btn = contactForm.querySelector('button[type="submit"]');
        const orig = btn.textContent;
        btn.textContent = 'Nachricht gesendet ✓';
        btn.disabled = true;
        btn.style.background = 'var(--color-success)';
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; btn.style.background = ''; }, 4000);
      });
    }

    /* ─── SCROLL REVEAL ──────────────────────────────────── */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.animationPlayState = 'running';
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });
      document.querySelectorAll('.animate-fade-up').forEach(el => {
        el.style.animationPlayState = 'paused';
        io.observe(el);
      });
    }
  });
})();