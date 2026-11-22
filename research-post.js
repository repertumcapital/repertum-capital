function getPostId() {
  const url = new URL(window.location.href);
  return url.searchParams.get('id');
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

function renderBlocks(blocks) {
  return (blocks || []).map(renderContentBlock).join('');
}

/* Analyses separate facts from opinion: "facts" and "opinion" arrays are
   rendered under their own headings. "content" is kept for free-form text. */
function renderPostBody(post) {
  const parts = [];
  if (post.content && post.content.length) parts.push(renderBlocks(post.content));
  if (post.facts && post.facts.length) {
    parts.push(`<section class="analysis-part analysis-part--facts"><h2>Facts</h2><p class="analysis-part__note">Reported figures and events, with sources where given.</p>${renderBlocks(post.facts)}</section>`);
  }
  if (post.opinion && post.opinion.length) {
    parts.push(`<section class="analysis-part analysis-part--opinion"><h2>My opinion</h2><p class="analysis-part__note">My personal assessment. Not a recommendation.</p>${renderBlocks(post.opinion)}</section>`);
  }
  if (!parts.length && post.pdf) {
    parts.push(`<p>The full analysis, including the separation of facts and my opinion, is in the PDF.</p>`);
  }
  return parts.join('');
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
    const posts = await loadResearchPosts();
    const post = posts.find(entry => entry.id === postId);

    if (!post) {
      notFound.style.display = 'block';
      return;
    }

    document.title = `${post.title} | Repertum Capital`;

    document.getElementById('postTitle').textContent = post.title;
    document.getElementById('postExcerpt').textContent = post.excerpt || '';

    document.getElementById('postMeta').innerHTML = `
      <span>${formatPostDate(post.date)}</span>
      <span>By ${escapeHtml(post.author || DEFAULT_AUTHOR)}</span>
      ${post.ticker ? `<span>Ticker: ${escapeHtml(post.ticker)}</span>` : ''}
      <span>${escapeHtml(post.category || 'Research')}</span>
    `;

    document.getElementById('postTags').innerHTML = [
      tickerBadge(post),
      positionHeldBadge(post),
      ...(post.tags || []).map(createTagBadge)
    ].join('');

    const imageWrap = document.getElementById('postHeroImageWrap');
    const image = document.getElementById('postHeroImage');
    if (post.image) {
      image.src = post.image;
      image.alt = post.title;
      imageWrap.style.display = 'block';
    }

    document.getElementById('postDisclosure').innerHTML = `
      <strong>${positionHeldLabel(post)}.</strong>
      ${post.positionNote ? escapeHtml(post.positionNote) + ' ' : ''}
      Author: ${escapeHtml(post.author || DEFAULT_AUTHOR)} · Published: ${formatPostDate(post.date)}${post.updated ? ` · Updated: ${formatPostDate(post.updated)}` : ''}
    `;

    document.getElementById('postActions').innerHTML = `
      <div class="note" style="font-style: normal;">${escapeHtml(post.category || 'Research')}</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        ${post.pdf ? `<a href="${escapeHtml(post.pdf)}" class="btn btn--outline-dark" target="_blank" rel="noopener noreferrer">Download PDF</a>` : ''}
        <a href="research.html" class="btn btn--outline-dark">All analyses</a>
      </div>
    `;

    document.getElementById('postBody').innerHTML = renderPostBody(post);

    wrapper.style.display = 'block';
  } catch (error) {
    console.error(error);
    notFound.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', initResearchPost);
