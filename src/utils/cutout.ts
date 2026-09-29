import { existsSync } from 'node:fs';
import path from 'node:path';

/** Misma regla que scripts/generate-cutouts.mjs: dónde queda el recorte de una foto dada. */
function cutoutPublicPath(imageUrl: string): string {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}.png`;
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
