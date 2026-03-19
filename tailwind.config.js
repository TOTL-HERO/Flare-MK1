/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        flare: {
          orange: '#FF6B00',
          dark: '#0F0F0F',
          gray: '#1A1A1A',
          border: '#2A2A2A',
        },
      },
    },
  },
  plugins: [],
}
