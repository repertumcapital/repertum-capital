const POSTS_PER_PAGE = 6;

function formatGermanDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function getQueryPage() {
  const url = new URL(window.location.href);
  const page = Number(url.searchParams.get('page') || '1');
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function createBadge(tag) {
  const normalized = String(tag).toLowerCase();
  let cls = 'badge badge--gray';

  if (['equity research', 'equity', 'technology', 'industrials', 'pharma'].includes(normalized)) cls = 'badge badge--navy';
  if (['macro', 'zinsen', 'europe', 'dach'].includes(normalized)) cls = 'badge badge--gold';
  if (['buy', 'healthcare', 'long'].includes(normalized)) cls = 'badge badge--green';

  return `<span class="${cls}">${tag}</span>`;
}

function createPostCard(post) {
  const imageStyle = post.image
    ? ''
    : 'background: linear-gradient(135deg, var(--color-primary), #0f1c38);';

  const imageHtml = post.image
    ? `<img src="${post.image}" alt="${post.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">`
    : `<span class="article-card__img-label">${post.category || 'Research'}</span>`;

  return `
    <a href="research-post.html?id=${encodeURIComponent(post.id)}" class="article-card">
      <div class="article-card__img" style="${imageStyle}">
        ${imageHtml}
        ${post.image ? `<span class="article-card__img-label">${post.category || 'Research'}</span>` : ''}
      </div>
      <div class="article-card__body">
        <div class="article-card__tags">
          ${(post.tags || []).slice(0, 3).map(createBadge).join('')}
        </div>
        <h3 class="article-card__title">${post.title}</h3>
        <p class="article-card__excerpt">${post.excerpt || ''}</p>
        <div class="article-card__meta">
          <span>${formatGermanDate(post.date)}${post.readTime ? ` · ${post.readTime}` : ''}</span>
          <span class="article-card__read-more">Lesen →</span>
        </div>
      </div>
    </a>
  `;
}

function renderPagination(totalPosts, currentPage) {
  const pagination = document.getElementById('researchPagination');
  const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);

  if (totalPages <= 1) {
    pagination.style.display = 'none';
    pagination.innerHTML = '';
    return;
  }

  pagination.style.display = 'flex';
  pagination.style.gap = '12px';
  pagination.style.flexWrap = 'wrap';
  pagination.style.justifyContent = 'center';

  const buttons = [];

  for (let i = 1; i <= totalPages; i += 1) {
    const active = i === currentPage;
    buttons.push(`
      <a href="research.html?page=${i}" class="btn ${active ? 'btn--primary' : 'btn--outline-dark'} btn--sm">
        ${i}
      </a>
    `);
  }

  pagination.innerHTML = buttons.join('');
}

async function initResearchPage() {
  const grid = document.getElementById('researchGrid');
  const emptyState = document.getElementById('researchEmptyState');
  const meta = document.getElementById('researchMeta');

  try {
    const response = await fetch('./data/research-posts.json', { cache: 'no-store' });
    const posts = await response.json();

    const sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
    const currentPage = getQueryPage();
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const paginatedPosts = sortedPosts.slice(start, start + POSTS_PER_PAGE);

    meta.textContent = `${sortedPosts.length} Beitrag${sortedPosts.length === 1 ? '' : 'e'} gesamt`;

    if (!sortedPosts.length) {
      emptyState.style.display = 'block';
      grid.innerHTML = '';
      renderPagination(0, 1);
      return;
    }

    emptyState.style.display = 'none';
    grid.innerHTML = paginatedPosts.map(createPostCard).join('');
    renderPagination(sortedPosts.length, currentPage);
  } catch (error) {
    emptyState.style.display = 'block';
    grid.innerHTML = '';
    meta.textContent = 'Beiträge konnten aktuell nicht geladen werden';
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', initResearchPage);