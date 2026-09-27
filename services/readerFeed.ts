import type { ReaderPage } from './readerPages';

/** One chapter loaded in the reader. */
export type FeedSegment = {
  number: number;
  title: string;
  sourceId?: string;
  chapterId?: string;
  pages: ReaderPage[];
};

export type FeedItem =
  | { kind: 'page'; key: string; segment: number; page: number; data: ReaderPage }
  /** Closes chapter `segment`: "end of chapter / next chapter" between two chapters. */
  | { kind: 'transition'; key: string; segment: number; lastPage: number };

// Start loading the following chapter this many pages before the end of the last one.
const PRELOAD_PAGES = 4;

/** Pages of each loaded chapter in order, each chapter followed by its transition. */
export function buildFeed(segments: FeedSegment[]): FeedItem[] {
  return segments.flatMap((segment, index): FeedItem[] => [
    ...segment.pages.map((data, page) => ({
      kind: 'page' as const,
      key: `${segment.number}:${page}:${data.uri}`,
      segment: index,
      page,
      data,
    })),
    {
      kind: 'transition' as const,
      key: `end:${segment.number}`,
      segment: index,
      lastPage: Math.max(segment.pages.length - 1, 0),
    },
  ]);
}

/** Chapter and page shown at a feed index; a transition counts as its chapter's last page. */
export function feedPosition(
  items: FeedItem[],
  index: number,
): { segment: number; page: number } | null {
  const item = items[index];
  if (!item) return null;
  return item.kind === 'page'
    ? { segment: item.segment, page: item.page }
    : { segment: item.segment, page: item.lastPage };
}

/** Feed index of a chapter's page, to open the feed where reading stopped. */
export function feedIndexOf(items: FeedItem[], segment: number, page: number): number {
  const index = items.findIndex(
    (item) => item.kind === 'page' && item.segment === segment && item.page === page,
  );
  return Math.max(index, 0);
}

/** Whether the reader is close enough to the end of the last loaded chapter to load the next. */
export function shouldLoadNext(
  segments: FeedSegment[],
  position: { segment: number; page: number },
): boolean {
  const last = segments[segments.length - 1];
  return (
    !!last &&
    position.segment === segments.length - 1 &&
    position.page >= last.pages.length - PRELOAD_PAGES
  );
}
