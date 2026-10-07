/* global app */
import { load } from 'cheerio';

const base = 'https://flamecomics.xyz';
const cdn = 'https://cdn.flamecomics.xyz/uploads/images/series';
const adultTags = new Set(['adult', 'erotica', 'hentai', 'mature', 'pornographic', 'smut']);
let buildId;

function seriesId(value) {
  if (typeof value !== 'string') return null;
  const match = /^\/series\/([1-9]\d*)$/.exec(value);
  return match ? Number(match[1]) : null;
}

function chapterId(value) {
  if (typeof value !== 'string') return null;
  const match = /^\/series\/([1-9]\d*)\/([a-f0-9]{16})$/i.exec(value);
  return match ? { series: Number(match[1]), token: match[2] } : null;
}

function isComic(row) {
  return (
    Number.isSafeInteger(row?.series_id) &&
    row.series_id > 0 &&
    typeof row.title === 'string' &&
    row.title.trim().length > 0 &&
    typeof row.type === 'string' &&
    !/novel/i.test(row.type) &&
    !row.categories?.some((tag) => adultTags.has(String(tag).toLowerCase())) &&
    !row.tags?.some((tag) => adultTags.has(String(tag).toLowerCase()))
  );
}

function coverUrl(row) {
  if (!Number.isSafeInteger(row?.series_id) || !/^[\w.-]+\.(?:png|jpe?g|webp)$/i.test(row?.cover)) {
    return undefined;
  }
  const timestamp = Number.isSafeInteger(row.last_edit) ? `?${row.last_edit}` : '';
  return `${cdn}/${row.series_id}/${encodeURIComponent(row.cover)}${timestamp}`;
}

function item(row) {
  return {
    id: `/series/${row.series_id}`,
    title: row.title.trim(),
    coverUrl: coverUrl(row),
  };
}

async function request(path, accept = 'application/json') {
  const response = await app.fetch(`${base}${path}`, { headers: { Accept: accept } });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Flame Comics HTTP ${response.status}`);
  }
  return response.body;
}

async function currentBuildId(force = false) {
  if (buildId && !force) return buildId;
  const html = await request('/', 'text/html');
  const match = /"buildId":"([A-Za-z0-9_-]+)"/.exec(html);
  if (!match) throw new Error('Version du catalogue Flame Comics introuvable.');
  buildId = match[1];
  return buildId;
}

async function pageData(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = await currentBuildId(attempt > 0);
    try {
      const body = await request(`/_next/data/${id}${path}.json`);
      const payload = JSON.parse(body);
      if (!payload?.pageProps || typeof payload.pageProps !== 'object') {
        throw new Error('Données Flame Comics invalides.');
      }
      return payload.pageProps;
    } catch (error) {
      if (attempt > 0 || !/HTTP 404/.test(String(error))) throw error;
    }
  }
  throw new Error('Données Flame Comics indisponibles.');
}

async function catalogue() {
  const rows = (await pageData('/browse')).series;
  if (!Array.isArray(rows)) throw new Error('Catalogue Flame Comics invalide.');
  return rows.filter(isComic);
}

function normalized(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

globalThis.source = {
  async search(query) {
    const needle = normalized(String(query ?? '').trim());
    if (!needle) return [];
    const rows = (await catalogue()).filter((row) => normalized(row.title).includes(needle));
    rows.sort(
      (a, b) =>
        Number(normalized(b.title) === needle) - Number(normalized(a.title) === needle) ||
        (b.likes ?? 0) - (a.likes ?? 0),
    );
    return rows.slice(0, 30).map(item);
  },

  async recommendations() {
    const rows = await catalogue();
    rows.sort((a, b) => (a.popularityRank ?? Infinity) - (b.popularityRank ?? Infinity));
    return { title: 'Populaires sur Flame Comics', items: rows.slice(0, 30).map(item) };
  },

  async discover() {
    const rows = await catalogue();
    return {
      sections: [
        {
          title: 'Populaires',
          items: [...rows]
            .sort((a, b) => (a.popularityRank ?? Infinity) - (b.popularityRank ?? Infinity))
            .slice(0, 30)
            .map(item),
        },
        {
          title: 'Les plus appréciés',
          items: [...rows]
            .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
            .slice(0, 30)
            .map(item),
        },
      ],
    };
  },

  async manga(id) {
    const number = seriesId(id);
    if (!number) throw new Error('Série Flame Comics inconnue.');
    const row = (await pageData(`/series/${number}`)).series;
    if (!isComic(row) || row.series_id !== number)
      throw new Error('Fiche Flame Comics indisponible.');
    const description = load(String(row.description ?? ''))
      .text()
      .trim()
      .slice(0, 4000);
    return { ...item(row), description: description || undefined };
  },

  async chapters(id) {
    const number = seriesId(id);
    if (!number) throw new Error('Série Flame Comics inconnue.');
    const rows = (await pageData(`/series/${number}`)).chapters;
    if (!Array.isArray(rows)) throw new Error('Liste de chapitres Flame Comics invalide.');
    return rows.flatMap((row) => {
      const chapter = Number(row?.chapter);
      if (
        row?.series_id !== number ||
        !Number.isFinite(chapter) ||
        !/^[a-f0-9]{16}$/i.test(row.token) ||
        row.hidden ||
        row.draft ||
        row.notice
      ) {
        return [];
      }
      const subtitle = typeof row.title === 'string' ? row.title.trim() : '';
      return [
        {
          id: `/series/${number}/${row.token}`,
          number: chapter,
          title: `Chapitre ${chapter}${subtitle ? ` — ${subtitle}` : ''}`,
          language: 'en',
          publishedAt: Number.isSafeInteger(row.release_date)
            ? new Date(row.release_date * 1000).toISOString()
            : undefined,
        },
      ];
    });
  },

  async pages(id) {
    const ref = chapterId(id);
    if (!ref) throw new Error('Chapitre Flame Comics inconnu.');
    const row = (await pageData(`/series/${ref.series}/${ref.token}`)).chapter;
    if (row?.series_id !== ref.series || row.token !== ref.token || !row.images) {
      throw new Error('Pages Flame Comics indisponibles.');
    }
    const stamp = Number.isSafeInteger(row.edit_time) ? `?${row.edit_time}` : '';
    const pages = Object.entries(row.images)
      .filter(
        ([index, image]) =>
          /^\d+$/.test(index) && /^[\w.-]+\.(?:png|jpe?g|webp)$/i.test(image?.name),
      )
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(
        ([, image]) =>
          `${cdn}/${ref.series}/${ref.token}/${encodeURIComponent(image.name)}${stamp}`,
      );
    if (!pages.length) throw new Error('Ce chapitre Flame Comics ne contient pas d’images.');
    return pages;
  },

  async health() {
    try {
      return (await catalogue()).length > 0;
    } catch {
      return false;
    }
  },
};
