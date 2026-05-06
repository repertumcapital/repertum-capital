function formatGermanDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function getPostId() {
  const url = new URL(window.location.href);
  return url.searchParams.get('id');
}

function createBadge(tag) {
  const normalized = String(tag).toLowerCase();
  let cls = 'badge badge--gray';

  if (['equity research', 'equity', 'technology', 'industrials', 'pharma'].includes(normalized)) cls = 'badge badge--navy';
  if (['macro', 'zinsen', 'europe', 'dach'].includes(normalized)) cls = 'badge badge--gold';
  if (['buy', 'healthcare', 'long'].includes(normalized)) cls = 'badge badge--green';

  return `<span class="${cls}">${tag}</span>`;
}

function renderContentBlock(block) {
  if (!block || !block.type) return '';

  switch (block.type) {
    case 'heading2':
      return `<h2>${block.text}</h2>`;
    case 'heading3':
      return `<h3>${block.text}</h3>`;
    case 'paragraph':
      return `<p>${block.text}</p>`;
    case 'quote':
      return `<blockquote>${block.text}</blockquote>`;
    case 'list':
      return `<ul>${(block.items || []).map(item => `<li>${item}</li>`).join('')}</ul>`;
    default:
      return '';
  }
}

async function initResearchPost() {
  const postId = getPostId();
  const notFound = document.getElementById('postNotFound');
  const wrapper = document.getElementById('postWrapper');

  if (!postId) {
    notFound.style.display = 'block';
    return;
  }

  try {
    const response = await fetch('./data/research-posts.json', { cache: 'no-store' });
    const posts = await response.json();
    const post = posts.find(entry => entry.id === postId);

    if (!post) {
      notFound.style.display = 'block';
      return;
    }

    document.title = `${post.title} | Repertum Capital Management`;

    document.getElementById('postTitle').textContent = post.title;
    document.getElementById('postExcerpt').textContent = post.excerpt || '';

    document.getElementById('postMeta').innerHTML = `
      <span>${formatGermanDate(post.date)}</span>
      ${post.readTime ? `<span>${post.readTime}</span>` : ''}
      <span>${post.category || 'Research'}</span>
    `;

    document.getElementById('postTags').innerHTML = (post.tags || []).map(createBadge).join('');

    const imageWrap = document.getElementById('postHeroImageWrap');
    const image = document.getElementById('postHeroImage');

    if (post.image) {
      image.src = post.image;
      image.alt = post.title;
      imageWrap.style.display = 'block';
    }

    const actions = document.getElementById('postActions');
    actions.innerHTML = `
      <div class="note" style="font-style: normal;">
        ${post.category || 'Research'}
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        ${post.pdf ? `<a href="${post.pdf}" class="btn btn--outline-dark" target="_blank" rel="noopener noreferrer">PDF öffnen</a>` : ''}
        <a href="research.html" class="btn btn--outline-dark">Zur Übersicht</a>
      </div>
    `;

    document.getElementById('postBody').innerHTML = (post.content || []).map(renderContentBlock).join('');

    wrapper.style.display = 'block';
  } catch (error) {
    console.error(error);
    notFound.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', initResearchPost);