/* global app */
// Example for Komga's public demo server. Credentials are published by Komga.
(function () {
  const base = 'https://demo.komga.org';
  const authorization = 'Basic ' + btoa('demo@komga.org:komga-demo');

  async function request(path, body) {
    const response = await app.fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error('Komga HTTP ' + response.status);
    }
    return JSON.parse(response.body);
  }

  // Mirror the explicit sensitive labels in services/sensitive.ts. Komga age
  // ratings describe audience age, not MangaDex's sexual-content scale.
  function normalizedGenre(value) {
    return String(value)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();
  }

  function hasExcludedGenre(genres) {
    return genres.some((value) => ['loli', 'shota', 'lolicon', 'shotacon'].includes(normalizedGenre(value)));
  }

  function ratingFromGenres(genres) {
    let rating;
    for (const value of genres) {
      const genre = normalizedGenre(value);
      if (genre === 'hentai' || genre === 'pornographic' || genre === 'pornographique') {
        return 'pornographic';
      }
      if (['adult', 'erotica', 'erotique', 'smut'].includes(genre)) rating = 'erotica';
    }
    return rating;
  }

  function toManga(series) {
    const metadata = series.metadata || {};
    const genres = (metadata.genres || [])
      .filter((genre) => typeof genre === 'string' && genre.trim())
      .slice(0, 30);
    if (hasExcludedGenre(genres)) return null;
    const altTitles = (metadata.alternateTitles || [])
      .map((entry) => entry && entry.title)
      .filter((title) => typeof title === 'string' && title.trim())
      .slice(0, 30);
    const rating = ratingFromGenres(genres);
    return {
      id: series.id,
      title: metadata.title || series.name || series.id,
      description: metadata.summary || undefined,
      genres,
      altTitles,
      ...(rating ? { contentRating: rating } : {}),
    };
  }

  function visibleManga(rows) {
    return rows.map(toManga).filter(Boolean);
  }

  async function availableGenres() {
    let values;
    try {
      const page = await request('/api/v2/genres?unpaged=true');
      values = page.content;
    } catch {
      // Older Komga servers expose the complete list at the v1 endpoint.
      values = await request('/api/v1/genres');
    }
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((value) => typeof value === 'string' && value.trim() && !hasExcludedGenre([value])))].map(
      (value) => ({
        id: 'genre:' + value,
        title: value,
        ...(ratingFromGenres([value]) ? { sensitive: true } : {}),
      }),
    );
  }

  globalThis.source = {
    async search(query) {
      const json = await request('/api/v1/series/list?size=30', { fullTextSearch: query });
      return visibleManga(json.content || []);
    },

    // Komga has no popularity data: show the series most recently added to the server.
    async recommendations() {
      const json = await request('/api/v1/series/new?size=20');
      return { title: 'Derniers ajouts', items: visibleManga(json.content || []) };
    },
    async discover() {
      const sections = [
        { title: 'Derniers ajouts', path: '/api/v1/series/new?size=20', more: 'recent' },
        { title: 'Récemment mis à jour', path: '/api/v1/series/updated?size=20', more: 'updated' },
      ];
      const result = [];
      for (const section of sections) {
        try {
          const json = await request(section.path);
          result.push({
            title: section.title,
            items: visibleManga(json.content || []),
            more: section.more,
          });
        } catch {
          // Skip this section.
        }
      }
      let genres = [];
      try {
        genres = await availableGenres();
      } catch {
        // Keep the sections available when the referential endpoint is unavailable.
      }
      return { sections: result, genres };
    },
    // Full catalogue, 30 series per page.
    async catalog(page, sort) {
      const sorts = [
        { id: 'az', title: 'A–Z', sort: 'metadata.titleSort,asc' },
        { id: 'recent', title: 'Ajouts récents', sort: 'createdDate,desc' },
        { id: 'updated', title: 'Mis à jour', sort: 'lastModifiedDate,desc' },
      ];
      const choice = sorts.find((item) => item.id === sort) || sorts[0];
      const genre =
        typeof sort === 'string' && sort.startsWith('genre:') ? sort.slice('genre:'.length) : null;
      if (genre !== null && (!genre || genre.length > 190 || /[\x00-\x1f\x7f]/.test(genre) || hasExcludedGenre([genre]))) {
        throw new Error('Genre Komga inconnu.');
      }
      const index = Math.max(0, (Number(page) || 1) - 1);
      const json = await request(
        '/api/v1/series/list?size=30&page=' + index + '&sort=' + encodeURIComponent(choice.sort),
        genre === null ? {} : { condition: { genre: { operator: 'is', value: genre } } },
      );
      return {
        items: visibleManga(json.content || []),
        hasMore: json.last === false,
        sorts: sorts.map((item) => ({ id: item.id, title: item.title })),
      };
    },
    async manga(id) {
      const json = await request('/api/v1/series/' + encodeURIComponent(id));
      let authors = [];
      try {
        const books = await request('/api/v1/series/' + encodeURIComponent(id) + '/books?size=1');
        const credits = (books.content && books.content[0] && books.content[0].metadata.authors) || [];
        authors = credits
          .map((credit) => credit && credit.name)
          .filter((name, index, all) => typeof name === 'string' && name.trim() && all.indexOf(name) === index)
          .slice(0, 20);
      } catch {
        // A missing book list must not hide the series details.
      }
      const manga = toManga(json);
      if (!manga) throw new Error('Titre indisponible dans cette source.');
      return { ...manga, authors };
    },

    async chapters(id) {
      // Komga's GET endpoint still works on the demo server. The newer POST
      // /books/list endpoint needs a more complex condition body.
      const json = await request('/api/v1/series/' + encodeURIComponent(id) + '/books?size=500');
      return (json.content || []).flatMap((book) => {
        const number = Number(book.metadata && book.metadata.numberSort);
        if (!Number.isFinite(number) || !book.media || book.media.pagesCount < 1) return [];
        return [
          {
            id: book.id,
            number: number,
            title: book.metadata.title || 'Livre ' + number,
            language: 'en',
            publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(book.metadata.releaseDate || '')
              ? book.metadata.releaseDate
              : undefined,
          },
        ];
      });
    },

    async pages(bookId) {
      const pages = await request('/api/v1/books/' + encodeURIComponent(bookId) + '/pages');
      return pages.map((page) => ({
        url: base + '/api/v1/books/' + encodeURIComponent(bookId) + '/pages/' + page.number,
        headers: { Authorization: authorization },
      }));
    },

    async health() {
      try {
        await request('/api/v1/series/list?size=1', {});
        return true;
      } catch {
        return false;
      }
    },
  };
})();
