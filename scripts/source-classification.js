// Keep this source-side mapping aligned with services/sensitive.ts. A missing
// rating stays unknown; neither Ecchi nor Mature alone marks a title sensitive.
const ratings = new Map([
  ['adult', 'erotica'],
  ['erotica', 'erotica'],
  ['erotique', 'erotica'],
  ['smut', 'erotica'],
  ['hentai', 'pornographic'],
  ['pornographic', 'pornographic'],
  ['pornographique', 'pornographic'],
]);

function normalized(value) {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

export function ratingFromGenres(genres) {
  let result;
  for (const genre of genres) {
    const rating = ratings.get(normalized(genre));
    if (rating === 'pornographic') return rating;
    if (rating) result = rating;
  }
  return result;
}

export function category(id, title) {
  return ratingFromGenres([title]) ? { id, title, sensitive: true } : { id, title };
}
