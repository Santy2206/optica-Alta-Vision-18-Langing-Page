import { existsSync } from 'node:fs';
import path from 'node:path';
import { isPlaceholderImage } from './images';

/** Misma regla que scripts/generate-cutouts.mjs: dónde queda el recorte de una foto dada. */
function cutoutPublicPath(imageUrl: string): string {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}.png`;
}

/**
 * Misma regla que scripts/generate-cutouts.mjs: dónde queda la versión ajustada al tamaño
 * real de la montura (con el lente aclarado a transparente) que usa "Probar con cámara".
 * Es un archivo distinto del recorte normal — ese se ve mejor en la tarjeta del catálogo,
 * pero el overlay de la cámara necesita la imagen recortada a la silueta.
 */
function tryOnPublicPath(imageUrl: string): string {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}-tryon.png`;
}

/** Variante con el lente oscurecido, para cuando el cliente elige lente "Fotocromático". */
function tryOnPhotochromicPublicPath(imageUrl: string): string {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}-tryon-fotocromatico.png`;
}

/**
 * Foto de producto con fondo recortado si ya se generó (scripts/generate-cutouts.mjs,
 * corre en cada build), o la foto original si todavía no — nunca deja la sección sin
 * imagen mientras el recorte automático no haya corrido para esa foto.
 */
export function getDisplayImage(imageUrl: string): string {
  const cutoutUrl = cutoutPublicPath(imageUrl);
  const onDisk = path.join(process.cwd(), 'public', cutoutUrl.replace(/^\//, ''));
  return existsSync(onDisk) ? cutoutUrl : imageUrl;
}

/**
 * Foto con fondo transparente para "Probar con cámara" (src/scripts/tryOnOverlay.ts).
 * A diferencia de getDisplayImage(), NO cae de vuelta a la foto original: si el recorte
 * todavía no existe, no hay overlay válido (mostrar la foto con fondo sobre la cara del
 * usuario se vería mal), así que el llamador debe ocultar el botón de prueba virtual.
 */
export function getTryOnOverlayImage(imageUrl: string | undefined): string | null {
  if (!imageUrl || isPlaceholderImage(imageUrl)) return null;
  const tryOnUrl = tryOnPublicPath(imageUrl);
  const onDisk = path.join(process.cwd(), 'public', tryOnUrl.replace(/^\//, ''));
  return existsSync(onDisk) ? tryOnUrl : null;
}

/**
 * Misma imagen que getTryOnOverlayImage() pero con el lente oscurecido, para cuando el
 * cliente elige lente "Fotocromático" dentro de "Probar con cámara" (TryOnModal.astro).
 */
export function getTryOnPhotochromicImage(imageUrl: string | undefined): string | null {
  if (!imageUrl || isPlaceholderImage(imageUrl)) return null;
  const photoUrl = tryOnPhotochromicPublicPath(imageUrl);
  const onDisk = path.join(process.cwd(), 'public', photoUrl.replace(/^\//, ''));
  return existsSync(onDisk) ? photoUrl : null;
}
