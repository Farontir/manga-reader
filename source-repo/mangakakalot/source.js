/* global app */
import { load } from 'cheerio';

const base = 'https://www.mangakakalot.gg';
// Both sites expose the same chapter API and chapter paths. MangaKakalot's
// public HTML routes can return a Cloudflare challenge to native HTTP clients.
const mirror = 'https://www.mangabats.com';
const referer = `${base}/`;

// Keep stable path IDs so the primary and mirror can serve the same manga.
function mangaPath(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    return [base, mirror].includes(url.origin) && /^\/manga\/[a-z0-9-]+\/?$/i.test(url.pathname)
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
    return [base, mirror].includes(url.origin) &&
      /^\/manga\/[a-z0-9-]+\/chapter-[a-z0-9.-]+\/?$/i.test(url.pathname)
      ? url.pathname.replace(/\/$/, '')
      : null;
  } catch {
    return null;
  }
}

function imageUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)) return null;
    if (
      /(?:^|\.)2xstorage\.com$/i.test(url.hostname) ||
      /^(?:storage\d*\.)waitst\.com$/i.test(url.hostname)
    ) {
      return url.toString();
    }
  } catch {
    // Invalid image URL.
  }
  return null;
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function request(path, accept = 'text/html') {
  const options = { headers: { Accept: accept } };
  try {
    const primary = await app.fetch(`${base}${path}`, options);
    if (primary.status >= 200 && primary.status < 300) return primary;
  } catch {
    // Try the public mirror when the primary route is unavailable.
  }
  return app.fetch(`${mirror}${path}`, options);
}

async function document(path) {
  const response = await request(path);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MangaKakalot HTTP ${response.status}`);
  }
  return load(response.body);
}

function cardItems($) {
  const items = [];
  const seen = new Set();
  $('a.cover[href*="/manga/"] img').each((_, image) => {
    const cover = $(image);
    const id = mangaPath(cover.closest('a').attr('href'));
    const title = cover.attr('alt')?.trim();
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    const coverUrl = imageUrl(cover.attr('data-src') || cover.attr('src'));
    items.push({ id, title, coverUrl: coverUrl ?? undefined });
  });
  return items;
}

async function exactTitle(query) {
  const slug = slugify(query);
  if (!slug) return null;
  const response = await request(`/manga/${slug}`);
  if (response.status !== 200) return null;
  const $ = load(response.body);
  const title = $('h1').first().text().trim();
  if (!title || slugify(title) !== slug) return null;
  const coverUrl = imageUrl($('meta[property="og:image"]').attr('content'));
  return { id: `/manga/${slug}`, title, coverUrl: coverUrl ?? undefined };
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    const results = [];
    const seen = new Set();
    const add = (item) => {
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    };
    try {
      add(await exactTitle(term));
    } catch {
      // Continue with the site's search and public lists.
    }
    if (results.length) return results;
    try {
      const response = await request(
        `/home/search/json?searchword=${encodeURIComponent(slugify(term).replace(/-/g, '_'))}`,
        'application/json',
      );
      if (response.status === 200) {
        const suggestions = JSON.parse(response.body);
        if (Array.isArray(suggestions)) {
          for (const suggestion of suggestions) {
            const id = mangaPath(suggestion.url);
            const title = typeof suggestion.name === 'string' ? suggestion.name.trim() : '';
            if (id && title) {
              const coverUrl = imageUrl(suggestion.thumb);
              add({ id, title, coverUrl: coverUrl ?? undefined });
            }
          }
        }
      }
    } catch {
      // Exact titles and public lists remain usable if search is challenged.
    }
    if (results.length < 10) {
      const needle = slugify(term);
      for (const path of ['/', '/manga-list/hot-manga', '/manga-list/latest-manga']) {
        try {
          const $ = await document(path);
          for (const item of cardItems($)) {
            if (slugify(item.title).includes(needle)) add(item);
          }
        } catch {
          // A single listing must not hide the matches already found.
        }
      }
    }
    return results.slice(0, 30);
  },

  async recommendations() {
    const $ = await document('/');
    return { title: 'Populaires sur MangaKakalot', items: cardItems($).slice(0, 30) };
  },

  async discover() {
    const [home, latest] = await Promise.all([document('/'), document('/manga-list/latest-manga')]);
    return {
      sections: [
        { title: 'Populaires', items: cardItems(home).slice(0, 30) },
        { title: 'Dernières mises à jour', items: cardItems(latest).slice(0, 30) },
      ],
    };
  },

  async manga(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Manga MangaKakalot inconnu.');
    const $ = await document(path);
    const title = $('h1').first().text().trim();
    if (!title) throw new Error('Fiche MangaKakalot indisponible.');
    const coverUrl = imageUrl($('meta[property="og:image"]').attr('content'));
    const description = load($('#contentBox').text()).text().trim().slice(0, 4000);
    return {
      id: path,
      title,
      coverUrl: coverUrl ?? undefined,
      description: description || undefined,
    };
  },

  async chapters(id) {
    const path = mangaPath(id);
    if (!path) throw new Error('Manga MangaKakalot inconnu.');
    const slug = path.slice('/manga/'.length);
    const response = await request(`/api/manga/${slug}/chapters?limit=2000`, 'application/json');
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Chapitres MangaKakalot HTTP ${response.status}`);
    }
    const payload = JSON.parse(response.body);
    const rows = payload?.data?.chapters;
    if (!Array.isArray(rows)) throw new Error('Liste de chapitres MangaKakalot invalide.');
    return rows.flatMap((row) => {
      const chapterId = chapterPath(`${path}/${row.chapter_slug}`);
      const number = Number(row.chapter_num);
      if (!chapterId || !Number.isFinite(number)) return [];
      return [
        {
          id: chapterId,
          number,
          title: typeof row.chapter_name === 'string' ? row.chapter_name : `Chapitre ${number}`,
          language: 'en',
          publishedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        },
      ];
    });
  },

  async pages(id) {
    const path = chapterPath(id);
    if (!path) throw new Error('Chapitre MangaKakalot inconnu.');
    const $ = await document(path);
    const seen = new Set();
    const pages = [];
    $('.container-chapter-reader img').each((_, image) => {
      const url = imageUrl($(image).attr('data-src') || $(image).attr('src'));
      if (url && !seen.has(url)) {
        seen.add(url);
        pages.push({ url, headers: { Referer: referer } });
      }
    });
    if (!pages.length)
      throw new Error('Ce chapitre MangaKakalot ne propose pas de pages lisibles.');
    return pages;
  },

  async health() {
    try {
      const items = cardItems(await document('/'));
      if (!items.length) return false;
      const detail = await document(items[0].id);
      return Boolean(detail('h1').first().text().trim());
    } catch {
      return false;
    }
  },
};
