/* global app */
import { load } from 'cheerio';

const base = 'https://mangakatana.com';
const referer = `${base}/`;
const adultGenres = new Set(['adult', 'ecchi', 'erotica', 'loli', 'sexual violence', 'shota']);

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

function hasAdultGenre(genres) {
  return genres.some((genre) => adultGenres.has(genre.toLowerCase()));
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
    if (!id || !title || seen.has(id) || hasAdultGenre(genres)) return;
    if (genre && !genres.some((value) => genre.includes(value.toLowerCase()))) return;
    seen.add(id);
    items.push({
      id,
      title,
      coverUrl: coverUrl(card.find('.wrap_img img').first().attr('src')),
    });
  });
  return items;
}

function hasNextPage($, page) {
  return $('a[href]')
    .toArray()
    .some((link) => {
      const url = new URL($(link).attr('href'), base);
      return url.origin === base && url.pathname === `/page/${page + 1}`;
    });
}

function assertSafe($) {
  const genres = $('div.genres a')
    .map((_, genre) => $(genre).text().trim())
    .get();
  if (hasAdultGenre(genres)) throw new Error('Ce titre n’est pas disponible dans la source sûre.');
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
        { title: 'Dernières mises à jour', items: cardItems($).slice(0, 30) },
        { title: 'Action et aventure', items: cardItems($, ['action', 'adventure']).slice(0, 30) },
      ],
    };
  },

  async catalog(page) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const $ = await document(current === 1 ? '/' : `/page/${current}`);
    return {
      items: cardItems($).slice(0, 30),
      hasMore: hasNextPage($, current),
      sorts: [{ id: 'updated', title: 'Mises à jour récentes' }],
    };
  },

  async manga(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Manga MangaKatana inconnu.');
    const $ = await document(path);
    assertSafe($);
    const title = $('h1.heading').first().text().trim();
    if (!title) throw new Error('Fiche MangaKatana indisponible.');
    const description = $('.summary p').first().text().trim().slice(0, 4000);
    return {
      id: path,
      title,
      coverUrl: coverUrl($('img[alt="[Cover]"]').first().attr('src')),
      description: description || undefined,
    };
  },

  async chapters(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Manga MangaKatana inconnu.');
    const $ = await document(path);
    assertSafe($);
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
