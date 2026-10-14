/* global app */
// Standalone MangaDex source. This file is hosted separately from the application.
// The sandbox supplies app.fetch and expects globalThis.source.
(function () {
  const api = 'https://api.mangadex.org';
  const excludedTagIds = [
    '2d1f5d56-a1e5-4d0d-a961-2193588b08ec',
    'ddefd648-5140-4e5f-ba18-4eca4071d19b',
  ];
  const allRatings = ['safe', 'suggestive', 'erotica', 'pornographic'];

  async function request(path) {
    const response = await app.fetch(api + path, { headers: { Accept: 'application/json' } });
    if (response.status < 200 || response.status >= 300) {
      throw new Error('MangaDex HTTP ' + response.status);
    }
    return JSON.parse(response.body);
  }

  function localized(value) {
    if (!value || typeof value !== 'object') return '';
    return value.en || value.ja || Object.values(value)[0] || '';
  }

  function coverOf(manga) {
    const relation = (manga.relationships || []).find((item) => item.type === 'cover_art');
    const fileName = relation && relation.attributes && relation.attributes.fileName;
    return fileName
      ? 'https://uploads.mangadex.org/covers/' + manga.id + '/' + fileName + '.256.jpg'
      : undefined;
  }

  // English first: a manhwa's main title is often romanized Korean, with the English one
  // only among the alternative titles.
  function displayTitle(attributes) {
    const title = attributes.title || {};
    if (title.en) return title.en;
    const english = (attributes.altTitles || []).find((alt) => alt && alt.en);
    return english ? english.en : localized(title);
  }

  // MangaDex groups its tags as genre, theme, format and content. Keep every group
  // on the title page so the metadata matches the categories available in Discover.
  function genresOf(attributes) {
    const rating = attributes.contentRating;
    const labels = rating === 'pornographic' || rating === 'erotica'
      ? ['Adult', rating === 'pornographic' ? 'Pornographique' : 'Érotique']
      : rating === 'suggestive' ? ['Suggestif'] : [];
    return labels.concat((attributes.tags || [])
      .filter((tag) => tag.attributes && !excludedTagIds.includes(tag.id))
      .map((tag) => localized(tag.attributes.name))
      .filter(Boolean));
  }

  function authorsOf(manga) {
    return (manga.relationships || [])
      .filter((item) => (item.type === 'author' || item.type === 'artist') && item.attributes)
      .map((item) => item.attributes.name)
      .filter((name, index, all) => name && all.indexOf(name) === index);
  }

  function toManga(manga) {
    const attributes = manga.attributes || {};
    const title = displayTitle(attributes);
    const altTitles = [localized(attributes.title)]
      .concat((attributes.altTitles || []).map(localized))
      .filter((alt, index, all) => alt && alt !== title && all.indexOf(alt) === index);
    const link = attributes.links && attributes.links.al;
    const anilistId = link && Number(link);
    return {
      id: manga.id,
      title: title || manga.id,
      genres: genresOf(attributes),
      authors: authorsOf(manga),
      altTitles: altTitles,
      coverUrl: coverOf(manga),
      description: localized(attributes.description),
      anilistId: Number.isInteger(anilistId) ? anilistId : undefined,
    };
  }

  function listParams(order) {
    const value = new URLSearchParams();
    value.set('limit', '20');
    value.set(order, 'desc');
    value.set('hasAvailableChapters', 'true');
    value.append('availableTranslatedLanguage[]', 'en');
    value.append('includes[]', 'cover_art');
    value.append('contentRating[]', 'safe');
    for (const id of excludedTagIds) value.append('excludedTags[]', id);
    return value;
  }

  async function list(params) {
    return ((await request('/manga?' + params.toString())).data || []).map(toManga);
  }

  // Popular new titles, like MangaDex's home page: most followed series created in the
  // last 30 days that already have English chapters.
  function trendingParams() {
    const params = listParams('order[followedCount]');
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    params.set('createdAtSince', since.toISOString().slice(0, 19));
    return params;
  }

  const CATALOG_PAGE = 30;
  // MangaDex refuses list requests whose offset + limit go beyond 10 000.
  const CATALOG_MAX = 10000;
  const CATALOG_SORTS = [
    { id: 'popular', title: 'Populaires', order: 'order[followedCount]', direction: 'desc' },
    { id: 'updated', title: 'Mis à jour', order: 'order[latestUploadedChapter]', direction: 'desc' },
    { id: 'new', title: 'Nouveautés', order: 'order[createdAt]', direction: 'desc' },
    { id: 'az', title: 'A–Z', order: 'order[title]', direction: 'asc' },
  ];
  const CONTENT_CATEGORIES = [
    { id: 'rating:safe', title: 'Tout public', ratings: ['safe'] },
    { id: 'rating:suggestive', title: 'Suggestif', ratings: ['suggestive'] },
    { id: 'rating:erotica', title: 'Érotique', ratings: ['erotica'] },
    { id: 'rating:pornographic', title: 'Pornographique', ratings: ['pornographic'] },
    { id: 'rating:adult', title: 'Adult', ratings: ['erotica', 'pornographic'] },
  ];

  // Listing ids understood by catalog(): a sort above, 'trending', a MangaDex tag,
  // or an explicit content category. General lists remain safe.
  function listingParams(listing) {
    if (listing === 'trending') {
      const params = trendingParams();
      params.delete('limit');
      return params;
    }
    const tag = typeof listing === 'string' && listing.startsWith('tag:') ? listing.slice(4) : '';
    if (tag && (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(tag) ||
        excludedTagIds.includes(tag))) throw new Error('Catégorie MangaDex inconnue.');
    const rating = CONTENT_CATEGORIES.find((item) => item.id === listing);
    if (typeof listing === 'string' && listing.startsWith('rating:') && !rating) {
      throw new Error('Classification MangaDex inconnue.');
    }
    const choice = CATALOG_SORTS.find((item) => item.id === listing) || CATALOG_SORTS[0];
    const params = listParams(tag ? 'order[followedCount]' : choice.order);
    params.delete('limit');
    if (!tag) params.set(choice.order, choice.direction);
    if (tag) params.append('includedTags[]', tag);
    if (tag || rating) {
      params.delete('contentRating[]');
      for (const value of rating ? rating.ratings : allRatings) {
        params.append('contentRating[]', value);
      }
    }
    return params;
  }

  let categories = null;

  // Every tag group plus explicit content ratings, fetched once per sandbox session.
  async function categoryList() {
    if (!categories) {
      const json = await request('/manga/tag');
      const tags = (json.data || [])
        .filter((tag) => tag.attributes && tag.attributes.name &&
          !excludedTagIds.includes(tag.id))
        .map((tag) => ({ id: 'tag:' + tag.id, title: localized(tag.attributes.name) }))
        .filter((tag) => tag.title)
        .sort((a, b) => a.title.localeCompare(b.title));
      categories = CONTENT_CATEGORIES.map(({ id, title }) => ({ id, title })).concat(tags);
    }
    return categories;
  }

  globalThis.source = {
    async search(query) {
      const params = new URLSearchParams();
      params.set('title', query);
      params.set('limit', '20');
      params.append('includes[]', 'cover_art');
      params.append('contentRating[]', 'safe');
      for (const id of excludedTagIds) params.append('excludedTags[]', id);
      const json = await request('/manga?' + params.toString());
      return (json.data || []).map(toManga);
    },

    // Popular new titles, like MangaDex's home page: most followed series created in the
    // last 30 days that already have English chapters, topped up with fresh updates.
    // Kept for app builds that only know the single-section recommendations().
    async recommendations() {
      const items = await list(trendingParams());
      if (items.length < 10) {
        for (const manga of await list(listParams('order[latestUploadedChapter]'))) {
          if (!items.some((item) => item.id === manga.id)) items.push(manga);
        }
      }
      return { title: 'Tendances', items: items.slice(0, 20) };
    },

    // Discover page: each section loads on its own, so one failing request keeps the others.
    async discover() {
      const sections = [
        { title: 'Tendances', params: trendingParams(), more: 'trending' },
        {
          title: 'Mises à jour récentes',
          params: listParams('order[latestUploadedChapter]'),
          more: 'updated',
        },
        { title: 'Les plus suivis', params: listParams('order[followedCount]'), more: 'popular' },
      ];
      const result = [];
      for (const section of sections) {
        try {
          result.push({ title: section.title, items: await list(section.params), more: section.more });
        } catch {
          // Skip this section.
        }
      }
      let categories = [];
      try {
        categories = await categoryList();
      } catch {
        // Categories are optional.
      }
      return { sections: result, genres: categories };
    },

    // Full catalogue, 30 readable titles (English chapters) per page.
    async catalog(page, sort) {
      if (typeof sort === 'string' && sort.startsWith('tag:') &&
          !(await categoryList()).some((category) => category.id === sort)) {
        throw new Error('Catégorie MangaDex inconnue.');
      }
      const sorts = CATALOG_SORTS.map((item) => ({ id: item.id, title: item.title }));
      const offset = (Math.max(1, Number(page) || 1) - 1) * CATALOG_PAGE;
      if (offset + CATALOG_PAGE > CATALOG_MAX) return { items: [], hasMore: false, sorts: sorts };
      const params = listingParams(sort);
      params.set('limit', String(CATALOG_PAGE));
      params.set('offset', String(offset));
      const json = await request('/manga?' + params.toString());
      const items = (json.data || []).map(toManga);
      const total = Math.min(Number(json.total) || 0, CATALOG_MAX);
      return { items: items, hasMore: offset + items.length < total, sorts: sorts };
    },

    async manga(id) {
      const json = await request(
        '/manga/' +
          encodeURIComponent(id) +
          '?includes[]=cover_art&includes[]=author&includes[]=artist',
      );
      if ((json.data?.attributes?.tags || []).some((tag) => excludedTagIds.includes(tag.id))) {
        throw new Error('Titre indisponible dans cette source.');
      }
      return toManga(json.data);
    },

    async chapters(id) {
      const all = [];
      for (let offset = 0; offset < 2000; offset += 500) {
        const params = new URLSearchParams();
        params.set('limit', '500');
        params.set('offset', String(offset));
        params.append('translatedLanguage[]', 'en');
        params.set('order[chapter]', 'desc');
        const json = await request(
          '/manga/' + encodeURIComponent(id) + '/feed?' + params.toString(),
        );
        const batch = json.data || [];
        all.push(...batch);
        if (batch.length < 500 || offset + batch.length >= json.total) break;
      }
      return all.flatMap((chapter) => {
        const attributes = chapter.attributes || {};
        const number = Number(attributes.chapter);
        if (!Number.isFinite(number) || attributes.externalUrl || !attributes.pages) return [];
        return [
          {
            id: chapter.id,
            number: number,
            title: attributes.title || 'Chapitre ' + number,
            language: attributes.translatedLanguage || 'en',
            publishedAt: attributes.publishAt || undefined,
          },
        ];
      });
    },

    async pages(chapterId) {
      const json = await request('/at-home/server/' + encodeURIComponent(chapterId));
      const chapter = json.chapter || {};
      if (!json.baseUrl || !chapter.hash || !Array.isArray(chapter.data)) return [];
      return chapter.data.map((file) => json.baseUrl + '/data/' + chapter.hash + '/' + file);
    },

    async health() {
      try {
        await request('/manga?limit=1');
        return true;
      } catch {
        return false;
      }
    },
  };
})();
