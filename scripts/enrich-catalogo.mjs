// Enriquece automáticamente las entradas del catálogo usando fal.ai (FLUX Kontext).
//
// El cliente sube UNA foto frontal por el CMS; este script genera lo demás:
//   1. {foto}-tryon-src.webp — frente recto, patas eliminadas, lente en blanco puro
//      (fuente que usa generate-cutouts.mjs para "Probar con cámara").
//   2. {foto}-side.webp — vista de lado de las mismas gafas → se guarda como hoverImage.
//   3. colors[] — color dominante del marco detectado de la imagen (nombre + hex).
//
// Solo rellena lo que FALTA: si el cliente editó hoverImage o colors a mano en el CMS,
// no se pisa nada. Es idempotente — correrlo de nuevo sobre un catálogo completo no hace
// nada (y no gasta llamadas a fal).
//
// Requiere FAL_KEY en el entorno (GitHub Actions secret / .env local).
// Correr a mano: npm run enrich

import { fal } from '@fal-ai/client';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CATALOGO_DIR = path.join(ROOT, 'src', 'content', 'catalogo');
const PUBLIC_DIR = path.join(ROOT, 'public');

const KONTEXT_MODEL = 'fal-ai/flux-pro/kontext';
const CAPTION_MODEL = 'fal-ai/florence-2-large/more-detailed-caption';

const TRYON_PROMPT =
  'Edit this product photo of eyeglasses: show the exact same frame from a perfectly ' +
  'straight front view. Remove the temples (side arms) completely. Fill the inside of ' +
  'each lens with pure solid white. Keep the frame shape, color, material and bridge ' +
  'identical. Pure white studio background, no shadows.';

const SIDE_PROMPT =
  'Generate a product photo of the exact same eyeglasses seen from a clean side profile ' +
  'view, showing one temple arm extended horizontally. Same frame color, material and ' +
  'lens tint as the original. Pure white studio background, no shadows.';

// Paleta de nombres para el swatch (los clientes pueden corregirla a mano en el CMS).
const FRAME_COLORS = [
  ['Negro', [31, 31, 31]],
  ['Gris', [128, 130, 133]],
  ['Plateado', [199, 201, 203]],
  ['Dorado', [198, 160, 60]],
  ['Champán', [212, 190, 152]],
  ['Habano', [124, 74, 41]],
  ['Café', [74, 47, 35]],
  ['Azul', [39, 64, 139]],
  ['Verde', [46, 107, 63]],
  ['Rojo', [163, 44, 44]],
  ['Rosado', [211, 106, 154]],
];

fal.config({ credentials: process.env.FAL_KEY });

const isPlaceholder = (url) => url.includes('/placeholder-');

const toDiskPath = (imageUrl) => path.join(PUBLIC_DIR, imageUrl);

function tryOnSrcPath(imageUrl) {
  const disk = toDiskPath(imageUrl);
  const base = path.basename(disk, path.extname(disk));
  return path.join(path.dirname(disk), `${base}-tryon-src.webp`);
}

function sideImageUrl(imageUrl) {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/${base}-side.webp`;
}

/** Corre Kontext (edición por prompt) sobre una imagen ya subida a fal. Devuelve Buffer. */
async function kontextEdit(imageUrl, prompt) {
  const result = await fal.subscribe(KONTEXT_MODEL, {
    input: { prompt, image_url: imageUrl },
    logs: true,
  });
  const outUrl = result.data?.images?.[0]?.url;
  if (!outUrl) throw new Error('Kontext no devolvió imagen');
  const res = await fetch(outUrl);
  if (!res.ok) throw new Error(`Descarga falló (${res.status}): ${outUrl}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Caption de Florence-2 sobre una imagen ya subida a fal (para detectar el color). */
async function captionImage(imageUrl) {
  const result = await fal.subscribe(CAPTION_MODEL, {
    input: { image_url: imageUrl },
  });
  return String(result.data?.results ?? '').toLowerCase();
}

// Palabra en inglés del caption → nombre en español. Se evalúa por POSICIÓN en el
// caption (el color principal se menciona primero; los acentos después).
const COLOR_KEYWORDS = [
  ['rose gold', 'Rosado'],
  ['gold', 'Dorado'],
  ['silver', 'Plateado'],
  ['black', 'Negro'],
  ['tortoise', 'Habano'],
  ['havana', 'Habano'],
  ['amber', 'Habano'],
  ['brown', 'Café'],
  ['blue', 'Azul'],
  ['navy', 'Azul'],
  ['green', 'Verde'],
  ['red', 'Rojo'],
  ['burgundy', 'Rojo'],
  ['pink', 'Rosado'],
  ['gray', 'Gris'],
  ['grey', 'Gris'],
  ['gunmetal', 'Gris'],
  ['clear', 'Transparente'],
  ['transparent', 'Transparente'],
  ['crystal', 'Transparente'],
  ['beige', 'Champán'],
  ['champagne', 'Champán'],
  ['cream', 'Champán'],
  ['white', 'Transparente'],
];

const PALETTE_HEX = Object.fromEntries(
  FRAME_COLORS.map(([name, rgb]) => [
    name,
    `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
  ]),
);
PALETTE_HEX.Transparente = '#dfe3e8';

function colorNameFromCaption(caption) {
  let best = null;
  let bestIdx = Infinity;
  for (const [keyword, name] of COLOR_KEYWORDS) {
    const idx = caption.indexOf(keyword);
    if (idx >= 0 && (idx < bestIdx || (idx === bestIdx && keyword.length > (best?.[0].length ?? 0)))) {
      bestIdx = idx;
      best = [keyword, name];
    }
  }
  return best ? { name: best[1], hex: PALETTE_HEX[best[1]] } : null;
}

/**
 * Color del marco → { name, hex }. Primario: caption de Florence-2 sobre la foto
 * original (entiende "gold metal frame" aunque el aro tenga 5px). Fallback sin
 * FAL_KEY: heurística de píxeles — menos precisa en metales delgados.
 */
async function detectFrameColor(sourcePath, imageUrl) {
  if (imageUrl) {
    const caption = await captionImage(imageUrl);
    const fromCaption = colorNameFromCaption(caption);
    if (fromCaption) return fromCaption;
    console.warn(`caption sin color reconocible ("${caption.slice(0, 80)}…"), usando píxeles`);
  }
  return detectFrameColorFromPixels(sourcePath);
}

/**
 * Fallback local por píxeles. Dos niveles:
 *  1. Marco de color (dorado, azul, habano...): mediana de los píxeles SATURADOS
 *     (chroma > 40) — la sombra es acromática y queda fuera.
 *  2. Marco acromático (negro/gris/plateado): mediana de la mitad MÁS OSCURA de los
 *     candidatos — separa el aro negro (luma ~50) de la sombra (~200).
 * "Transparente" solo si casi no hay píxeles no-blancos (acetato cristal).
 */
async function detectFrameColorFromPixels(imagePath) {
  const { data, info } = await sharp(imagePath)
    .resize(96, 96, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const candidates = [];
  const saturated = [];
  let total = 0;
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * info.channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    total++;
    if (r > 235 && g > 235 && b > 235) continue;
    const px = [r, g, b];
    candidates.push(px);
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) saturated.push(px);
  }

  if (candidates.length < total * 0.005) {
    return { name: 'Transparente', hex: '#dfe3e8' };
  }

  const median = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const medianRgb = (pxs) => [0, 1, 2].map((c) => median(pxs.map((px) => px[c])));

  let rgb;
  if (saturated.length >= Math.max(30, total * 0.003)) {
    rgb = medianRgb(saturated);
  } else {
    const byLuma = [...candidates].sort(
      (x, y) => x[0] + x[1] + x[2] - (y[0] + y[1] + y[2]),
    );
    rgb = medianRgb(byLuma.slice(0, Math.ceil(byLuma.length / 2)));
  }

  const hex = `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

  let best = FRAME_COLORS[0];
  let bestDist = Infinity;
  for (const [name, ref] of FRAME_COLORS) {
    const dist =
      (rgb[0] - ref[0]) ** 2 + (rgb[1] - ref[1]) ** 2 + (rgb[2] - ref[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = [name, ref];
    }
  }
  return { name: best[0], hex };
}

async function main() {
  const hasKey = Boolean(process.env.FAL_KEY);
  if (!hasKey) {
    console.warn('FAL_KEY no definida: se saltan las generaciones con IA (tryon-src/hover).');
  }

  const files = readdirSync(CATALOGO_DIR).filter((f) => f.endsWith('.json'));
  let changed = 0;
  let generated = 0;

  for (const file of files) {
    const filePath = path.join(CATALOGO_DIR, file);
    const entry = JSON.parse(readFileSync(filePath, 'utf8'));
    const image = entry.image;

    if (!image || isPlaceholder(image) || !image.startsWith('/uploads/catalogo/')) {
      continue;
    }
    const sourcePath = toDiskPath(image);
    if (!existsSync(sourcePath)) {
      console.warn(`skip ${file}: no existe ${image}`);
      continue;
    }

    let dirty = false;

    try {
      // La foto se sube a fal una sola vez y la URL sirve para Kontext + caption.
      let falImageUrl = null;
      const getFalUrl = async () => {
        if (!falImageUrl) {
          falImageUrl = await fal.storage.upload(new Blob([readFileSync(sourcePath)]));
        }
        return falImageUrl;
      };

      // 1. Fuente para "Probar con cámara" (frente recto, sin patas, lente blanco).
      const tryonPath = tryOnSrcPath(image);
      if (!existsSync(tryonPath)) {
        if (!hasKey) {
          console.warn(`falta tryon-src para ${file} (sin FAL_KEY no se genera)`);
        } else {
          console.log(`generando tryon-src → ${path.basename(tryonPath)}`);
          const out = await kontextEdit(await getFalUrl(), TRYON_PROMPT);
          await sharp(out).webp({ quality: 90 }).toFile(tryonPath);
          generated++;
        }
      }

      // 2. Foto hover (vista de lado) si la entrada no tiene una.
      if (!entry.hoverImage || !String(entry.hoverImage).trim()) {
        const sideUrl = sideImageUrl(image);
        const sidePath = toDiskPath(sideUrl);
        if (existsSync(sidePath)) {
          // Otra entrada ya generó el side de esta misma foto — solo enlazar.
          entry.hoverImage = sideUrl;
          dirty = true;
        } else if (hasKey) {
          console.log(`generando hover → ${path.basename(sideUrl)}`);
          const out = await kontextEdit(await getFalUrl(), SIDE_PROMPT);
          await sharp(out).webp({ quality: 90 }).toFile(sidePath);
          entry.hoverImage = sideUrl;
          dirty = true;
          generated++;
        } else {
          console.warn(`falta hoverImage para ${file} (sin FAL_KEY no se genera)`);
        }
      }

      // 3. Color del marco: caption del original con IA; sin key, píxeles del tryon-src.
      if (!Array.isArray(entry.colors) || entry.colors.length === 0) {
        const pixelSource = existsSync(tryonPath) ? tryonPath : sourcePath;
        const color = await detectFrameColor(
          pixelSource,
          hasKey ? await getFalUrl() : null,
        );
        entry.colors = [{ name: color.name, hex: color.hex, lenses: [] }];
        dirty = true;
        console.log(`color detectado para ${file}: ${color.name} ${color.hex}`);
      }
    } catch (err) {
      // Un producto con foto rara o un fallo de fal no debe tumbar el resto del lote.
      console.error(`error procesando ${file}: ${err.message}`);
    }

    if (dirty) {
      writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`);
      changed++;
    }
  }

  console.log(`Listo: ${generated} imagen(es) generadas, ${changed} entrada(s) actualizadas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
