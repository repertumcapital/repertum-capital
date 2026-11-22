const POSTS_PER_PAGE = 6;

function getQueryPage() {
  const url = new URL(window.location.href);
  const page = Number(url.searchParams.get('page') || '1');
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function createPostCard(post) {
  const title = escapeHtml(post.title);
  const category = escapeHtml(post.category || 'Research');
  const imageStyle = post.image ? '' : 'background: linear-gradient(135deg, var(--color-primary), #0f1c38);';
  const imageHtml = post.image
    ? `<img src="${escapeHtml(post.image)}" alt="${title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">`
    : `<span class="article-card__img-label">${category}</span>`;

  return `
    <a href="research-post.html?id=${encodeURIComponent(post.id)}" class="article-card">
      <div class="article-card__img" style="${imageStyle}">
        ${imageHtml}
        ${post.image ? `<span class="article-card__img-label">${category}</span>` : ''}
      </div>
      <div class="article-card__body">
        <div class="article-card__tags">
          ${tickerBadge(post)}
          ${positionHeldBadge(post)}
          ${(post.tags || []).slice(0, 2).map(createTagBadge).join('')}
        </div>
        <h3 class="article-card__title">${title}</h3>
        <p class="article-card__excerpt">${escapeHtml(post.excerpt || '')}</p>
        <div class="article-card__meta">
          <span>${formatPostDate(post.date)} · ${escapeHtml(post.author || DEFAULT_AUTHOR)}${post.pdf ? ' · PDF' : ''}</span>
          <span class="article-card__read-more">Read →</span>
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
    const sortedPosts = await loadResearchPosts();
    const currentPage = getQueryPage();
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const paginatedPosts = sortedPosts.slice(start, start + POSTS_PER_PAGE);

    meta.textContent = `${sortedPosts.length} analys${sortedPosts.length === 1 ? 'is' : 'es'}`;

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
    meta.textContent = 'Analyses could not be loaded right now.';
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', initResearchPage);