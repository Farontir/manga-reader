/* global app */
// Standalone MangaDex source. This file is hosted separately from the application.
// The sandbox supplies app.fetch and expects globalThis.source.
(function () {
  const api = 'https://api.mangadex.org';

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

  function toManga(manga) {
    const attributes = manga.attributes || {};
    const altTitles = (attributes.altTitles || []).map(localized).filter(Boolean);
    const link = attributes.links && attributes.links.al;
    const anilistId = link && Number(link);
    return {
      id: manga.id,
      title: localized(attributes.title) || manga.id,
      altTitles: altTitles,
      coverUrl: coverOf(manga),
      description: localized(attributes.description),
      anilistId: Number.isInteger(anilistId) ? anilistId : undefined,
    };
  }

  globalThis.source = {
    async search(query) {
      const params = new URLSearchParams();
      params.set('title', query);
      params.set('limit', '20');
      params.append('includes[]', 'cover_art');
      params.append('contentRating[]', 'safe');
      const json = await request('/manga?' + params.toString());
      return (json.data || []).map(toManga);
    },

    async manga(id) {
      const json = await request('/manga/' + encodeURIComponent(id) + '?includes[]=cover_art');
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
