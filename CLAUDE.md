## Development

```bash
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview
npm run og       # regenera public/og-default.png (1200×630) desde site.json
```

Node `>=22.12.0`. Stack: Astro 7 + Tailwind CSS v4 (`@tailwindcss/vite`) + TypeScript strict + `@astrojs/sitemap`.

## Design tokens (Tailwind v4)

Theme lives in CSS, not JS: `src/styles/global.css` `@theme`.

| Token | Hex | Uso |
| --- | --- | --- |
| `aguamarina` | `#00B4B0` | Dominante (60–70%): fondos, header, secciones |
| `verde-neon` | `#39FF14` | SOLO botones CTA sólidos (texto blanco/negro encima; nunca como color de texto) |
| `fucsia` | `#FF1493` | Acento: badges promo, hover |
| font-sans | Poppins (`@fontsource/poppins`) | Global vía BaseLayout |

Utilities: `bg-aguamarina`, `bg-verde-neon`, `text-fucsia`, etc.

`tailwind.config.mjs` es solo documentación del contrato; el runtime usa `@theme` en CSS.

## Layout base

`src/layouts/BaseLayout.astro` — `lang="es"`, props `title` + `description`, slot default + slot `head` para SEO.

## Estructura

```
src/components/              # UI (vacío hasta sesión 2.1+)
src/content.config.ts        # Zod schemas + glob loaders
src/content/catalogo/*.json  # monturas (collection)
src/content/promociones/*.json
src/content/configuracion/site.json  # NO collection — import JSON
src/layouts/BaseLayout.astro
src/pages/index.astro
src/styles/global.css
public/admin/config.yml      # Decap CMS (auth pendiente sesión 09)
public/uploads/{catalogo,promociones}/
```

## Content schema (contrato)

**catalogo** (`getCollection('catalogo')`):
`name`, `brand`, `category` enum `formuladas|sol|ninos|deportivas`,
`price` number|null (`null` → "Consultar precio"), `image`, `imageAlt`, `featured`.

**promociones** (`getCollection('promociones')`):
`title`, `description`, `image?`, `active` default false, `ctaText` default "Aprovecha esta promo".

**site** (no collection):
```ts
import site from '../content/configuracion/site.json';
// site.telefono → wa.me/${site.telefono}
```

Campos Decap en `public/admin/config.yml` deben mantenerse alineados con Zod.
Media: `public/uploads` → URL `/uploads/...`.

## Performance / QA

- Imágenes: el CMS (Decap) guarda en `public/uploads`. **Antes de subir fotos reales vía CMS, convertir a WebP** para mantener el performance. Recomendado: `sharp` o `cwebp`.
- Lazy loading: todas las `<img>` del catálogo/promociones usan `loading="lazy"`. La futura imagen Hero (above-the-fold) **NO** debe llevar `lazy`.
- Contraste: CTAs `bg-verde-neon` usan `text-slate-900` + `border-2 border-slate-900` salvo sobre `bg-slate-900`/`bg-slate-950`, donde el borde ya no hace falta (13:1+). Badges `bg-fucsia` usan `text-white` (slate-900 da solo 3.01:1).
- Paleta (Fase 9): 60% blanco/`slate-50`, ~30% `bg-brand-footer` (tinte claro de aguamarina 15%, usado en footer y CTAs finales), 10% acentos `fucsia`/`verde-neon`. `slate-900`/`slate-950` sólido queda reservado a texto y bordes, no a fondos de sección completa — el usuario pidió reemplazar el footer/CTA oscuro por un tono claro dominante de aguamarina (2026-09-28).
- Header: el nav completo aparece desde `lg` (1024px), no `md` — a 768px no cabía junto al logo y el botón. Por debajo de `lg` se usa el menú hamburguesa.
- `src/utils/images.ts` → `isPlaceholderImage()`. `src/components/FrameShapeIcon.astro` dibuja la silueta SVG de una montura por forma (`src/data/frameShape.ts`); se usa cuando el catálogo aún tiene `placeholder-*.webp`.
- Lighthouse (sesión 10): `npm run build && npm run preview && npx lighthouse http://localhost:<port> ...`
  - Última corrida (móvil, Fase 7): Performance 99, Accessibility 100, Best Practices 100, SEO 100 en /, /catalogo y /nosotros.
- Contraste: texto sobre `bg-aguamarina` va en `text-slate-900` (blanco da 2.57:1, falla AA).

## SEO

- `SITE_URL` en `astro.config.mjs` es la única fuente del dominio (canonical, og:url, schema, sitemap, `robots.txt` generado en `src/pages/robots.txt.ts`).
- Titles/descriptions por página: `src/utils/seo.ts` (desde `site.barrio`, `site.tiempoEntrega`).
- og:image = `site.heroImagen` o `public/og-default.png`. Correr `npm run og` si cambian barrio o reseñas.
- Schema Optician sin `aggregateRating` (reseñas de Google son de terceros).

## Negocio (Fase 0)

- WhatsApp: `wa.me/573118812747` (`site.telefono`)
- Horario: `site.horario { dias[], abre, cierra }` → texto visible y schema salen de ahí (`utils/site.ts`). Actual 11:00–20:00 L–S; **pendiente confirmar** (Google Maps dice 10am).
- Hosting: Netlify + Decap (`git-gateway`); Identity en sesión 09
- Pendiente: dirección exacta, GBP, dominio, fotos/catálogo real

## Sesiones siguientes

UI: `03_Header_Hero` (2.1). No montar widget Decap/Identity todavía (09_CMS_Auth_Setup).

## Documentation

Full documentation: https://docs.astro.build

- [Routing](https://docs.astro.build/en/guides/routing/)
- [Components](https://docs.astro.build/en/basics/astro-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Styling / Tailwind](https://docs.astro.build/en/guides/styling/)
