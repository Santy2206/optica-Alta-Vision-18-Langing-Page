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
    category: z.enum(['formuladas', 'sol', 'ninos', 'deportivas', 'contacto']),
    /** null/omitido = "Monturas desde $X" (site.precioDesdeMontura) o "Cotiza por WhatsApp".
     * Decap deja el campo ausente si no se llena (required: false); no envía null. */
    price: z.number().nullable().optional().default(null),
    /** Ruta pública, p.ej. /uploads/catalogo/rayban-aviator.webp */
    image: z.string(),
    imageAlt: z.string(),
    featured: z.boolean().default(false),
    /** Colores del MARCO (swatches en la tarjeta del catálogo) */
    colors: z
      .array(
        z.object({
          name: z.string(),
          hex: z.string(),
          /** Segundo tono para marcos bicolor (el swatch se muestra partido en diagonal) */
          hex2: z.string().optional(),
          /** Si se define, al hacer clic en el swatch cambia la foto de la tarjeta */
          image: z.string().optional(),
          /** Si se define, al pasar el mouse por la foto se muestra un modelo usando esta montura en este color */
          modelImage: z.string().optional(),
          /** Colores de LENTE disponibles para este marco (se eligen dentro de "probar con cámara") */
          lenses: z
            .array(
              z.object({
                name: z.string(),
                hex: z.string(),
              }),
            )
            .default([]),
        }),
      )
      .default([]),
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

const testimonios = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/testimonios' }),
  schema: z.object({
    nombre: z.string(),
    texto: z.string(),
    /** Ruta pública opcional, p.ej. /uploads/testimonios/ana.webp */
    foto: z.string().optional(),
    estrellas: z.number().int().min(1).max(5).default(5),
    /** Solo se muestran los activos (permite ocultar sin borrar) */
    active: z.boolean().default(true),
    /** Menor número = aparece primero en el carrusel */
    order: z.number().default(0),
    /** Enlace a la reseña en Google (perfil del autor o URL share.google) */
    url: z.string().url().optional(),
  }),
});

export const collections = { catalogo, promociones, carrusel, testimonios };
