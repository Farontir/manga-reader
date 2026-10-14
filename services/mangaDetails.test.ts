import { describe, expect, it } from 'vitest';

import { cleanDescription, detailsLine, type MangaDetails } from './mangaDetails';

const details = (overrides: Partial<MangaDetails>): MangaDetails => ({
  genres: [],
  authors: [],
  status: null,
  format: null,
  country: null,
  year: null,
  score: null,
  chapters: null,
  fetchedAt: '2026-10-14',
  ...overrides,
});

describe('manga details', () => {
  it('turns AniList HTML descriptions into plain text paragraphs', () => {
    expect(
      cleanDescription(
        'Ten years ago, &quot;the Gate&quot; appeared.<br><br>\n<i>Hunters</i> &amp; mages<br>(Source: Webtoon)',
      ),
    ).toBe('Ten years ago, "the Gate" appeared.\n\nHunters & mages\n(Source: Webtoon)');
    expect(cleanDescription('  <br> ')).toBeNull();
    expect(cleanDescription(null)).toBeNull();
  });

  it('summarises known details in French', () => {
    expect(
      detailsLine(
        details({
          format: 'MANGA',
          country: 'KR',
          status: 'FINISHED',
          year: 2018,
          score: 84,
          chapters: 201,
        }),
      ),
    ).toBe('Manhwa · Terminé · 2018 · ★ 8,4 · 201 chapitres');
    expect(detailsLine(details({ format: 'MANGA', country: 'JP', status: 'RELEASING' }))).toBe(
      'Manga · En cours',
    );
    expect(detailsLine(null, 'HIATUS')).toBe('En pause');
  });
});
