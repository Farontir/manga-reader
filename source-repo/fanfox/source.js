/* global app */
import { load } from 'cheerio';
import {
  category,
  hasExcludedGenre,
  ratingFromGenres,
} from '../../scripts/source-classification.js';

const base = 'https://fanfox.net';
const mobile = 'https://m.fanfox.net';

function mangaPath(value) {
  try {
    const url = new URL(value, base);
    return ['fanfox.net', 'm.fanfox.net'].includes(url.hostname) &&
      /^\/manga\/[a-z0-9_]+\/?$/i.test(url.pathname)
      ? `${url.pathname.replace(/\/$/, '')}/`
      : null;
  } catch {
    return null;
  }
}

function chapterPath(value) {
  try {
    const url = new URL(value, base);
    return ['fanfox.net', 'm.fanfox.net'].includes(url.hostname) &&
      /^\/manga\/[a-z0-9_]+\/(?:v[a-z0-9.]+\/)?c[\d.]+\/1\.html$/i.test(url.pathname)
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}

function image(value, cover = false) {
  try {
    const url = new URL(value, mobile);
    if (url.protocol !== 'https:') return undefined;
    if (cover && url.hostname === 'fmcdn.mfcdn.net') {
      // Fanfox adds short-lived token/ttl parameters to covers. The CDN also
      // serves the same image without them when the Fanfox Referer is sent.
      const version = url.searchParams.get('v');
      url.search = '';
      if (version && /^\d{1,15}$/.test(version)) url.searchParams.set('v', version);
      return url.href;
    }
    if (!cover && (url.hostname === 'zjcdn.mangafox.me' || url.hostname.endsWith('.mangafox.me')))
      return url.href;
    return undefined;
  } catch {
    return undefined;
  }
}

async function document(path, mobileSite = false) {
  const response = await app.fetch(`${mobileSite ? mobile : base}${path}`, {
    headers: { Accept: 'text/html' },
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Fanfox HTTP ${response.status}`);
  return load(response.body);
}

function cards($, selector, listingGenre) {
  const result = [];
  const seen = new Set();
  $(selector).each((_, el) => {
    const card = $(el);
    const link = card.find('.manga-list-1-item-title a[href], .cover-info .title').first();
    const parent = link.is('a') ? link : card.find('a[href*="/manga/"]').first();
    const id = mangaPath(parent.attr('href'));
    const title = parent.attr('title')?.trim() || link.text().trim();
    if (!id || !title || seen.has(id)) return;
    const genres = listingGenre ? [listingGenre] : [];
    seen.add(id);
    const rating = ratingFromGenres(genres);
    result.push({
      id,
      title,
      coverUrl: image(card.find('img.manga-list-1-cover, .cover img').first().attr('src'), true),
      genres,
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return result;
}

function mobileCards($) {
  const result = [];
  const seen = new Set();
  $('a[href*="/manga/"]').each((_, el) => {
    const card = $(el);
    const id = mangaPath(card.attr('href'));
    const title =
      card.find('img[title]').attr('title')?.trim() ||
      card.find('.cover-info .title').text().trim();
    if (!id || !title || seen.has(id)) return;
    const genres = card
      .find('.cover-info p')
      .eq(1)
      .text()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (hasExcludedGenre(genres)) return;
    seen.add(id);
    const rating = ratingFromGenres(genres);
    result.push({
      id,
      title,
      coverUrl: image(card.find('.cover img').attr('src'), true),
      genres,
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return result;
}

function genres($) {
  const found = new Map();
  $('a[href*="/directory/"]').each((_, el) => {
    const link = $(el);
    const url = new URL(link.attr('href'), base);
    const match = url.origin === base && /^\/directory\/([a-z0-9-]+)\/$/.exec(url.pathname);
    const title = link.text().trim();
    if (match && title && title.length <= 30 && !hasExcludedGenre([title, match[1]]))
      found.set(match[1], category(`genre:${match[1]}`, title));
  });
  return [...found.values()];
}

function listingPath(page, listing) {
  const selected = listing || 'updated';
  if (selected === 'updated')
    return { path: `/directory/${page > 1 ? `${page}.html` : ''}`, genre: null };
  if (selected.startsWith('genre:')) {
    const genre = selected.slice(6);
    if (!/^[a-z0-9-]{1,60}$/.test(genre) || hasExcludedGenre([genre]))
      throw new Error('Genre Fanfox inconnu.');
    return { path: `/directory/${genre}/${page > 1 ? `${page}.html` : ''}`, genre };
  }
  throw new Error('Catalogue Fanfox inconnu.');
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    return mobileCards(await document(`/search?k=${encodeURIComponent(term)}`, true)).slice(0, 50);
  },
  async manga(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Série Fanfox inconnue.');
    const $ = await document(path);
    const title = $('.detail-info-right-title-font').first().text().trim();
    if (!title) throw new Error('Fiche Fanfox indisponible.');
    const mangaGenres = $('.detail-info-right-tag-list a[href*="/directory/"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    if (hasExcludedGenre(mangaGenres)) throw new Error('Titre indisponible dans cette source.');
    const rating = ratingFromGenres(mangaGenres);
    return {
      id: path,
      title,
      coverUrl: image($('.detail-info-cover img, .detail-info img').first().attr('src'), true),
      description:
        $('.detail-info-right-content').first().text().trim().slice(0, 4000) || undefined,
      genres: mangaGenres,
      authors: $('.detail-info-right-say a')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      ...(rating ? { contentRating: rating } : {}),
    };
  },
  async chapters(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Série Fanfox inconnue.');
    const $ = await document(path);
    if (
      hasExcludedGenre(
        $('.detail-info-right-tag-list a')
          .map((_, el) => $(el).text().trim())
          .get(),
      )
    )
      throw new Error('Titre indisponible dans cette source.');
    const result = [];
    $('.detail-main-list a[href]').each((_, el) => {
      const link = $(el);
      const chapterId = chapterPath(link.attr('href'));
      const title = link.attr('title')?.trim() || link.find('.title3').text().trim();
      const number = Number(/Ch\.(\d+(?:\.\d+)?)/i.exec(title)?.[1]);
      const dateText = link.find('.title2').text().trim();
      const timestamp = Date.parse(dateText);
      if (chapterId && chapterId.startsWith(path) && Number.isFinite(number) && number > 0)
        result.push({
          id: chapterId,
          number,
          title,
          language: 'en',
          publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined,
        });
    });
    return [...new Map(result.map((chapter) => [chapter.id, chapter])).values()];
  },
  async pages(id) {
    const path = chapterPath(id);
    if (!path) throw new Error('Chapitre Fanfox inconnu.');
    const $ = await document(path.replace(/^\/manga\//, '/roll_manga/'), true);
    const result = $('#viewer img.reader-page[data-original]')
      .map((_, el) => image($(el).attr('data-original')))
      .get()
      .filter(Boolean);
    if (!result.length) throw new Error('Aucune page Fanfox disponible.');
    return result.map((url) => ({ url, headers: { Referer: `${mobile}/` } }));
  },
  async discover() {
    const [latest, action] = await Promise.all([
      document('/directory/'),
      document('/directory/action/'),
    ]);
    return {
      sections: [
        {
          title: 'Catalogue',
          items: cards(latest, '.manga-list-1-list li').slice(0, 30),
          more: 'updated',
        },
        {
          title: 'Action',
          items: cards(action, '.manga-list-1-list li', 'Action').slice(0, 30),
          more: 'genre:action',
        },
      ],
      genres: genres(latest),
    };
  },
  async catalog(page, listing) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const { path, genre } = listingPath(current, listing);
    const $ = await document(path);
    return {
      items: cards($, '.manga-list-1-list li', genre),
      hasMore: $(`a[href$="/${current + 1}.html"]`).length > 0,
      sorts: [{ id: 'updated', title: 'Catalogue' }],
    };
  },
  async health() {
    try {
      return cards(await document('/directory/'), '.manga-list-1-list li').length > 0;
    } catch {
      return false;
    }
  },
};
