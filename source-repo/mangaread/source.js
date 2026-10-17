/* global app */
import { load } from 'cheerio';
import { category, hasExcludedGenre, ratingFromGenres } from '../../scripts/source-classification.js';

const base = 'https://www.mangaread.org';
const sorts = [
  { id: 'updated', title: 'Mises à jour' },
  { id: 'popular', title: 'Populaires' },
  { id: 'new', title: 'Nouveautés' },
];

function pathOf(value, chapter = false) {
  try {
    const url = new URL(value, base);
    const pattern = chapter
      ? /^\/manga\/[a-z0-9-]+\/chapter-[a-z0-9-]+\/$/i
      : /^\/manga\/[a-z0-9-]+\/$/i;
    return url.origin === base && pattern.test(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

function image(value) {
  try {
    const url = new URL(String(value).trim(), base);
    return url.protocol === 'https:' && url.hostname === 'www.mangaread.org' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function coverImage(element) {
  const srcset = element.attr('data-srcset') || element.attr('srcset') || '';
  const candidates = [...srcset.matchAll(/(?:^|,)\s*(\S+)\s+(\d+)w\s*(?=,|$)/g)]
    .map((match) => ({ url: image(match[1]), width: Number(match[2]) }))
    .filter((candidate) => candidate.url && Number.isSafeInteger(candidate.width))
    .sort((a, b) => a.width - b.width);
  const best = candidates.find((candidate) => candidate.width >= 600) || candidates[candidates.length - 1];
  return best?.url || image(element.attr('data-src') || element.attr('src'));
}

function dateOf(value) {
  const match = /^(\d+)\s+(min(?:ute)?s?|hours?|days?|weeks?|months?|years?)\s+ago$/i.exec(value);
  if (match) {
    const unit = match[2].toLowerCase();
    const minutes = unit.startsWith('min') ? 1 : unit.startsWith('hour') ? 60 : unit.startsWith('day') ? 1440 : unit.startsWith('week') ? 10080 : unit.startsWith('month') ? 43200 : 525600;
    return new Date(Date.now() - Number(match[1]) * minutes * 60_000).toISOString();
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

async function document(path) {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300) throw new Error(`MangaRead HTTP ${response.status}`);
  return load(response.body);
}

function cards($, selector, listingGenre) {
  const seen = new Set();
  const items = [];
  $(selector).each((_, element) => {
    const card = $(element);
    const link = card.find('.post-title a[href]').first();
    const id = pathOf(link.attr('href'));
    const title = link.text().trim();
    if (!id || !title || seen.has(id)) return;
    const genres = card.find('a[href*="/genres/"]').map((__, anchor) => $(anchor).text().trim()).get().filter(Boolean);
    if (hasExcludedGenre(genres)) return;
    seen.add(id);
    const rating = ratingFromGenres([...genres, listingGenre]);
    items.push({
      id, title,
      coverUrl: coverImage(card.find('.item-thumb img, .tab-thumb img').first()),
      ...(genres.length ? { genres: [...new Set(genres)].slice(0, 20) } : {}),
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return items;
}

function genres($) {
  const result = new Map();
  $('a[href*="/genres/"]').each((_, anchor) => {
    const url = new URL($(anchor).attr('href'), base);
    const match = url.origin === base && /^\/genres\/([a-z0-9-]+)\/$/.exec(url.pathname);
    const title = $(anchor).text().trim();
    if (match && title && title.length <= 30 && !hasExcludedGenre([match[1], title])) result.set(match[1], category(`genre:${match[1]}`, title));
  });
  return [...result.values()].slice(0, 500);
}

function listingPath(page, listing) {
  const selected = listing || 'updated';
  const pagePart = page > 1 ? `page/${page}/` : '';
  if (selected.startsWith('genre:')) {
    const genre = selected.slice(6);
    if (!/^[a-z0-9-]{1,80}$/.test(genre) || hasExcludedGenre([genre])) throw new Error('Genre MangaRead inconnu.');
    return { path: `/genres/${genre}/${pagePart}`, genre };
  }
  if (!sorts.some((sort) => sort.id === selected)) throw new Error('Tri MangaRead inconnu.');
  const order = selected === 'popular' ? '?m_orderby=views' : selected === 'new' ? '?m_orderby=new-manga' : '';
  return { path: `/manga/${pagePart}${order}`, genre: null };
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    const $ = await document(`/?s=${encodeURIComponent(term)}&post_type=wp-manga`);
    return cards($, '.c-tabs-item__content').slice(0, 50);
  },
  async manga(id) {
    const path = pathOf(id);
    if (!path) throw new Error('Manga MangaRead inconnu.');
    const $ = await document(path);
    const title = $('.post-title h1').first().text().trim();
    if (!title) throw new Error('Fiche MangaRead indisponible.');
    const mangaGenres = $('.genres-content a[rel="tag"]').map((_, anchor) => $(anchor).text().trim()).get().filter(Boolean).slice(0, 20);
    if (hasExcludedGenre(mangaGenres)) throw new Error('Titre indisponible dans cette source.');
    const rating = ratingFromGenres(mangaGenres);
    const authors = $('.author-content a').map((_, anchor) => $(anchor).text().trim()).get().filter(Boolean).slice(0, 20);
    return {
      id: path, title,
      coverUrl: coverImage($('.summary_image img').first()),
      description: $('.summary__content').first().text().trim().slice(0, 4000) || undefined,
      genres: mangaGenres, authors,
      ...(rating ? { contentRating: rating } : {}),
    };
  },
  async chapters(id) {
    const path = pathOf(id);
    if (!path) throw new Error('Manga MangaRead inconnu.');
    const $ = await document(path);
    if (hasExcludedGenre($('.genres-content a').map((_, anchor) => $(anchor).text().trim()).get())) throw new Error('Titre indisponible dans cette source.');
    const result = [];
    $('.listing-chapters_wrap li.wp-manga-chapter').each((_, element) => {
      const row = $(element);
      const link = row.find('a[href]').first();
      const chapterId = pathOf(link.attr('href'), true);
      const title = link.text().trim();
      const number = Number(/(?:chapter|chap)\s*(\d+(?:[.-]\d+)?)/i.exec(title)?.[1]?.replace('-', '.'));
      if (!chapterId || !chapterId.startsWith(path) || !Number.isFinite(number)) return;
      result.push({ id: chapterId, number, title, language: 'en', publishedAt: dateOf(row.find('.chapter-release-date').text().trim()) });
    });
    return result;
  },
  async pages(id) {
    const path = pathOf(id, true);
    if (!path) throw new Error('Chapitre MangaRead inconnu.');
    const $ = await document(path);
    const pages = $('.reading-content img.wp-manga-chapter-img').map((_, element) => image($(element).attr('data-src') || $(element).attr('src'))).get().filter(Boolean);
    if (!pages.length) throw new Error('Aucune page MangaRead disponible.');
    return pages;
  },
  async discover() {
    const [latest, popular] = await Promise.all([document('/manga/'), document('/manga/?m_orderby=views')]);
    return { sections: [
      { title: 'Dernières mises à jour', items: cards(latest, '.page-item-detail').slice(0, 30), more: 'updated' },
      { title: 'Populaires', items: cards(popular, '.page-item-detail').slice(0, 30), more: 'popular' },
    ], genres: genres(latest) };
  },
  async catalog(page, listing) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const { path, genre } = listingPath(current, listing);
    const $ = await document(path);
    return { items: cards($, '.page-item-detail', genre).slice(0, 100), hasMore: $(`a[href*="/page/${current + 1}/"]`).length > 0, sorts };
  },
  async health() {
    try { return cards(await document('/manga/'), '.page-item-detail').length > 0; } catch { return false; }
  },
};
