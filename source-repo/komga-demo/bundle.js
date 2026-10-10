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

  function toManga(series) {
    return {
      id: series.id,
      title: (series.metadata && series.metadata.title) || series.name || series.id,
      description: (series.metadata && series.metadata.summary) || undefined,
    };
  }

  globalThis.source = {
    async search(query) {
      const json = await request('/api/v1/series/list?size=30', { fullTextSearch: query });
      return (json.content || []).map(toManga);
    },

    // Komga has no popularity data: show the series most recently added to the server.
    async recommendations() {
      const json = await request('/api/v1/series/new?size=20');
      return { title: 'Derniers ajouts', items: (json.content || []).map(toManga) };
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
            items: (json.content || []).map(toManga),
            more: section.more,
          });
        } catch {
          // Skip this section.
        }
      }
      return { sections: result };
    },
    // Full catalogue, 30 series per page.
    async catalog(page, sort) {
      const sorts = [
        { id: 'az', title: 'A–Z', sort: 'metadata.titleSort,asc' },
        { id: 'recent', title: 'Ajouts récents', sort: 'createdDate,desc' },
        { id: 'updated', title: 'Mis à jour', sort: 'lastModifiedDate,desc' },
      ];
      const choice = sorts.find((item) => item.id === sort) || sorts[0];
      const index = Math.max(0, (Number(page) || 1) - 1);
      const json = await request(
        '/api/v1/series/list?size=30&page=' + index + '&sort=' + encodeURIComponent(choice.sort),
        {},
      );
      return {
        items: (json.content || []).map(toManga),
        hasMore: json.last === false,
        sorts: sorts.map((item) => ({ id: item.id, title: item.title })),
      };
    },
    async manga(id) {
      const json = await request('/api/v1/series/' + encodeURIComponent(id));
      return toManga(json);
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
