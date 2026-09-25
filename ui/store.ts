import { create } from 'zustand';

type ReaderState = {
  mode: 'paged' | 'webtoon';
  setMode: (mode: 'paged' | 'webtoon') => void;
};

export const useReaderState = create<ReaderState>((set) => ({
  mode: 'paged',
  setMode: (mode) => set({ mode }),
}));
