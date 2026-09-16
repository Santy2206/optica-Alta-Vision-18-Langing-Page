/**
 * Tailwind v4 note:
 * Design tokens live in `src/styles/global.css` under `@theme`
 * (aguamarina, verde-neon, fucsia, font-sans / Poppins).
 * This file is kept as a pointer for the design system contract;
 * the Vite plugin `@tailwindcss/vite` does not require JS theme config.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        aguamarina: '#00B4B0',
        'verde-neon': '#39FF14',
        fucsia: '#FF1493',
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
