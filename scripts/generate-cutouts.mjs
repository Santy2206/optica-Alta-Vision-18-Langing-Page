// Recorta automáticamente el fondo de las fotos reales del catálogo (no las de
// referencia/placeholder) y guarda una versión con fondo transparente en
// public/uploads/catalogo/cutouts/. Se corre en cada build (ver package.json) para que
// el negocio solo tenga que subir la foto normal desde el CMS — el recorte pasa solo en
// el siguiente deploy, sin que nadie tenga que tocar nada.
//
// src/utils/cutout.ts decide en cada página si usar la versión recortada o la original
// (si el recorte todavía no existe, o si falló, se sigue viendo la foto normal).
//
// Volver a correr manualmente: node scripts/generate-cutouts.mjs

import { removeBackground } from '@imgly/background-removal-node';
import { readdirSync, readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CATALOGO_DIR = path.join(ROOT, 'src', 'content', 'catalogo');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CUTOUTS_DIR = path.join(PUBLIC_DIR, 'uploads', 'catalogo', 'cutouts');

const isPlaceholder = (url) => url.includes('/placeholder-');

/** Misma regla que src/utils/cutout.ts: dónde queda el recorte de una foto dada. */
function cutoutPublicPath(imageUrl) {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}.png`;
}

function collectRealImages() {
  const urls = new Set();
  if (!existsSync(CATALOGO_DIR)) return urls;

  for (const file of readdirSync(CATALOGO_DIR)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(path.join(CATALOGO_DIR, file), 'utf-8'));

    if (data.image && !isPlaceholder(data.image)) urls.add(data.image);
    for (const color of data.colors ?? []) {
      if (color.image && !isPlaceholder(color.image)) urls.add(color.image);
    }
  }
  return urls;
}

/** true si el recorte no existe, o si la foto original es más nueva (se subió una nueva). */
function needsProcessing(sourcePath, outPath) {
  if (!existsSync(outPath)) return true;
  return statSync(sourcePath).mtimeMs > statSync(outPath).mtimeMs;
}

async function run() {
  const images = collectRealImages();
  if (images.size === 0) {
    console.log('[cutouts] No hay fotos reales de catálogo todavía — nada que recortar.');
    return;
  }

  mkdirSync(CUTOUTS_DIR, { recursive: true });

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const imageUrl of images) {
    const sourcePath = path.join(PUBLIC_DIR, imageUrl.replace(/^\//, ''));
    const outUrl = cutoutPublicPath(imageUrl);
    const outPath = path.join(PUBLIC_DIR, outUrl.replace(/^\//, ''));

    if (!existsSync(sourcePath)) {
      console.warn(`[cutouts] Foto referenciada pero no encontrada, se omite: ${imageUrl}`);
      continue;
    }

    if (!needsProcessing(sourcePath, outPath)) {
      skipped += 1;
      continue;
    }

    try {
      const blob = await removeBackground(sourcePath);
      const buffer = Buffer.from(await blob.arrayBuffer());
      const { writeFileSync } = await import('node:fs');
      writeFileSync(outPath, buffer);
      done += 1;
      console.log(`[cutouts] ${imageUrl} → ${outUrl}`);
    } catch (error) {
      failed += 1;
      console.warn(`[cutouts] No se pudo recortar ${imageUrl}: ${error.message}`);
    }
  }

  console.log(`[cutouts] Listo. ${done} nuevas, ${skipped} ya existían, ${failed} fallaron.`);
}

run();
