/* Shared helpers for research.html and research-post.html.
   Analyses are listed in data/research-posts.json (schema: data/README.md). */

const RESEARCH_DATA_URL = 'data/research-posts.json';
const DEFAULT_AUTHOR = 'Timo Held';

async function loadResearchPosts() {
  const response = await fetch(RESEARCH_DATA_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${RESEARCH_DATA_URL} (HTTP ${response.status})`);
  }
  const posts = await response.json();
  if (!Array.isArray(posts)) {
    throw new Error(`${RESEARCH_DATA_URL} must contain a JSON array`);
  }
  return posts
    .filter(post => post && post.id && post.title)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPostDate(dateString) {
  // "2026-11-24" → "24 Nov 2026". Parsed by hand so the visitor's time zone
  // cannot shift the day and every browser shows the same month names.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString || ''));
  if (!match) return dateString || 'Undated';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = Number(match[2]);
  if (month < 1 || month > 12) return dateString;
  return `${Number(match[3])} ${months[month - 1]} ${match[1]}`;
}

/* "Position held: Yes / No". A missing value is shown as such on purpose,
   so an analysis is never published without the disclosure being visible. */
function positionHeldLabel(post) {
  if (post.positionHeld === true) return 'Position held: Yes';
  if (post.positionHeld === false) return 'Position held: No';
  return 'Position held: not stated';
}

function positionHeldBadge(post) {
  const cls = post.positionHeld === true ? 'badge--navy'
    : post.positionHeld === false ? 'badge--gray'
    : 'badge--red';
  return `<span class="badge ${cls}">${positionHeldLabel(post)}</span>`;
}

function tickerBadge(post) {
  return post.ticker ? `<span class="badge badge--gold">${escapeHtml(post.ticker)}</span>` : '';
}

function createTagBadge(tag) {
  const normalized = String(tag).toLowerCase();
  let cls = 'badge badge--gray';
  if (['equity research', 'equity', 'technology', 'industrials', 'pharma', 'healthcare'].includes(normalized)) cls = 'badge badge--navy';
  if (['macro', 'rates', 'zinsen', 'europe', 'dach'].includes(normalized)) cls = 'badge badge--gold';
  return `<span class="${cls}">${escapeHtml(tag)}</span>`;
}
