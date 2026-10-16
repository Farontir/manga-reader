/* global app */
import { load } from 'cheerio';
import {
  category,
  hasExcludedGenre,
  ratingFromGenres,
} from '../../scripts/source-classification.js';

const base = 'https://weebcentral.com';
function seriesPath(value) {
  try {
    const url = new URL(value, base);
    return url.origin === base && /^\/series\/[0-9A-Z]{26}\/[a-z0-9-]+$/i.test(url.pathname)
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}

function chapterPath(value) {
  try {
    const url = new URL(value, base);
    return url.origin === base && /^\/chapters\/[0-9A-Z]{26}$/i.test(url.pathname)
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}

function image(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'temp.compsci88.com'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

async function html(path) {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`WeebCentral HTTP ${response.status}`);
  return response.body;
}

async function document(path) {
  return load(await html(path));
}

function cardItems($, listingTag) {
  const result = [];
  const seen = new Set();
  $('article.bg-base-300').each((_, element) => {
    const card = $(element);
    const link = card.find('a.line-clamp-1[href*="/series/"]').first();
    const id = seriesPath(link.attr('href'));
    const title = link.text().trim();
    if (!id || !title || seen.has(id)) return;
    const genres = listingTag ? [listingTag] : [];
    if (hasExcludedGenre(genres)) return;
    seen.add(id);
    const rating = ratingFromGenres(genres);
    result.push({
      id,
      title,
      coverUrl: image(card.find('picture img').first().attr('src')),
      genres,
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return result;
}

function searchPath(term, page = 1, tag) {
  const params = new URLSearchParams({ limit: '32', offset: String((page - 1) * 32) });
  if (term) params.set('text', term);
  if (tag) params.set('included_tag', tag);
  return `/search/data?${params}`;
}

function genreLinks($) {
  const genres = [];
  $('a[href*="included_tag="]').each((_, el) => {
    const value = new URL($(el).attr('href'), base).searchParams.get('included_tag');
    if (value && !genres.includes(value)) genres.push(value);
  });
  return genres;
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    return cardItems(await document(searchPath(term))).slice(0, 50);
  },
  async manga(id) {
    const path = seriesPath(id);
    if (!path) throw new Error('Série WeebCentral inconnue.');
    const $ = await document(path);
    const title = $('h1').first().text().trim();
    if (!title) throw new Error('Fiche WeebCentral indisponible.');
    const genres = genreLinks($);
    if (hasExcludedGenre(genres)) throw new Error('Titre indisponible dans cette source.');
    const rating = ratingFromGenres(genres);
    return {
      id: path,
      title,
      coverUrl: image($('meta[property="og:image"]').attr('content')),
      description: $('meta[name="description"]').attr('content')?.trim().slice(0, 4000),
      genres,
      authors: $('a[href*="author="]')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      ...(rating ? { contentRating: rating } : {}),
    };
  },
  async chapters(id) {
    const path = seriesPath(id);
    if (!path) throw new Error('Série WeebCentral inconnue.');
    const $ = await document(`${path.split('/').slice(0, 3).join('/')}/full-chapter-list`);
    const result = [];
    $('a[href*="/chapters/"]').each((_, el) => {
      const link = $(el);
      const chapterId = chapterPath(link.attr('href'));
      const title = link.find('span.grow > span').first().text().trim() || link.text().trim();
      const number = Number(
        /(?:chapter|chapitre)\s*(\d+(?:[.,]\d+)?)/i.exec(title)?.[1]?.replace(',', '.'),
      );
      const publishedAt = link.find('time').attr('datetime');
      if (chapterId && Number.isFinite(number) && number > 0)
        result.push({
          id: chapterId,
          number,
          title,
          language: 'en',
          publishedAt:
            publishedAt && Number.isFinite(Date.parse(publishedAt))
              ? new Date(publishedAt).toISOString()
              : undefined,
        });
    });
    return result;
  },
  async pages(id) {
    const path = chapterPath(id);
    if (!path) throw new Error('Chapitre WeebCentral inconnu.');
    const $ = await document(`${path}/images?is_prev=False`);
    const pages = $('img[src]')
      .map((_, el) => image($(el).attr('src')))
      .get()
      .filter(Boolean);
    if (!pages.length) throw new Error('Aucune page WeebCentral disponible.');
    return pages.map((url) => ({ url, headers: { Referer: `${base}/` } }));
  },
  async discover() {
    const [recent, action, searchPage] = await Promise.all([
      document(searchPath('', 1)),
      document(searchPath('', 1, 'Action')),
      document('/search'),
    ]);
    const genres = new Map();
    searchPage('input[type="hidden"][id^="tag-"][value]').each((_, el) => {
      const tag = searchPage(el).attr('value')?.trim();
      if (tag && tag.length <= 60 && !hasExcludedGenre([tag])) {
        genres.set(tag, category(`tag:${tag}`, tag));
      }
    });
    return {
      sections: [
        { title: 'Catalogue', items: cardItems(recent).slice(0, 32), more: 'updated' },
        { title: 'Action', items: cardItems(action, 'Action').slice(0, 32), more: 'tag:Action' },
      ],
      genres: [...genres.values()],
    };
  },
  async catalog(page, listing) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const selected = listing || 'updated';
    let tag;
    if (selected.startsWith('tag:')) {
      tag = selected.slice(4);
      if (!tag || tag.length > 60 || hasExcludedGenre([tag]))
        throw new Error('Catégorie WeebCentral inconnue.');
    } else if (selected !== 'updated') throw new Error('Catalogue WeebCentral inconnu.');
    const $ = await document(searchPath('', current, tag));
    return {
      items: cardItems($, tag),
      hasMore: $('button[hx-get*="offset="]').length > 0,
      sorts: [{ id: 'updated', title: 'Catalogue' }],
    };
  },
  async health() {
    try {
      return cardItems(await document(searchPath('', 1))).length > 0;
    } catch {
      return false;
    }
  },
};
