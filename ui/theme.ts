export type Theme = {
  background: string;
  surface: string;
  foreground: string;
  secondary: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
};

export const themes: Record<'light' | 'dark', Theme> = {
  light: {
    background: '#F7F5F0', surface: '#FFFFFF', foreground: '#121820',
    secondary: '#707985', border: '#E6E5E0', accent: '#EE6B4D',
    accentText: '#FFFFFF', danger: '#CF3C3C', success: '#23855D',
  },
  dark: {
    background: '#111519', surface: '#1D2328', foreground: '#F4F2EC',
    secondary: '#ADB4B8', border: '#353D41', accent: '#FF8667',
    accentText: '#111519', danger: '#FF7070', success: '#70CFA0',
  },
};
