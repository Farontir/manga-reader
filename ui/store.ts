import { create } from 'zustand';

type ReaderState = {
  mode: 'paged' | 'webtoon';
  setMode: (mode: 'paged' | 'webtoon') => void;
  /** A reader screen is open: background source work waits for it to close. */
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useReaderState = create<ReaderState>((set) => ({
  // Webtoon (vertical scrolling) by default; the reader toolbar switches to paged.
  mode: 'webtoon',
  setMode: (mode) => set({ mode }),
  open: false,
  setOpen: (open) => set({ open }),
}));
