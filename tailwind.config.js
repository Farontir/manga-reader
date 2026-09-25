module.exports = {
  content: ['./app/**/*.{ts,tsx}', './ui/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#121820',
        paper: '#F7F5F0',
        accent: '#EE6B4D',
        muted: '#707985',
      },
    },
  },
  plugins: [],
};
