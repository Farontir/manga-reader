import { cleanDescription, type MangaDetails } from './mangaDetails';

export type AniListManga = {
  id: number;
  title: string;
  altTitles: string[];
  coverUrl: string | null;
  description: string | null;
  status: string | null;
};

type Media = {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null } | null;
  description: string | null;
  status: string | null;
};
type Response = { data?: { Page?: { media?: Media[] } }; errors?: { message: string }[] };

/**
 * Display title first, then the others. English wins: AniList's romaji for a manhwa is
 * romanized Korean ("Na Honjaman Level Up" rather than "Solo Leveling").
 */
export function pickTitles(title: Media['title']): string[] {
  return [title.english, title.romaji, title.native].filter(
    (value, index, all): value is string => !!value?.trim() && all.indexOf(value) === index,
  );
}

const titlesQuery = `query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: MANGA) { id title { romaji english native } }
  }
}`;

// AniList allows 90 requests a minute: keep requests at least 700 ms apart.
let lastRequest = 0;

async function request(body: object): Promise<Media[]> {
  const wait = Math.max(0, 700 - (Date.now() - lastRequest));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`AniList indisponible (HTTP ${response.status}).`);
  const json = (await response.json()) as Response;
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? 'Erreur AniList.');
  return json.data?.Page?.media ?? [];
}

const detailsQuery = `query ($id: Int) {
  Media(id: $id, type: MANGA) {
    description(asHtml: false) genres status format countryOfOrigin chapters averageScore
    startDate { year }
    staff(perPage: 6, sort: RELEVANCE) { edges { role node { name { full } } } }
  }
}`;

type DetailsMedia = {
  description: string | null;
  genres: string[] | null;
  status: string | null;
  format: string | null;
  countryOfOrigin: string | null;
  chapters: number | null;
  averageScore: number | null;
  startDate: { year: number | null } | null;
  staff: { edges: { role: string; node: { name: { full: string | null } } }[] } | null;
};

/** Synopsis and details of one AniList manga (authors = story and art staff). */
export async function fetchAniListDetails(id: number): Promise<{
  description: string | null;
  details: Omit<MangaDetails, 'fetchedAt'>;
}> {
  const wait = Math.max(0, 700 - (Date.now() - lastRequest));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: detailsQuery, variables: { id } }),
  });
  if (!response.ok) throw new Error(`AniList indisponible (HTTP ${response.status}).`);
  const json = (await response.json()) as { data?: { Media?: DetailsMedia } };
  const media = json.data?.Media;
  if (!media) throw new Error('Manga introuvable sur AniList.');
  const authors = (media.staff?.edges ?? [])
    .filter((edge) => /story|art|original/i.test(edge.role))
    .map((edge) => edge.node.name.full)
    .filter((name, index, all): name is string => !!name && all.indexOf(name) === index);
  return {
    description: cleanDescription(media.description),
    details: {
      genres: media.genres ?? [],
      authors,
      status: media.status,
      format: media.format,
      country: media.countryOfOrigin,
      year: media.startDate?.year ?? null,
      score: media.averageScore,
      chapters: media.chapters,
    },
  };
}

/** Ordered titles (see pickTitles) for up to 50 AniList ids. */
export async function fetchAniListTitles(ids: number[]): Promise<Map<number, string[]>> {
  if (!ids.length) return new Map();
  const media = await request({ query: titlesQuery, variables: { ids: ids.slice(0, 50) } });
  return new Map(media.map((item) => [item.id, pickTitles(item.title)]));
}

const query = `query ($search: String!) {
  Page(page: 1, perPage: 12) {
    media(search: $search, type: MANGA, isAdult: false) {
      id title { romaji english native } coverImage { large } description(asHtml: false) status
    }
  }
}`;
const cache = new Map<string, { at: number; results: AniListManga[] }>();

export async function searchAniList(term: string): Promise<AniListManga[]> {
  const key = term.trim().toLowerCase();
  if (key.length < 2) return [];
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.results;
  const media = await request({ query, variables: { search: term.trim() } });
  const results = media.map((media) => {
    const titles = pickTitles(media.title);
    return {
      id: media.id,
      title: titles[0] ?? `Manga ${media.id}`,
      altTitles: titles.slice(1),
      coverUrl: media.coverImage?.large ?? null,
      description: media.description,
      status: media.status,
    };
  });
  cache.set(key, { at: Date.now(), results });
  return results;
}
