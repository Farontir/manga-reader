/* global app */
import { load } from 'cheerio';
import {
  category,
  hasExcludedGenre,
  ratingFromGenres,
} from '../../scripts/source-classification.js';

const base = 'https://sushiscan.net';
const months = new Map([
  ['janvier', 0],
  ['février', 1],
  ['mars', 2],
  ['avril', 3],
  ['mai', 4],
  ['juin', 5],
  ['juillet', 6],
  ['août', 7],
  ['septembre', 8],
  ['octobre', 9],
  ['novembre', 10],
  ['décembre', 11],
]);

function pathOf(value, chapter = false) {
  try {
    const url = new URL(value, base);
    const valid = chapter ? /^\/[a-z0-9-]+\/$/i : /^\/catalogue\/[a-z0-9-]+\/$/i;
    return url.origin === base && valid.test(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

function image(value) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' &&
      (url.hostname === 'sushiscan.net' || url.hostname.endsWith('.sushiscan.net'))
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function dateOf(text) {
  const match = /^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/i.exec(text.trim());
  const month = match && months.get(match[2].toLowerCase());
  return match && month !== undefined
    ? new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString()
    : undefined;
}

async function html(path) {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`SushiScan HTTP ${response.status}`);
  return response.body;
}

async function document(path) {
  return load(await html(path));
}

function cards($, listingGenre) {
  const seen = new Set();
  const items = [];
  $('.listupd .bsx').each((_, element) => {
    const card = $(element);
    const link = card.find('a[href]').first();
    const id = pathOf(link.attr('href'));
    const title = link.attr('title')?.trim() || card.find('.tt').text().trim();
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    const genres = listingGenre ? [listingGenre] : [];
    const rating = ratingFromGenres(genres);
    items.push({
      id,
      title,
      coverUrl: image(card.find('img').first().attr('src')),
      genres,
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return items;
}

function genres($) {
  const found = new Map();
  $('a[href*="/genres/"]').each((_, element) => {
    const link = $(element);
    const url = new URL(link.attr('href'), base);
    const match = url.origin === base && /^\/genres\/([a-z0-9-]+)\/$/.exec(url.pathname);
    const title = link.text().trim();
    if (match && title && title.length <= 40 && !hasExcludedGenre([title, match[1]]))
      found.set(match[1], category(`genre:${match[1]}`, title));
  });
  return [...found.values()];
}

function listingPath(page, listing) {
  const selected = listing || 'updated';
  if (selected === 'updated')
    return { path: `/catalogue/${page > 1 ? `page/${page}/` : ''}`, genre: null };
  if (selected.startsWith('genre:')) {
    const slug = selected.slice(6);
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || hasExcludedGenre([slug]))
      throw new Error('Genre SushiScan inconnu.');
    return { path: `/genres/${slug}/${page > 1 ? `page/${page}/` : ''}`, genre: slug };
  }
  throw new Error('Catalogue SushiScan inconnu.');
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    return cards(await document(`/?s=${encodeURIComponent(term)}`)).slice(0, 50);
  },
  async manga(id) {
    const path = pathOf(id);
    if (!path) throw new Error('Série SushiScan inconnue.');
    const $ = await document(path);
    const title = $('.seriestuheader h1').first().text().trim();
    if (!title) throw new Error('Fiche SushiScan indisponible.');
    const mangaGenres = $('.seriestucon a[href*="/genres/"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    if (hasExcludedGenre(mangaGenres)) throw new Error('Titre indisponible dans cette source.');
    const rating = ratingFromGenres(mangaGenres);
    return {
      id: path,
      title,
      coverUrl: image($('.seriestucontl .thumb img').first().attr('src')),
      description: $('.entry-content-single').first().text().trim().slice(0, 4000) || undefined,
      genres: [...new Set(mangaGenres)],
      authors: $('.seriestucontentr a[href*="/author/"]')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
      ...(rating ? { contentRating: rating } : {}),
    };
  },
  async chapters(id) {
    const path = pathOf(id);
    if (!path) throw new Error('Série SushiScan inconnue.');
    const $ = await document(path);
    if (
      hasExcludedGenre(
        $('.seriestucon a[href*="/genres/"]')
          .map((_, el) => $(el).text().trim())
          .get(),
      )
    )
      throw new Error('Titre indisponible dans cette source.');
    const result = [];
    $('#chapterlist li').each((_, element) => {
      const row = $(element);
      const link = row.find('a[href]').first();
      const chapterId = pathOf(link.attr('href'), true);
      const title = row.find('.chapternum').text().trim();
      const number = Number(
        /(?:chapitre|chapter)\s*(\d+(?:[.,]\d+)?)/i.exec(title)?.[1]?.replace(',', '.'),
      );
      if (chapterId && Number.isFinite(number) && number > 0)
        result.push({
          id: chapterId,
          number,
          title,
          language: 'fr',
          publishedAt: dateOf(row.find('.chapterdate').text()),
        });
    });
    return result;
  },
  async pages(id) {
    const path = pathOf(id, true);
    if (!path) throw new Error('Chapitre SushiScan inconnu.');
    const body = await html(path);
    const script = /ts_reader\.run\(([^]*?)\);/.exec(body)?.[1];
    const match = script && /"images":(\[[^\]]*\])/.exec(script);
    if (!match) throw new Error('Images SushiScan indisponibles.');
    let urls;
    try {
      urls = JSON.parse(match[1]);
    } catch {
      throw new Error('Liste d’images SushiScan invalide.');
    }
    const pages = urls.map(image).filter(Boolean);
    if (!pages.length) throw new Error('Aucune page SushiScan disponible.');
    return pages.map((url) => ({ url, headers: { Referer: `${base}/` } }));
  },
  async discover() {
    const [recent, action] = await Promise.all([
      document('/catalogue/'),
      document('/genres/action/'),
    ]);
    return {
      sections: [
        { title: 'Catalogue', items: cards(recent).slice(0, 30), more: 'updated' },
        { title: 'Action', items: cards(action, 'Action').slice(0, 30), more: 'genre:action' },
      ],
      genres: genres(recent),
    };
  },
  async catalog(page, listing) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const { path, genre } = listingPath(current, listing);
    const $ = await document(path);
    return {
      items: cards($, genre).slice(0, 100),
      hasMore: $(`a[href*="/page/${current + 1}/"]`).length > 0,
      sorts: [{ id: 'updated', title: 'Catalogue' }],
    };
  },
  async health() {
    try {
      return cards(await document('/catalogue/')).length > 0;
    } catch {
      return false;
    }
  },
};
