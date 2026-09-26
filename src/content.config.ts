import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Content Collections — Óptica Alta Visión
 * Contrato consumido por UI (sesión 3.x) y Decap CMS (public/admin/config.yml).
 * site.json (src/content/configuracion/) NO es colección: se importa como JSON estático.
 */

const catalogo = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/catalogo' }),
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    category: z.enum(['formuladas', 'sol', 'ninos', 'deportivas']),
    /** null = "Consultar precio" (WhatsApp) */
    price: z.number().nullable(),
    /** Ruta pública, p.ej. /uploads/catalogo/rayban-aviator.webp */
    image: z.string(),
    imageAlt: z.string(),
    featured: z.boolean().default(false),
  }),
});

const promociones = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/promociones' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string().optional(),
    active: z.boolean().default(false),
    ctaText: z.string().default('Aprovecha esta promo'),
  }),
});

const carrusel = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/carrusel' }),
  schema: z.object({
    /** Ruta pública, p.ej. /uploads/carrusel/cupon-bienvenida.webp */
    image: z.string(),
    imageAlt: z.string(),
    /** Si se deja vacío, el banner enlaza a WhatsApp por defecto */
    link: z.string().optional(),
    active: z.boolean().default(true),
    /** Menor número = aparece primero */
    order: z.number().default(0),
  }),
});

export const collections = { catalogo, promociones, carrusel };
