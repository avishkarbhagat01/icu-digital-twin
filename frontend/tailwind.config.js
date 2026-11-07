/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'Segoe UI', 'sans-serif'] },
      colors: {
        ink: { 950: '#0A1424', 900: '#0F1D31', 800: '#172A42', 700: '#22384F', 300: '#9FB1C5' },
        canvas: '#F1F4F7',
        line: '#DAE1E8',
        muted: '#5B6B7C',
        accent: { DEFAULT: '#0B7A85', dark: '#085E67', soft: '#E1F1F2' },
        low: { DEFAULT: '#1D8758', soft: '#E3F3EA' },
        med: { DEFAULT: '#A66A0C', soft: '#FBEFD6' },
        high: { DEFAULT: '#BF352B', soft: '#FBE4E1' },
      },
    },
  },
  plugins: [],
}
