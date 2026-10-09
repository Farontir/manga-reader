import { create } from 'zustand';

type ReaderState = {
  mode: 'paged' | 'webtoon';
  setMode: (mode: 'paged' | 'webtoon') => void;
};

export const useReaderState = create<ReaderState>((set) => ({
  // Webtoon (vertical scrolling) by default; the reader toolbar switches to paged.
  mode: 'webtoon',
  setMode: (mode) => set({ mode }),
}));
