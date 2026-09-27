type Layout = { y: number; height: number };

// The page under this line (a third down the screen) is the one being read.
const READING_LINE = 1 / 3;
// Slack for sub-pixel offsets and iOS rubber-banding at the ends of the list.
const EDGE_TOLERANCE = 2;

/**
 * Current page of a vertical strip reader, from the scroll position. The first page wins at
 * the very top and the last page at the very bottom, so a chapter whose final strips are
 * shorter than the screen still reaches its last page (and is marked read).
 */
export function pageAtScroll(
  count: number,
  getLayout: (index: number) => Layout | undefined,
  offset: number,
  viewportHeight: number,
  contentHeight: number,
): number | null {
  if (count <= 0) return null;
  if (offset <= EDGE_TOLERANCE) return 0;
  if (offset + viewportHeight >= contentHeight - EDGE_TOLERANCE) return count - 1;
  const line = offset + viewportHeight * READING_LINE;
  // Layouts are stacked top to bottom: binary search the page containing the line.
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const layout = getLayout(middle);
    if (!layout) return null;
    if (line < layout.y) high = middle - 1;
    else if (line >= layout.y + layout.height) low = middle + 1;
    else return middle;
  }
  return Math.min(Math.max(low, 0), count - 1);
}
