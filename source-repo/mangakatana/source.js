/* global app */
import { load } from 'cheerio';
import { category, ratingFromGenres } from '../../scripts/source-classification.js';

const base = 'https://mangakatana.com';
const referer = `${base}/`;
const excludedGenres = new Set(['loli', 'shota', 'lolicon', 'shotacon']);

function mangaPath(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    return url.origin === base && /^\/manga\/[a-z0-9-]+\.\d+\/?$/i.test(url.pathname)
      ? url.pathname.replace(/\/$/, '')
      : null;
  } catch {
    return null;
  }
}

function chapterPath(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    return url.origin === base && /^\/manga\/[a-z0-9-]+\.\d+\/c[a-z0-9.-]+\/?$/i.test(url.pathname)
      ? url.pathname.replace(/\/$/, '')
      : null;
  } catch {
    return null;
  }
}

function coverUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value, base);
    return url.origin === base && /^\/imgs\/cover\/.+\.(?:png|jpe?g|webp)$/i.test(url.pathname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function pageUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      /^i\d+\.mangakatana\.com$/i.test(url.hostname) &&
      /^\/token\/.+\.(?:png|jpe?g|webp)$/i.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function document(path) {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MangaKatana HTTP ${response.status}`);
  }
  return load(response.body);
}

function cardItems($, genre) {
  const seen = new Set();
  const items = [];
  $('#book_list .item').each((_, element) => {
    const card = $(element);
    const link = card.find('h3.title a[href]').first();
    const id = mangaPath(link.attr('href'));
    const title = link.text().trim();
    const genres = card
      .find('.genres a')
      .map((__, genre) => $(genre).text().trim())
      .get();
    if (
      !id ||
      !title ||
      seen.has(id) ||
      genres.some((value) => excludedGenres.has(value.toLowerCase()))
    )
      return;
    if (genre && !genres.some((value) => genre.includes(value.toLowerCase()))) return;
    seen.add(id);
    const rating = ratingFromGenres(genres);
    items.push({
      id,
      title,
      coverUrl: coverUrl(card.find('.wrap_img img').first().attr('src')),
      genres,
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return items;
}

function genresFrom($) {
  const genres = new Map();
  $('a[href*="/genre/"]').each((_, link) => {
    const href = $(link).attr('href');
    if (!href) return;
    const url = new URL(href, base);
    const match = url.origin === base && /^\/genre\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    const title = $(link).text().trim();
    if (match && title && !excludedGenres.has(match[1]) && !genres.has(match[1]))
      genres.set(match[1], title);
  });
  return [...genres].map(([slug, title]) => category(`genre:${slug}`, title));
}

function hasNextPage($, page, prefix = '') {
  return $('a[href]')
    .toArray()
    .some((link) => {
      const url = new URL($(link).attr('href'), base);
      return url.origin === base && url.pathname === `${prefix}/page/${page + 1}`;
    });
}

function detailValue($, label) {
  return $('.d-cell-small.label')
    .filter((_, element) => $(element).text().trim() === label)
    .first()
    .next('.value');
}

function assertAllowed($) {
  const genres = detailValue($, 'Genres:')
    .find('.genres a')
    .map((_, link) => $(link).text().trim().toLowerCase())
    .get();
  if (genres.some((genre) => excludedGenres.has(genre))) {
    throw new Error('Ce titre n’est pas disponible dans cette source.');
  }
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    const $ = await document(`/?search=${encodeURIComponent(term)}&search_by=m_name`);
    return cardItems($).slice(0, 30);
  },

  async recommendations() {
    const $ = await document('/');
    return { title: 'Dernières mises à jour MangaKatana', items: cardItems($).slice(0, 30) };
  },

  async discover() {
    const $ = await document('/');
    return {
      sections: [
        { title: 'Dernières mises à jour', items: cardItems($).slice(0, 30), more: 'updated' },
        { title: 'Action', items: cardItems($, ['action']).slice(0, 30), more: 'genre:action' },
      ],
      genres: genresFrom($),
    };
  },

  async catalog(page, sort) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const genre =
      typeof sort === 'string' && sort.startsWith('genre:') ? sort.slice('genre:'.length) : null;
    if (genre !== null && (!/^[a-z0-9-]{1,80}$/.test(genre) || excludedGenres.has(genre))) {
      throw new Error('Genre MangaKatana inconnu.');
    }
    const prefix = genre ? `/genre/${genre}` : '';
    const path = current === 1 ? prefix || '/' : `${prefix}/page/${current}`;
    const $ = await document(path);
    return {
      items: cardItems($).slice(0, 30),
      hasMore: hasNextPage($, current, prefix),
      sorts: [{ id: 'updated', title: 'Mises à jour récentes' }],
    };
  },

  async manga(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Manga MangaKatana inconnu.');
    const $ = await document(path);
    assertAllowed($);
    const title = $('h1.heading').first().text().trim();
    if (!title) throw new Error('Fiche MangaKatana indisponible.');
    const description = $('.summary p').first().text().trim().slice(0, 4000);
    const genres = [
      ...new Set(
        detailValue($, 'Genres:')
          .find('.genres a')
          .map((_, link) => $(link).text().trim())
          .get(),
      ),
    ]
      .filter(Boolean)
      .slice(0, 30);
    const authors = [
      ...new Set(
        detailValue($, 'Author(s) / Artist(s):')
          .text()
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);
    const rating = ratingFromGenres(genres);
    return {
      id: path,
      title,
      coverUrl: coverUrl($('img[alt="[Cover]"]').first().attr('src')),
      description: description || undefined,
      genres,
      authors,
      ...(rating ? { contentRating: rating } : {}),
    };
  },

  async chapters(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Manga MangaKatana inconnu.');
    const $ = await document(path);
    assertAllowed($);
    const chapters = [];
    $('.chapters tr').each((_, row) => {
      const link = $(row).find('.chapter a[href]').first();
      const chapterId = chapterPath(link.attr('href'));
      const title = link.text().trim();
      const match = /^Chapter\s+(\d+(?:\.\d+)?)/i.exec(title);
      if (!chapterId || !chapterId.startsWith(`${path}/`) || !match) return;
      const date = Date.parse($(row).find('.update_time').first().text().trim());
      chapters.push({
        id: chapterId,
        number: Number(match[1]),
        title,
        language: 'en',
        publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : undefined,
      });
    });
    return chapters;
  },

  async pages(id) {
    const path = chapterPath(id);
    if (!path) throw new Error('Chapitre MangaKatana inconnu.');
    const $ = await document(path);
    const script = $('script')
      .map((_, element) => $(element).html() ?? '')
      .get()
      .find((value) => /\bvar thzq\s*=/.test(value));
    const array = /\bvar thzq\s*=\s*(\[[\s\S]*?\]);/.exec(script ?? '')?.[1];
    if (!array) throw new Error('Liste des pages MangaKatana indisponible.');
    const seen = new Set();
    const pages = [];
    for (const match of array.matchAll(/'([^']+)'/g)) {
      const url = pageUrl(match[1]);
      if (url && !seen.has(url)) {
        seen.add(url);
        pages.push({ url, headers: { Referer: referer } });
      }
    }
    if (!pages.length) throw new Error('Ce chapitre MangaKatana ne propose pas de pages lisibles.');
    return pages;
  },

  async health() {
    try {
      return cardItems(await document('/')).length > 0;
    } catch {
      return false;
    }
  },
};
