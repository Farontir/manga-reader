/* global app */
import { load } from 'cheerio';

const base = 'https://asurascans.com';
const imageHost = 'cdn.asurascans.com';

// HTML contract: browse cover cards identify series, numeric chapter links identify
// chapters, and chapter-page images identify freely readable pages. Never build a
// URL from unvalidated IDs or follow content outside the two declared hosts.
function seriesPath(value) {
  if (typeof value !== 'string') return null;
  const url = new URL(value, base);
  return url.origin === base && /^\/comics\/[a-z0-9-]+-[a-f0-9]{8}\/?$/i.test(url.pathname)
    ? url.pathname.replace(/\/$/, '')
    : null;
}

function chapterPath(value) {
  if (typeof value !== 'string') return null;
  const url = new URL(value, base);
  return url.origin === base &&
    /^\/comics\/[a-z0-9-]+-[a-f0-9]{8}\/chapter\/\d+(?:\.\d+)?\/?$/i.test(url.pathname)
    ? url.pathname.replace(/\/$/, '')
    : null;
}

function imageUrl(value, section) {
  if (!value) return null;
  const url = new URL(value, base);
  return url.protocol === 'https:' &&
    url.hostname === imageHost &&
    url.pathname.startsWith(`/asura-images/${section}/`) &&
    /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)
    ? url.toString()
    : null;
}

async function document(path) {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Asura Scans HTTP ${response.status}`);
  }
  return load(response.body);
}

function browseItems($) {
  const seen = new Set();
  const items = [];
  $('a[href^="/comics/"] img[src*="/asura-images/covers/"]').each((_, image) => {
    const cover = $(image);
    const id = seriesPath(cover.closest('a').attr('href'));
    const title = cover.attr('alt')?.trim();
    const coverUrl = imageUrl(cover.attr('src'), 'covers');
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    items.push({ id, title, coverUrl: coverUrl ?? undefined });
  });
  return items.slice(0, 30);
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    const $ = await document(`/browse?search=${encodeURIComponent(term)}`);
    return browseItems($);
  },

  async recommendations() {
    const $ = await document('/browse?sort=popular');
    return { title: 'Populaires sur Asura Scans', items: browseItems($) };
  },

  async discover() {
    const [popular, browse] = await Promise.all([
      document('/browse?sort=popular'),
      document('/browse'),
    ]);
    return {
      sections: [
        { title: 'Populaires', items: browseItems(popular) },
        { title: 'À découvrir', items: browseItems(browse) },
      ],
    };
  },

  async catalog(page, sort) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const sorts = [
      { id: 'recent', title: 'Mises à jour récentes' },
      { id: 'popular', title: 'Populaires' },
    ];
    const popular = sort === 'popular';
    const query = [popular ? 'sort=popular' : null, current > 1 ? `page=${current}` : null]
      .filter(Boolean)
      .join('&');
    const $ = await document(`/browse${query ? `?${query}` : ''}`);
    const items = browseItems($);
    const total = Number($('#series-count').attr('data-total'));
    const hasMore = Number.isFinite(total)
      ? current * 20 < total
      : $(`a[aria-label="Page ${current + 1}"]`).length > 0;
    return { items, hasMore, sorts };
  },

  async manga(id) {
    const path = seriesPath(id);
    if (!path) throw new Error('Série Asura Scans inconnue.');
    const $ = await document(path);
    const title = $('h1').first().text().trim();
    if (!title) throw new Error('Fiche Asura Scans indisponible.');
    const coverUrl = imageUrl($('img[src*="/asura-images/covers/"]').first().attr('src'), 'covers');
    const altTitles = $('#alt-titles')
      .text()
      .split('•')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
    const description = $('#description-text').text().trim();
    return {
      id: path,
      title,
      altTitles,
      coverUrl: coverUrl ?? undefined,
      description: description || undefined,
    };
  },

  async chapters(id) {
    const path = seriesPath(id);
    if (!path) throw new Error('Série Asura Scans inconnue.');
    const $ = await document(path);
    const chapters = [];
    const seen = new Set();
    $(`a[href^="${path}/chapter/"]`).each((_, link) => {
      const chapterId = chapterPath($(link).attr('href'));
      if (!chapterId || seen.has(chapterId)) return;
      const number = Number(chapterId.slice(chapterId.lastIndexOf('/') + 1));
      if (!Number.isFinite(number)) return;
      seen.add(chapterId);
      const subtitle = $(link).find('span.block.truncate').first().text().trim();
      chapters.push({
        id: chapterId,
        number,
        title: subtitle ? `Chapitre ${number} · ${subtitle}` : `Chapitre ${number}`,
        language: 'en',
      });
    });
    return chapters;
  },

  async pages(id) {
    const path = chapterPath(id);
    if (!path) throw new Error('Chapitre Asura Scans inconnu.');
    const $ = await document(path);
    const pages = [];
    const seen = new Set();
    $('img[src*="/asura-images/chapters/"]').each((_, image) => {
      const url = imageUrl($(image).attr('src'), 'chapters');
      if (url && !seen.has(url)) {
        seen.add(url);
        pages.push(url);
      }
    });
    if (!pages.length) throw new Error('Ce chapitre ne propose pas de pages publiques.');
    return pages;
  },

  async health() {
    try {
      const $ = await document('/browse?sort=popular');
      return browseItems($).length > 0;
    } catch {
      return false;
    }
  },
};
