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
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

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

/**
 * Misma regla que src/utils/cutout.ts: dónde queda la versión recortada a la silueta y
 * con el lente aclarado a transparente, usada solo por "Probar con cámara". Es un archivo
 * aparte del recorte normal: para la foto del catálogo (object-cover en una tarjeta 4:3)
 * el recorte con el fondo completo se ve mejor, pero para el overlay de la cámara
 * (src/scripts/tryOnOverlay.ts) hace falta la imagen ajustada al tamaño real de la montura.
 */
function tryOnPublicPath(imageUrl) {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}-tryon.png`;
}

/** Variante con el lente oscurecido, para cuando el cliente elige lente "Fotocromático". */
function tryOnPhotochromicPublicPath(imageUrl) {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/cutouts/${base}-tryon-fotocromatico.png`;
}

/**
 * Dilata (expande) una máscara binaria por `radius` píxeles, en dos pasadas (horizontal +
 * vertical) para que sea rápido.
 */
function dilateMask(mask, width, height, radius) {
  const temp = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let dx = -radius; dx <= radius && !v; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && mask[row + nx]) v = 1;
      }
      temp[row + x] = v;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let dy = -radius; dy <= radius && !v; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height && temp[ny * width + x]) v = 1;
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** Erosiona una máscara binaria: complemento de dilatar el complemento. */
function erodeMask(mask, width, height, radius) {
  const inverted = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) inverted[i] = mask[i] ? 0 : 1;
  const dilatedInverted = dilateMask(inverted, width, height, radius);
  const out = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) out[i] = dilatedInverted[i] ? 0 : 1;
  return out;
}

/**
 * Cierre morfológico (dilatar y luego erosionar por el mismo radio): rellena huecos/brechas
 * angostas (como la varilla, de unos pocos píxeles de grosor, cruzando el hueco del lente)
 * sin agrandar el resto del contorno — a diferencia de solo dilatar, que "comía" el aro
 * donde es delgado (p. ej. el borde inferior de un lente redondo).
 */
function closeMask(mask, width, height, radius) {
  return erodeMask(dilateMask(mask, width, height, radius), width, height, radius);
}

/**
 * A partir del recorte ya ajustado a la silueta (trim), calcula qué píxeles son "hueco de
 * lente" y produce las dos variantes que usa "Probar con cámara" (src/scripts/tryOnOverlay.ts):
 * una con el hueco transparente (lente normal, se ve la cara del usuario) y otra con el
 * hueco oscurecido (lente fotocromático).
 *
 * El lente transparente, fotografiado contra fondo blanco de estudio, se ve blanco/brilloso
 * en la foto — pero a veces también se alcanza a ver la varilla de la montura A TRAVÉS del
 * lente (más oscura, no blanca, y sigue siendo parte física de la misma montura). Se resuelve
 * en dos pasos:
 * 1. Aclarar lo casi-blanco a transparente (esto separa el vidrio del resto del marco).
 * 2. Un relleno de huecos "desde afuera hacia adentro": se recorre por BFS, desde el borde
 *    de la imagen, todo lo que sigue transparente tras el paso 1 — eso es el fondo real.
 *    Cualquier zona transparente que el BFS no alcanza está encerrada por el marco: es el
 *    hueco del lente. Se dilata un poco ese hueco (sin invadir el fondo real) para que
 *    trague también la varilla, que queda aislada en medio pero sigue siendo opaca.
 *
 * Límite conocido: para lentes de sol (oscuros o de color) el paso 1 no aclara nada — no
 * hay forma confiable de distinguir el lente del marco solo por color — así que en fotos
 * con lente oscuro/de color no se encuentra ningún hueco y el lente (con cualquier varilla
 * visible a través de él) se queda tal cual, sin recortar. Ver nota más abajo.
 */
function buildTryOnVariants(data, info) {
  const { width, height, channels } = info;
  const n = width * height;

  const WHITE_START = 210;
  const WHITE_FULL = 248;
  const OPAQUE_THRESHOLD = 128;
  const isOpaque = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * channels;
    const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
    let a = data[i + 3];
    if (luma > WHITE_START) {
      const fade = Math.min(1, (luma - WHITE_START) / (WHITE_FULL - WHITE_START));
      a = Math.round(a * (1 - fade));
    }
    isOpaque[p] = a > OPAQUE_THRESHOLD ? 1 : 0;
  }

  // BFS desde el borde de la imagen, a través de píxeles NO opacos: marca el fondo real
  // (todo lo alcanzable desde afuera sin cruzar el marco).
  const isOutside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qHead = 0;
  let qTail = 0;
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const p = y * width + x;
      if (!isOpaque[p] && !isOutside[p]) {
        isOutside[p] = 1;
        queue[qTail++] = p;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const p = y * width + x;
      if (!isOpaque[p] && !isOutside[p]) {
        isOutside[p] = 1;
        queue[qTail++] = p;
      }
    }
  }
  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0 && !isOpaque[p - 1] && !isOutside[p - 1]) {
      isOutside[p - 1] = 1;
      queue[qTail++] = p - 1;
    }
    if (x < width - 1 && !isOpaque[p + 1] && !isOutside[p + 1]) {
      isOutside[p + 1] = 1;
      queue[qTail++] = p + 1;
    }
    if (y > 0 && !isOpaque[p - width] && !isOutside[p - width]) {
      isOutside[p - width] = 1;
      queue[qTail++] = p - width;
    }
    if (y < height - 1 && !isOpaque[p + width] && !isOutside[p + width]) {
      isOutside[p + width] = 1;
      queue[qTail++] = p + width;
    }
  }

  // Lo no-opaco que el BFS no alcanzó está encerrado por el marco: es el hueco del lente.
  const isEnclosedHole = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (!isOpaque[p] && !isOutside[p]) isEnclosedHole[p] = 1;
  }

  // Cierre morfológico del hueco (dilatar + erosionar) para tragarse la varilla, delgada
  // (unos pocos píxeles), sin comerse el aro donde es angosto — dilatar solo (sin el paso
  // de erosión) agrandaba el hueco de forma permanente y rompía el borde inferior del aro.
  const radius = Math.max(12, Math.round(Math.min(width, height) * 0.035));
  const closed = closeMask(isEnclosedHole, width, height, radius);
  const hole = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    hole[p] = closed[p] && !isOutside[p] ? 1 : 0;
  }

  // Nota: un lente oscuro o de color (sol) nunca se aclara a "casi blanco" en el paso de
  // arriba, así que en ese caso no se encuentra ningún hueco — el lente (y cualquier varilla
  // que se vea a través) se queda tal cual, sin recortar. Se intentó un estimado geométrico
  // (dos óvalos/superóvalos donde deberían estar los lentes) para cubrir también este caso,
  // pero no generalizó bien entre formas de montura muy distintas (undershoot en lentes
  // cuadrados/medio al aire, overshoot y se comía el marco completo al agrandarlo) — se
  // descartó. Por ahora esto solo funciona de forma confiable para lentes claros/blancos.
  const clear = Buffer.from(data);
  const photochromic = Buffer.from(data);
  for (let p = 0; p < n; p++) {
    if (!hole[p] && isOpaque[p]) continue; // marco real: sin cambios en ambas variantes
    const i = p * channels;
    clear[i + 3] = 0;
    if (isOutside[p] && !hole[p]) {
      // fondo real (casi no queda tras el trim, pero por si acaso): transparente también
      // en la variante fotocromática, no se pinta oscuro todo alrededor de la montura.
      photochromic[i + 3] = 0;
    } else {
      // Tono oscuro semi-opaco imitando un lente fotocromático activado.
      photochromic[i] = 25;
      photochromic[i + 1] = 25;
      photochromic[i + 2] = 28;
      photochromic[i + 3] = 210;
    }
  }

  return { clear, photochromic };
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
      if (color.modelImage && !isPlaceholder(color.modelImage)) urls.add(color.modelImage);
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
    const tryOnUrl = tryOnPublicPath(imageUrl);
    const tryOnPath = path.join(PUBLIC_DIR, tryOnUrl.replace(/^\//, ''));
    const photoUrl = tryOnPhotochromicPublicPath(imageUrl);
    const photoPath = path.join(PUBLIC_DIR, photoUrl.replace(/^\//, ''));

    if (!existsSync(sourcePath)) {
      console.warn(`[cutouts] Foto referenciada pero no encontrada, se omite: ${imageUrl}`);
      continue;
    }

    if (
      !needsProcessing(sourcePath, outPath) &&
      !needsProcessing(sourcePath, tryOnPath) &&
      !needsProcessing(sourcePath, photoPath)
    ) {
      skipped += 1;
      continue;
    }

    try {
      // Pasar la ruta como string hace que la librería la trate como URL ("C:\..." se
      // interpreta como protocolo "c:" en Windows); pasar un Buffer crudo pierde el
      // tipo MIME y falla la detección de formato. Un URL "file://" sí funciona en
      // Windows/Linux y deja que la librería lea el archivo y detecte el formato sola.
      const blob = await removeBackground(pathToFileURL(sourcePath));
      const rawBuffer = Buffer.from(await blob.arrayBuffer());
      const { writeFileSync } = await import('node:fs');

      // Recorte normal (para la foto del catálogo): mismo lienzo que la foto original,
      // solo con el fondo quitado. object-cover en la tarjeta 4:3 se ve bien con esto.
      writeFileSync(outPath, rawBuffer);

      // Recorte para "Probar con cámara" (src/scripts/tryOnOverlay.ts): la foto original
      // suele tener mucho margen transparente alrededor de la montura (fondo cuadrado,
      // montura centrada). Sin recortar ese margen, el overlay usa el ancho/alto de la
      // imagen completa para escalar y posicionar la montura, y el margen hace que el
      // cálculo salga mal (montura chica y desplazada) — trim() la ajusta al tamaño real.
      const { data, info } = await sharp(rawBuffer).trim().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width, height, channels } = info;
      const { clear, photochromic } = buildTryOnVariants(data, info);

      const tryOnBuffer = await sharp(clear, { raw: { width, height, channels } }).png().toBuffer();
      writeFileSync(tryOnPath, tryOnBuffer);

      const photoBuffer = await sharp(photochromic, { raw: { width, height, channels } }).png().toBuffer();
      writeFileSync(photoPath, photoBuffer);

      done += 1;
      console.log(`[cutouts] ${imageUrl} → ${outUrl} (+ ${tryOnUrl}, ${photoUrl})`);
    } catch (error) {
      failed += 1;
      console.warn(`[cutouts] No se pudo recortar ${imageUrl}: ${error.message}`);
    }
  }

  console.log(`[cutouts] Listo. ${done} nuevas, ${skipped} ya existían, ${failed} fallaron.`);
}

run();
