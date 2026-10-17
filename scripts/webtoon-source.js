/* global app */
import { load } from 'cheerio';
import { category, hasExcludedGenre, ratingFromGenres } from './source-classification.js';

const base = 'https://www.webtoons.com';
const mobileBase = 'https://m.webtoons.com';

export function webtoonSource(locale) {
  if (!['en', 'fr'].includes(locale)) throw new Error('Langue WEBTOON inconnue.');

  function pageUrl(value, type) {
    try {
      const url = new URL(value, base);
      if (
        !['m.webtoons.com', 'www.webtoons.com'].includes(url.hostname) ||
        url.protocol !== 'https:' ||
        !url.pathname.startsWith(`/${locale}/`)
      )
        return null;
      if (type === 'manga' && !/^\/(?:en|fr)\/[a-z0-9_-]+\/[a-z0-9-]+\/list$/.test(url.pathname))
        return null;
      if (
        type === 'chapter' &&
        !/^\/(?:en|fr)\/[a-z0-9_-]+\/[a-z0-9-]+\/[a-z0-9-]+\/viewer$/.test(url.pathname)
      )
        return null;
      if (!/^\d+$/.test(url.searchParams.get('title_no') ?? '')) return null;
      if (type === 'chapter' && !/^\d+$/.test(url.searchParams.get('episode_no') ?? ''))
        return null;
      url.searchParams.delete('page');
      return url.pathname + url.search;
    } catch {
      return null;
    }
  }

  function imageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'webtoon-phinf.pstatic.net'
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  }

  async function document(path) {
    const response = await app.fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
    if (response.status < 200 || response.status >= 300)
      throw new Error(`WEBTOON HTTP ${response.status}`);
    return load(response.body);
  }

  async function episodeData(titleNo, cursor) {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (cursor) query.set('cursor', String(cursor));
    const response = await app.fetch(`${mobileBase}/api/v1/webtoon/${titleNo}/episodes?${query}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status < 200 || response.status >= 300)
      throw new Error(`WEBTOON HTTP ${response.status}`);
    const data = JSON.parse(response.body);
    if (data.success !== true || !Array.isArray(data.result?.episodeList))
      throw new Error('Liste WEBTOON indisponible.');
    return data.result;
  }

  const seriesGenreSlugs = { SUPER_HERO: 'super-hero', SF: 'sci-fi', TIPTOON: 'tiptoon' };
  function seriesGenreSlug(code) {
    return seriesGenreSlugs[code] ?? code?.toLowerCase().replaceAll('_', '-');
  }

  function genreFromPath(path) {
    return new URL(path, base).pathname.split('/')[2]?.replaceAll('_', ' ');
  }

  function cards($, listingGenre) {
    const items = [];
    const seen = new Set();
    $('a[href*="/list?title_no="]').each((_, element) => {
      const card = $(element);
      if (
        card.attr('data-webtoon-type') === 'CHALLENGE' ||
        card.find('[data-title-unsuitable-for-children="true"]').length
      )
        return;
      const id = pageUrl(card.attr('href'), 'manga');
      const title = card.find('.title').first().text().trim();
      if (!id || !title || seen.has(id)) return;
      const genre = card.find('.genre').first().text().trim() || genreFromPath(id);
      if (hasExcludedGenre([genre, listingGenre])) return;
      seen.add(id);
      const rating = ratingFromGenres([genre, listingGenre]);
      const coverUrl = imageUrl(card.find('img').first().attr('src'));
      items.push({
        id,
        title,
        coverUrl,
        genres: genre ? [genre] : [],
        ...(rating ? { contentRating: rating } : {}),
      });
    });
    return items;
  }

  function genres($) {
    const values = new Map();
    $(`a[href*="/${locale}/genres/"]`).each((_, anchor) => {
      const url = new URL($(anchor).attr('href'), base);
      const match =
        url.origin === base && new RegExp(`^/${locale}/genres/([a-z0-9_-]+)$`).exec(url.pathname);
      const title = $(anchor).text().replace(/\s+/g, ' ').trim();
      if (match && title && title.length <= 30 && !hasExcludedGenre([match[1], title]))
        values.set(match[1], category(`genre:${match[1]}`, title));
    });
    $('a._genreShortcutItem[data-genre]').each((_, anchor) => {
      const code = $(anchor).attr('data-genre');
      const slug = code?.toLowerCase();
      const title = $(anchor).closest('li').find('.tit_genre').first().text().trim();
      if (slug && title && !hasExcludedGenre([slug, title]))
        values.set(slug, category(`genre:${slug}`, title));
    });
    return [...values.values()];
  }

  return {
    async search(query) {
      const term = String(query ?? '').trim();
      if (!term) return [];
      const desktop = await app.fetch(
        `${base}/${locale}/search/originals?keyword=${encodeURIComponent(term)}`,
        { headers: { Accept: 'text/html' } },
      );
      if (desktop.status >= 200 && desktop.status < 300) {
        const found = cards(load(desktop.body));
        if (found.length) return found.slice(0, 50);
      }
      const response = await app.fetch(
        `${mobileBase}/${locale}/search/result?keyword=${encodeURIComponent(term)}&searchType=WEBTOON&start=1`,
        { headers: { Accept: 'application/json' } },
      );
      if (response.status < 200 || response.status >= 300)
        throw new Error(`WEBTOON HTTP ${response.status}`);
      const data = JSON.parse(response.body);
      if (data.success !== true || !Array.isArray(data.result?.webtoonResult?.titleList))
        throw new Error('Recherche WEBTOON indisponible.');
      return data.result.webtoonResult.titleList
        .flatMap((item) => {
          const genre = seriesGenreSlug(item.representGenre);
          if (
            !genre ||
            !/^[a-z0-9-]+$/.test(genre) ||
            !/^[a-z0-9-]+$/.test(item.titleGroupName ?? '') ||
            !Number.isSafeInteger(item.titleNo) ||
            typeof item.title !== 'string' ||
            item.unsuitableForChildren ||
            hasExcludedGenre([genre])
          )
            return [];
          const id = `/${locale}/${genre}/${item.titleGroupName}/list?title_no=${item.titleNo}`;
          const coverUrl =
            typeof item.thumbnailMobile === 'string' && item.thumbnailMobile.startsWith('/')
              ? imageUrl(`https://webtoon-phinf.pstatic.net${item.thumbnailMobile}`)
              : undefined;
          return [{ id, title: item.title, coverUrl, genres: [genre] }];
        })
        .slice(0, 50);
    },
    async manga(id) {
      const path = pageUrl(id, 'manga');
      if (!path) throw new Error('Série WEBTOON inconnue.');
      const $ = await document(path);
      const title = $('.detail_info_wrap .subject, .detail_header h1.subj').first().text().trim();
      if (!title) throw new Error('Fiche WEBTOON indisponible.');
      if ($('.detail_info_wrap [data-title-unsuitable-for-children="true"]').length)
        throw new Error('Titre indisponible dans cette source.');
      const genre = genreFromPath(path);
      if (hasExcludedGenre([genre])) throw new Error('Titre indisponible dans cette source.');
      const rating = ratingFromGenres([genre]);
      const authors = $('.detail_info_wrap .author a, .detail_header .author_area .author')
        .map((_, element) => $(element).text().trim())
        .get()
        .filter(Boolean);
      return {
        id: path,
        title,
        coverUrl: imageUrl(
          $('.detail_info_wrap .img_area img, .detail_header .thmb img').first().attr('src'),
        ),
        description: (
          $('.detail_info_wrap .summary').first().text().trim() ||
          $('meta[property="og:description"]').attr('content')?.trim()
        )?.slice(0, 4000),
        genres: genre ? [genre] : [],
        authors,
        ...(rating ? { contentRating: rating } : {}),
      };
    },
    async chapters(id) {
      const path = pageUrl(id, 'manga');
      if (!path) throw new Error('Série WEBTOON inconnue.');
      const titleNo = new URL(path, base).searchParams.get('title_no');
      const chapters = [];
      let cursor;
      for (let batch = 0; batch < 10; batch += 1) {
        const data = await episodeData(titleNo, cursor);
        for (const episode of data.episodeList) {
          const chapterId = pageUrl(episode.viewerLink, 'chapter');
          const number = Number(episode.episodeNo);
          if (!chapterId || !Number.isSafeInteger(number) || number <= 0) continue;
          chapters.push({
            id: chapterId,
            number,
            title: episode.episodeTitle || `${locale === 'fr' ? 'Épisode' : 'Episode'} ${number}`,
            language: locale,
            publishedAt: Number.isFinite(episode.exposureDateMillis)
              ? new Date(episode.exposureDateMillis).toISOString()
              : undefined,
          });
        }
        if (!data.nextCursor || data.nextCursor === cursor) break;
        cursor = data.nextCursor;
      }
      return [...new Map(chapters.map((chapter) => [chapter.id, chapter])).values()];
    },
    async pages(id) {
      const path = pageUrl(id, 'chapter');
      if (!path) throw new Error('Épisode WEBTOON inconnu.');
      const $ = await document(path);
      const imageList = $.html().match(/var imageList\s*=\s*\[([\s\S]*?)\];/);
      const pages = imageList
        ? [...imageList[1].matchAll(/\burl:\s*["'](https:\/\/[^"']+)["']/g)]
            .map((match) => imageUrl(match[1]))
            .filter(Boolean)
        : $('#_imageList img[data-url]')
            .map((_, element) => imageUrl($(element).attr('data-url')))
            .get()
            .filter(Boolean);
      if (!pages.length) throw new Error('Cet épisode WEBTOON n’est pas disponible gratuitement.');
      return pages.map((url) => ({ url, headers: { Referer: `${base}/` } }));
    },
    async discover() {
      const [$, genrePage] = await Promise.all([
        document(`/${locale}/originals`),
        document(`/${locale}/genres`),
      ]);
      const items = cards($);
      const romance = items.filter((item) => item.genres[0]?.toLowerCase().includes('romance'));
      const action = items.filter((item) => item.genres[0]?.toLowerCase().includes('action'));
      return {
        sections: [
          {
            title: locale === 'fr' ? 'WEBTOON Originals' : 'WEBTOON Originals',
            items: items.slice(0, 30),
            more: 'originals',
          },
          { title: 'Romance', items: romance.slice(0, 30), more: 'genre:romance' },
          { title: 'Action', items: action.slice(0, 30), more: 'genre:action' },
        ],
        genres: genres(genrePage),
      };
    },
    async catalog(page, listing) {
      const current = Number.isSafeInteger(page) && page > 0 ? page : 1;
      const selected = listing || 'originals';
      let path;
      if (selected === 'originals') path = `/${locale}/originals`;
      else if (selected.startsWith('genre:')) {
        const genre = selected.slice(6);
        if (!/^[a-z0-9_-]{1,50}$/.test(genre) || hasExcludedGenre([genre]))
          throw new Error('Genre WEBTOON inconnu.');
        path = `/${locale}/genres/${genre}`;
      } else throw new Error('Catalogue WEBTOON inconnu.');
      const all = cards(await document(path));
      const offset = (current - 1) * 100;
      return {
        items: all.slice(offset, offset + 100),
        hasMore: all.length > offset + 100,
        sorts: [{ id: 'originals', title: 'Originals' }],
      };
    },
    async health() {
      try {
        return cards(await document(`/${locale}/originals`)).length > 0;
      } catch {
        return false;
      }
    },
  };
}
