## Development

```bash
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview
```

Node `>=22.12.0`. Stack: Astro 7 + Tailwind CSS v4 (`@tailwindcss/vite`) + TypeScript strict.

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

## Negocio (Fase 0)

- WhatsApp: `wa.me/573118812747` (`site.telefono`)
- Horario: Lunes a Sábado, 11am - 8pm (validar con cliente)
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
