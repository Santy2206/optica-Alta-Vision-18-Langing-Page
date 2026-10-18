import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { FRAME_SHAPES } from './data/frameShape';

/**
 * Content Collections — Óptica Alta Visión
 * Contrato consumido por UI (sesión 3.x) y Decap CMS (public/admin/config.yml).
 * site.json (src/content/configuracion/) NO es colección: se importa como JSON estático.
 */

const catalogo = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/catalogo' }),
  schema: z.object({
    name: z.string(),
    /** Marca del marco. Por defecto la casa (monturas propias). */
    brand: z.string().default('Óptica Alta Visión 18'),
    category: z.enum(['formuladas', 'sol', 'ninos', 'deportivas', 'contacto']),
    /** Para quién es la montura. La IA lo rellena al subir la foto; el CMS lo puede corregir. */
    genero: z.enum(['unisex', 'hombre', 'mujer']).optional(),
    /** Forma de la montura (test de forma de rostro). Si falta, se infiere del nombre. */
    frameShape: z.enum(FRAME_SHAPES).optional(),
    /** null/omitido = "Monturas desde $X" (site.precioDesdeMontura) o "Cotiza por WhatsApp".
     * Decap deja el campo ausente si no se llena (required: false); no envía null. */
    price: z.number().nullable().optional().default(null),
    /** Ruta pública, p.ej. /uploads/catalogo/rayban-aviator.webp */
    image: z.string(),
    imageAlt: z.string(),
    /** Segunda foto de la montura (otro ángulo o en modelo). Se muestra al pasar el mouse.
     * Si un color define modelImage, esa tiene prioridad al seleccionar el swatch. */
    hoverImage: z.string().optional(),
    featured: z.boolean().default(false),
    /** Fecha de alta (ISO). Decap la completa con {{now}} al crear; decide qué destacadas entran en el inicio. */
    createdAt: z.string().optional(),
    /** Colores del MARCO (swatches en la tarjeta del catálogo). Campo hidden en
     * Decap: va nullish por si escribe null, y siempre cae en []. */
    colors: z
      .array(
        z.object({
          name: z.string(),
          hex: z.string(),
          /** Segundo tono para marcos bicolor (el swatch se muestra partido en diagonal) */
          hex2: z.string().nullish(),
          /** Si se define, al hacer clic en el swatch cambia la foto de la tarjeta.
           * nullish: estos campos van ocultos en Decap y puede escribir null. */
          image: z.string().nullish(),
          /** Si se define, al pasar el mouse por la foto se muestra un modelo usando esta montura en este color */
          modelImage: z.string().nullish(),
          /** Colores de LENTE disponibles para este marco (se eligen dentro de "probar con cámara") */
          lenses: z
            .array(
              z.object({
                name: z.string(),
                hex: z.string(),
              }),
            )
            .nullish()
            .transform((v) => v ?? []),
        }),
      )
      .nullish()
      .transform((v) => v ?? []),
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

export const collections = { catalogo, promociones, testimonios };
