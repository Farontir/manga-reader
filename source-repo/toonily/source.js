/* global app */
import { load } from 'cheerio';
import {
  category,
  hasExcludedGenre,
  ratingFromGenres,
} from '../../scripts/source-classification.js';

const base = 'https://toonily.com';
const referer = `${base}/`;
const sorts = [
  { id: 'latest', title: 'Mises à jour' },
  { id: 'alphabet', title: 'A-Z' },
  { id: 'rating', title: 'Notes' },
  { id: 'trending', title: 'Tendances' },
  { id: 'views', title: 'Plus lus' },
  { id: 'new-manga', title: 'Nouveautés' },
];

function pathOf(value, chapter = false) {
  try {
    const url = new URL(value, base);
    const pattern = chapter
      ? /^\/serie\/[a-z0-9-]+\/(?:chapter|side-story)-[a-z0-9.-]+\/$/i
      : /^\/serie\/[a-z0-9-]+\/$/i;
    return url.origin === base && pattern.test(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

function coverUrl(value) {
  try {
    const url = new URL(String(value).trim(), base);
    return url.protocol === 'https:' &&
      (url.hostname === 'static.tnlycdn.com' || url.hostname === 'toonily.com') &&
      /\.(?:jpe?g|png|webp)$/i.test(url.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function pageUrl(value) {
  try {
    const url = new URL(String(value).trim(), base);
    return url.protocol === 'https:' &&
      url.hostname === 'data.tnlycdn.com' &&
      url.pathname.startsWith('/chapters/') &&
      /\.(?:jpe?g|png|webp)$/i.test(url.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function coverImage(image) {
  const candidates = [
    ...(image.attr('data-srcset') || image.attr('srcset') || '').matchAll(
      /(?:^|,)\s*(\S+)\s+(\d+)w\s*(?=,|$)/g,
    ),
  ]
    .map((match) => ({ url: coverUrl(match[1]), width: Number(match[2]) }))
    .filter((candidate) => candidate.url && Number.isSafeInteger(candidate.width))
    .sort((a, b) => b.width - a.width);
  return candidates[0]?.url || coverUrl(image.attr('data-src') || image.attr('src'));
}

function dateOf(value) {
  const match = /^(\d+)\s+(min(?:ute)?s?|hours?|days?|weeks?|months?|years?)\s+ago$/i.exec(value);
  if (match) {
    const unit = match[2].toLowerCase();
    const minutes = unit.startsWith('min')
      ? 1
      : unit.startsWith('hour')
        ? 60
        : unit.startsWith('day')
          ? 1440
          : unit.startsWith('week')
            ? 10080
            : unit.startsWith('month')
              ? 43200
              : 525600;
    return new Date(Date.now() - Number(match[1]) * minutes * 60_000).toISOString();
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

async function document(path) {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Toonily HTTP ${response.status}`);
  return load(response.body);
}

function cards($, listingGenre) {
  const seen = new Set();
  const items = [];
  $('.page-item-detail.manga').each((_, element) => {
    const card = $(element);
    const link = card.find('.post-title a[href]').first();
    const id = pathOf(link.attr('href'));
    const title = link.text().trim();
    if (!id || !title || seen.has(id)) return;
    const genres = listingGenre ? [listingGenre] : [];
    if (hasExcludedGenre(genres)) return;
    seen.add(id);
    const rating = ratingFromGenres(genres);
    items.push({
      id,
      title,
      coverUrl: coverImage(card.find('.item-thumb img').first()),
      ...(genres.length ? { genres } : {}),
      ...(rating ? { contentRating: rating } : {}),
    });
  });
  return items;
}

function genres($) {
  const result = new Map();
  $('a[href*="/genre/"]').each((_, anchor) => {
    const url = new URL($(anchor).attr('href'), base);
    const match = url.origin === base && /^\/genre\/([a-z0-9-]+)\/$/.exec(url.pathname);
    const title = $(anchor).clone().find('.count').remove().end().text().trim();
    if (match && title && title.length <= 40 && !hasExcludedGenre([match[1], title])) {
      result.set(match[1], category(`genre:${match[1]}`, title));
    }
  });
  return [...result.values()];
}

function listingPath(page, listing) {
  const selected = listing || 'latest';
  const pagePart = page > 1 ? `page/${page}/` : '';
  if (selected.startsWith('genre:')) {
    const genre = selected.slice(6);
    if (!/^[a-z0-9-]{1,80}$/.test(genre) || hasExcludedGenre([genre]))
      throw new Error('Genre Toonily inconnu.');
    return { path: `/genre/${genre}/${pagePart}`, genre };
  }
  if (!sorts.some((sort) => sort.id === selected)) throw new Error('Tri Toonily inconnu.');
  return { path: `/webtoons/${pagePart}?m_orderby=${selected}`, genre: null };
}

globalThis.source = {
  async search(query) {
    const term = String(query ?? '').trim();
    if (!term) return [];
    return cards(await document(`/?s=${encodeURIComponent(term)}&post_type=wp-manga`)).slice(0, 50);
  },
  async manga(id) {
    const path = pathOf(id);
    if (!path) throw new Error('Manga Toonily inconnu.');
    const $ = await document(path);
    const title = $('.post-title h1').first().clone().children().remove().end().text().trim();
    if (!title) throw new Error('Fiche Toonily indisponible.');
    const mangaGenres = $('.genres-content a[rel="tag"]')
      .map((_, anchor) => $(anchor).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 20);
    if (hasExcludedGenre(mangaGenres)) throw new Error('Titre indisponible dans cette source.');
    const rating = ratingFromGenres(mangaGenres);
    const authors = $('.author-content a, .artist-content a')
      .map((_, anchor) => $(anchor).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 20);
    const alt = $('.summary-heading:contains("Alt Name")').next('.summary-content').text().trim();
    return {
      id: path,
      title,
      coverUrl: coverImage($('.summary_image img').first()),
      description: $('.summary__content').first().text().trim().slice(0, 4000) || undefined,
      genres: mangaGenres,
      authors,
      ...(alt ? { altTitles: [alt] } : {}),
      ...(rating ? { contentRating: rating } : {}),
    };
  },
  async chapters(id) {
    const path = pathOf(id);
    if (!path) throw new Error('Manga Toonily inconnu.');
    const $ = await document(path);
    if (
      hasExcludedGenre(
        $('.genres-content a')
          .map((_, anchor) => $(anchor).text().trim())
          .get(),
      )
    )
      throw new Error('Titre indisponible dans cette source.');
    const result = [];
    const sideStories = [];
    $('.listing-chapters_wrap li.wp-manga-chapter').each((_, element) => {
      const row = $(element);
      const link = row.find('a[href]').first();
      const chapterId = pathOf(link.attr('href'), true);
      const title = link.text().trim();
      const number = Number(
        /(?:chapter|chap)\s*(\d+(?:[.-]\d+)?)/i.exec(title)?.[1]?.replace('-', '.'),
      );
      if (!chapterId || !chapterId.startsWith(path)) return;
      const item = {
        id: chapterId,
        title,
        language: 'en',
        publishedAt: dateOf(row.find('.chapter-release-date').text().trim()),
      };
      if (chapterId.includes('/side-story-')) {
        const sideNumber = Number(/\/side-story-(\d+)\//.exec(chapterId)?.[1]);
        if (Number.isSafeInteger(sideNumber) && sideNumber > 0 && sideNumber < 1000) {
          sideStories.push({ ...item, sideNumber });
        }
      } else if (Number.isFinite(number)) {
        result.push({ ...item, number });
      }
    });
    const lastMain = Math.max(0, ...result.map((chapter) => chapter.number));
    return [
      ...result,
      ...sideStories.map(({ sideNumber, ...item }) => ({
        ...item,
        number: lastMain + sideNumber / 1000,
      })),
    ];
  },
  async pages(id) {
    const path = pathOf(id, true);
    if (!path) throw new Error('Chapitre Toonily inconnu.');
    const $ = await document(path);
    const seen = new Set();
    const pages = [];
    $('.reading-content img.wp-manga-chapter-img').each((_, element) => {
      const url = pageUrl($(element).attr('data-src') || $(element).attr('src'));
      if (url && !seen.has(url)) {
        seen.add(url);
        pages.push({ url, headers: { Referer: referer } });
      }
    });
    if (!pages.length) throw new Error('Aucune page Toonily disponible.');
    return pages;
  },
  async discover() {
    const [latest, popular, newest] = await Promise.all([
      document('/webtoons/?m_orderby=latest'),
      document('/webtoons/?m_orderby=views'),
      document('/webtoons/?m_orderby=new-manga'),
    ]);
    return {
      sections: [
        { title: 'Dernières mises à jour', items: cards(latest).slice(0, 30), more: 'latest' },
        { title: 'Plus lus', items: cards(popular).slice(0, 30), more: 'views' },
        { title: 'Nouveautés', items: cards(newest).slice(0, 30), more: 'new-manga' },
      ],
      genres: genres(latest),
    };
  },
  async catalog(page, listing) {
    const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const { path, genre } = listingPath(current, listing);
    const $ = await document(path);
    return {
      items: cards($, genre).slice(0, 100),
      hasMore: $(`a[href*="/page/${current + 1}/"]`).length > 0,
      sorts,
    };
  },
  async health() {
    try {
      return cards(await document('/webtoons/')).length > 0;
    } catch {
      return false;
    }
  },
};
