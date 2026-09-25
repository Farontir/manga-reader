/* global app */
import { load } from 'cheerio';

const base = 'https://www.peppercarrot.com';
const indexUrl = `${base}/en/webcomics/peppercarrot.html`;
const description =
  'Les aventures de Pepper, une jeune sorcière, et de son chat Carrot. Œuvre libre de David Revoy (CC BY 4.0).';

async function document(url) {
  const response = await app.fetch(url, { headers: { Accept: 'text/html' } });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Pepper&Carrot HTTP ${response.status}`);
  }
  return load(response.body);
}

function episodeUrl(href) {
  if (!href) return null;
  const url = new URL(href, base);
  if (url.origin !== base || !/^\/en\/webcomic\/ep\d{2}_[a-z0-9-]+\.html$/i.test(url.pathname)) {
    return null;
  }
  return url.toString();
}

async function series() {
  const $ = await document(indexUrl);
  const cover = $('figure.thumbnail img').first().attr('src');
  return {
    id: 'peppercarrot',
    title: 'Pepper&Carrot',
    altTitles: ['Pepper and Carrot'],
    description,
    coverUrl: cover ? new URL(cover, base).toString() : undefined,
  };
}

globalThis.source = {
  async search(query) {
    if (!/pepper|carrot/i.test(query)) return [];
    return [await series()];
  },

  async manga(id) {
    if (id !== 'peppercarrot') throw new Error('Série inconnue.');
    return series();
  },

  async chapters(id) {
    if (id !== 'peppercarrot') throw new Error('Série inconnue.');
    const $ = await document(indexUrl);
    const chapters = [];
    $('figure.thumbnail').each((_, element) => {
      const link = $(element).find('figcaption a').first();
      const url = episodeUrl(link.attr('href'));
      const title = link.text().trim();
      const number = Number(url?.match(/\/ep(\d{2})_/i)?.[1]);
      if (!url || !Number.isFinite(number)) return;
      const publishedAt = $(element)
        .find('.caption-smaller')
        .text()
        .match(/\d{4}-\d{2}-\d{2}/)?.[0];
      chapters.push({ id: url, number, title, language: 'en', publishedAt });
    });
    return chapters;
  },

  async pages(id) {
    const url = episodeUrl(id);
    if (!url) throw new Error('Épisode inconnu.');
    const $ = await document(url);
    const pages = [];
    $('.webcomic-page img[title^="Page "]').each((_, element) => {
      const src = $(element).attr('src');
      if (!src) return;
      const image = new URL(src, base);
      if (image.origin === base && /\.(?:jpg|jpeg|png|webp)$/i.test(image.pathname)) {
        pages.push(image.toString());
      }
    });
    return pages;
  },

  async health() {
    try {
      const $ = await document(indexUrl);
      return $('figure.thumbnail figcaption a').length > 0;
    } catch {
      return false;
    }
  },
};
