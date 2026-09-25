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

const query = `query ($search: String!) {
  Page(page: 1, perPage: 12) {
    media(search: $search, type: MANGA, isAdult: false) {
      id title { romaji english native } coverImage { large } description(asHtml: false) status
    }
  }
}`;
const cache = new Map<string, { at: number; results: AniListManga[] }>();
let lastRequest = 0;

export async function searchAniList(term: string): Promise<AniListManga[]> {
  const key = term.trim().toLowerCase();
  if (key.length < 2) return [];
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.results;
  const wait = Math.max(0, 700 - (Date.now() - lastRequest));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { search: term.trim() } }),
  });
  if (!response.ok) throw new Error(`AniList indisponible (HTTP ${response.status}).`);
  const json = (await response.json()) as Response;
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? 'Erreur AniList.');
  const results = (json.data?.Page?.media ?? []).map((media) => {
    const titles = [media.title.romaji, media.title.english, media.title.native].filter(
      (title): title is string => Boolean(title),
    );
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
