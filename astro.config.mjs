// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// URL pública del sitio: única fuente para canonical, og:url, schema, sitemap y robots.txt.
// Al pasar a dominio propio, cambiar SOLO esta línea.
export const SITE_URL = 'https://opticaltavision18.com';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});
