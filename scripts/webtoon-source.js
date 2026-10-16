/* global app */
import { load } from 'cheerio';
import { category, hasExcludedGenre, ratingFromGenres } from './source-classification.js';

const base = 'https://www.webtoons.com';
const monthsFr = new Map([['janv.', 0], ['févr.', 1], ['mars', 2], ['avr.', 3], ['mai', 4], ['juin', 5], ['juil.', 6], ['août', 7], ['sept.', 8], ['oct.', 9], ['nov.', 10], ['déc.', 11]]);

export function webtoonSource(locale) {
  if (!['en', 'fr'].includes(locale)) throw new Error('Langue WEBTOON inconnue.');

  function pageUrl(value, type) {
    try {
      const url = new URL(value, base);
      if (url.origin !== base || !url.pathname.startsWith(`/${locale}/`)) return null;
      if (type === 'manga' && !/^\/(?:en|fr)\/[a-z0-9_-]+\/[a-z0-9-]+\/list$/.test(url.pathname)) return null;
      if (type === 'chapter' && !/^\/(?:en|fr)\/[a-z0-9_-]+\/[a-z0-9-]+\/[a-z0-9-]+\/viewer$/.test(url.pathname)) return null;
      if (!/^\d+$/.test(url.searchParams.get('title_no') ?? '')) return null;
      if (type === 'chapter' && !/^\d+$/.test(url.searchParams.get('episode_no') ?? '')) return null;
      url.searchParams.delete('page');
      return url.pathname + url.search;
    } catch { return null; }
  }

  function imageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'webtoon-phinf.pstatic.net' ? url.href : undefined;
    } catch { return undefined; }
  }

  async function document(path) {
    const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html', 'Accept-Language': locale } });
    if (response.status < 200 || response.status >= 300) throw new Error(`WEBTOON HTTP ${response.status}`);
    return load(response.body);
  }

  function genreFromPath(path) {
    return new URL(path, base).pathname.split('/')[2]?.replaceAll('_', ' ');
  }

  function cards($, listingGenre) {
    const items = [];
    const seen = new Set();
    $('a[href*="/list?title_no="]').each((_, element) => {
      const card = $(element);
      const id = pageUrl(card.attr('href'), 'manga');
      const title = card.find('.title').first().text().trim();
      if (!id || !title || seen.has(id)) return;
      const genre = card.find('.genre').first().text().trim() || genreFromPath(id);
      if (hasExcludedGenre([genre, listingGenre])) return;
      seen.add(id);
      const rating = ratingFromGenres([genre, listingGenre]);
      const coverUrl = imageUrl(card.find('img').first().attr('src'));
      items.push({ id, title, coverUrl, genres: genre ? [genre] : [], ...(rating ? { contentRating: rating } : {}) });
    });
    return items;
  }

  function genres($) {
    const values = new Map();
    $(`a[href*="/${locale}/genres/"]`).each((_, anchor) => {
      const url = new URL($(anchor).attr('href'), base);
      const match = url.origin === base && new RegExp(`^/${locale}/genres/([a-z0-9_-]+)$`).exec(url.pathname);
      const title = $(anchor).text().replace(/\s+/g, ' ').trim();
      if (match && title && title.length <= 30 && !hasExcludedGenre([match[1], title])) values.set(match[1], category(`genre:${match[1]}`, title));
    });
    return [...values.values()];
  }

  function episodeDate(value) {
    const text = value.trim();
    if (locale === 'fr') {
      const match = /^(\d{1,2})\s+([^\s]+)\s+(\d{4})$/.exec(text);
      const month = match && monthsFr.get(match[2].toLowerCase());
      if (match && month !== undefined) return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString();
    }
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
  }

  function episodeRows($) {
    const result = [];
    $('#_listUl li._episodeItem').each((_, element) => {
      const row = $(element);
      const link = row.find('a[href*="/viewer?"]').first();
      const id = pageUrl(link.attr('href'), 'chapter');
      const number = Number(row.attr('data-episode-no'));
      if (!id || !Number.isSafeInteger(number) || number <= 0) return;
      const title = link.find('.subj').first().text().trim() || `${locale === 'fr' ? 'Épisode' : 'Episode'} ${number}`;
      result.push({ id, number, title, language: locale, publishedAt: episodeDate(link.find('.date').first().text()) });
    });
    return result;
  }

  function highestVisiblePage($) {
    let highest = 1;
    $('.paginate a[href*="page="]').each((_, anchor) => {
      const value = Number(new URL($(anchor).attr('href'), base).searchParams.get('page'));
      if (Number.isSafeInteger(value)) highest = Math.max(highest, value);
    });
    return highest;
  }

  return {
    async search(query) {
      const term = String(query ?? '').trim();
      if (!term) return [];
      return cards(await document(`/${locale}/search/originals?keyword=${encodeURIComponent(term)}`)).slice(0, 50);
    },
    async manga(id) {
      const path = pageUrl(id, 'manga');
      if (!path) throw new Error('Série WEBTOON inconnue.');
      const $ = await document(path);
      const title = $('.detail_header h1.subj').first().text().trim();
      if (!title) throw new Error('Fiche WEBTOON indisponible.');
      const genre = $('.detail_header h2.genre').first().text().trim();
      if (hasExcludedGenre([genre])) throw new Error('Titre indisponible dans cette source.');
      const rating = ratingFromGenres([genre]);
      const authors = $('.detail_header .author_area .author').map((_, element) => $(element).text().trim()).get().filter(Boolean);
      return {
        id: path, title,
        coverUrl: imageUrl($('.detail_header .thmb img').first().attr('src')),
        description: $('meta[property="og:description"]').attr('content')?.trim().slice(0, 4000),
        genres: genre ? [genre] : [], authors,
        ...(rating ? { contentRating: rating } : {}),
      };
    },
    async chapters(id) {
      const path = pageUrl(id, 'manga');
      if (!path) throw new Error('Série WEBTOON inconnue.');
      const first = await document(path);
      // The source call has a 12 s deadline. Fetch 24 pages at most; this covers
      // 240 currently public episodes without turning long titles into timeouts.
      let last = highestVisiblePage(first);
      let next = 2;
      const chapters = episodeRows(first);
      while (next <= Math.min(last, 24)) {
        const end = Math.min(last, next + 7, 24);
        const batch = await Promise.all(Array.from({ length: end - next + 1 }, (_, index) => document(`${path}&page=${next + index}`)));
        for (const page of batch) {
          last = Math.max(last, highestVisiblePage(page));
          chapters.push(...episodeRows(page));
        }
        next = end + 1;
      }
      return [...new Map(chapters.map((chapter) => [chapter.id, chapter])).values()];
    },
    async pages(id) {
      const path = pageUrl(id, 'chapter');
      if (!path) throw new Error('Épisode WEBTOON inconnu.');
      const $ = await document(path);
      const pages = $('#_imageList img[data-url]').map((_, element) => imageUrl($(element).attr('data-url'))).get().filter(Boolean);
      if (!pages.length) throw new Error('Cet épisode WEBTOON n’est pas disponible gratuitement.');
      return pages.map((url) => ({ url, headers: { Referer: `${base}/` } }));
    },
    async discover() {
      const [$, genrePage] = await Promise.all([document(`/${locale}/originals`), document(`/${locale}/genres`)]);
      const items = cards($);
      const romance = items.filter((item) => item.genres[0]?.toLowerCase().includes('romance'));
      const action = items.filter((item) => item.genres[0]?.toLowerCase().includes('action'));
      return { sections: [
        { title: locale === 'fr' ? 'WEBTOON Originals' : 'WEBTOON Originals', items: items.slice(0, 30), more: 'originals' },
        { title: 'Romance', items: romance.slice(0, 30), more: 'genre:romance' },
        { title: 'Action', items: action.slice(0, 30), more: 'genre:action' },
      ], genres: genres(genrePage) };
    },
    async catalog(page, listing) {
      const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
      const selected = listing || 'originals';
      let path;
      if (selected === 'originals') path = `/${locale}/originals`;
      else if (selected.startsWith('genre:')) {
        const genre = selected.slice(6);
        if (!/^[a-z0-9_-]{1,50}$/.test(genre) || hasExcludedGenre([genre])) throw new Error('Genre WEBTOON inconnu.');
        path = `/${locale}/genres/${genre}`;
      } else throw new Error('Catalogue WEBTOON inconnu.');
      const all = cards(await document(path));
      const offset = (current - 1) * 100;
      return { items: all.slice(offset, offset + 100), hasMore: all.length > offset + 100, sorts: [{ id: 'originals', title: 'Originals' }] };
    },
    async health() {
      try { return cards(await document(`/${locale}/originals`)).length > 0; } catch { return false; }
    },
  };
}
