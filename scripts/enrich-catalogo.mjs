// Enriquece automáticamente las entradas del catálogo usando fal.ai (FLUX Kontext).
//
// El cliente sube UNA foto frontal por el CMS (puede ser cruda: fondo del local,
// reflejos, desenfoque); este script genera lo demás, encadenado:
//   0. {foto}-front.webp — la IA recrea las gafas desde cero como packshot limpio
//      (fondo blanco, cristal sin color). Reemplaza entry.image: es la foto de la tarjeta.
//   1. {foto}-front-tryon-src.webp — DESDE el frente: sin patas, lente en blanco puro
//      (fuente que usa generate-cutouts.mjs para "Probar con cámara").
//   2. {foto}-front-side.webp — DESDE el frente: vista lateral → hoverImage.
//   3. colors[] — color del marco (caption sobre el tryon-src limpio).
// Monturas anteriores (ya con tryon-src) no se reprocesan.
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
const VISION_MODEL = 'openrouter/router/vision';
const VISION_LLM = 'google/gemini-2.5-flash';

// Paso 1: de la foto cruda del cliente (fondo del local, reflejos, desenfoque) se
// recrea el producto desde cero como packshot limpio. Es la imagen de la tarjeta.
const FRONT_PROMPT =
  'Recreate these exact eyeglasses from scratch as a clean professional e-commerce ' +
  'product photo. Perfectly straight front view, frame centered and symmetrical, side ' +
  'arms (temples) not visible. Keep the exact same frame shape, color, material, bridge ' +
  'and nose pads. The lenses must be completely clear and colorless, as if there were ' +
  'no glass at all (pure white seen through them). No reflections, no mirrored copy, ' +
  'no shadows, no background objects, no text. Pure white seamless studio background.';

// Pasos 2 y 3 parten del frente generado (no de la foto cruda).
const TRYON_PROMPT =
  'Keep this eyeglasses frame exactly identical in shape, color, material and bridge, ' +
  'perfectly straight front view. Make sure no temples (side arms) are visible anywhere, ' +
  'including through the lenses. Fill the inside of each lens with pure solid white ' +
  '(#FFFFFF), as if there were no glass. Pure white background, no shadows.';

const SIDE_PROMPT =
  'Show the exact same eyeglasses from a clean three-quarter side profile view, with one ' +
  'temple arm extended. Same frame shape, color and material. The lenses are completely ' +
  'clear and colorless, as if there were no glass. No reflections, no shadows. Pure white ' +
  'seamless studio background.';

// Paleta de nombres para el swatch (los clientes pueden corregirla a mano en el CMS).
const FRAME_COLORS = [
  ['Negro', [31, 31, 31]],
  ['Gris oscuro', [85, 87, 90]],
  ['Gris', [128, 130, 133]],
  ['Plateado', [199, 201, 203]],
  ['Dorado', [198, 160, 60]],
  ['Rosa dorado', [201, 150, 130]],
  ['Champán', [212, 190, 152]],
  ['Bronce', [140, 108, 78]],
  ['Habano', [124, 74, 41]],
  ['Café', [74, 47, 35]],
  ['Azul', [39, 64, 139]],
  ['Verde', [46, 107, 63]],
  ['Rojo', [163, 44, 44]],
  ['Vinotinto', [110, 30, 50]],
  ['Rosado', [211, 106, 154]],
  ['Morado', [100, 60, 140]],
  ['Naranja', [220, 110, 40]],
];

fal.config({ credentials: process.env.FAL_KEY });

const isPlaceholder = (url) => url.includes('/placeholder-');

const toDiskPath = (imageUrl) => path.join(PUBLIC_DIR, imageUrl);

function tryOnSrcPath(imageUrl) {
  const disk = toDiskPath(imageUrl);
  const base = path.basename(disk, path.extname(disk));
  return path.join(path.dirname(disk), `${base}-tryon-src.webp`);
}

/** El frente generado termina en "-front.webp": marca de que ya se procesó esa foto. */
const isFrontImage = (url) => /-front\.webp$/.test(url);

function frontImageUrl(imageUrl) {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/catalogo/${base}-front.webp`;
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

// Pregunta directa a un modelo de visión (OpenRouter vía fal) sobre el MARCO. Mucho más
// fiable que buscar palabras de color en un caption: se le pide ignorar lentes, fondo y
// sombras, y responder solo con un nombre de la paleta.
async function askFrameColor(imageUrl) {
  const names = FRAME_COLORS.map(([name]) => name).concat('Transparente');
  const result = await fal.subscribe(VISION_MODEL, {
    input: {
      model: VISION_LLM,
      image_urls: [imageUrl],
      temperature: 0,
      system_prompt: 'Respond with only the answer. No markdown, no punctuation, no explanation.',
      prompt:
        'This is a product photo of eyeglasses. Identify the color of the FRAME only: the ' +
        'rim around the lenses, the bridge and the temple arms. Ignore the lenses, the ' +
        'white background and any shadows. If the frame is see-through acetate, answer ' +
        `Transparente. Answer with exactly one name from this list: ${names.join(', ')}.`,
    },
  });
  return String(result.data?.output ?? '').trim();
}

const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Género de la montura: misma llamada de visión que el color. Reglas ambiguas
// (aviador/clubmaster neutras, tamaño medio) se resuelven a "unisex".
const GENEROS = ['unisex', 'hombre', 'mujer'];

// Rostros que favorece cada forma de montura — la MISMA matriz que usa el test
// (src/data/faceShapeQuiz.ts → frameRecommendations). Determinista, sin visión.
const FACE_RECS = {
  ovalado: ['aviador', 'cat-eye', 'rectangular', 'cuadrada', 'redonda', 'clubmaster', 'ovalada'],
  redondo: ['cuadrada', 'rectangular', 'clubmaster', 'aviador'],
  cuadrado: ['redonda', 'ovalada', 'cat-eye', 'aviador'],
  corazon: ['redonda', 'ovalada', 'aviador'],
  diamante: ['cat-eye', 'ovalada', 'clubmaster', 'aviador'],
};
async function askFrameGender(imageUrl) {
  const result = await fal.subscribe(VISION_MODEL, {
    input: {
      model: VISION_LLM,
      image_urls: [imageUrl],
      temperature: 0,
      system_prompt: 'Respond with only the answer. No markdown, no punctuation, no explanation.',
      prompt:
        'This is a product photo of an eyeglasses frame. Based on its design (size, ' +
        'thickness, shape and color), decide who it is marketed for. Frames that look ' +
        'delicate, small, cat-eye or jewel-toned are usually mujer; big, thick, angular ' +
        'or sporty ones are usually hombre; neutral/medium classic shapes (aviador, ' +
        'rectangular, redonda) are unisex. Answer with exactly one word: unisex, ' +
        'hombre or mujer.',
    },
  });
  const answer = normalize(String(result.data?.output ?? ''));
  const found = GENEROS.find((g) => answer.includes(g));
  return found ?? 'unisex';
}

const PALETTE_HEX = Object.fromEntries(
  FRAME_COLORS.map(([name, rgb]) => [
    name,
    `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
  ]),
);
PALETTE_HEX.Transparente = '#dfe3e8';

/** Respuesta del modelo → { name, hex } de la paleta, o null si no coincide con ninguna. */
function matchPaletteColor(answer) {
  const text = normalize(answer);
  const names = Object.keys(PALETTE_HEX).sort((a, b) => b.length - a.length);
  const name = names.find((n) => text.includes(normalize(n)));
  return name ? { name, hex: PALETTE_HEX[name] } : null;
}

/**
 * Color del marco → { name, hex }. Primario: el modelo de visión mira la imagen limpia
 * (frente generado, fondo blanco). Fallback sin FAL_KEY o si responde algo fuera de la
 * paleta: heurística de píxeles — menos precisa en metales delgados.
 */
async function detectFrameColor(sourcePath, imageUrl) {
  if (imageUrl) {
    const answer = await askFrameColor(imageUrl);
    const match = matchPaletteColor(answer);
    if (match) return match;
    console.warn(`respuesta de color fuera de la paleta ("${answer.slice(0, 60)}"), usando píxeles`);
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
    let image = entry.image;

    if (!image || isPlaceholder(image) || !image.startsWith('/uploads/catalogo/')) {
      continue;
    }
    if (!existsSync(toDiskPath(image))) {
      console.warn(`skip ${file}: no existe ${image}`);
      continue;
    }

    let dirty = false;

    try {
      // Sube a fal una sola vez cada imagen y reutiliza la URL entre llamadas.
      const uploads = new Map();
      const getFalUrl = async (diskPath) => {
        if (!uploads.has(diskPath)) {
          uploads.set(diskPath, await fal.storage.upload(new Blob([readFileSync(diskPath)])));
        }
        return uploads.get(diskPath);
      };

      // 0. Foto cruda del cliente → frente limpio generado desde cero. Se omite si la
      // imagen ya es un "-front" o si la montura es anterior a esta automatización
      // (ya tiene su tryon-src y no se toca).
      if (!isFrontImage(image) && !existsSync(tryOnSrcPath(image))) {
        if (!hasKey) {
          console.warn(`falta frente limpio para ${file} (sin FAL_KEY no se genera)`);
          continue;
        }
        const frontUrl = frontImageUrl(image);
        const frontPath = toDiskPath(frontUrl);
        if (!existsSync(frontPath)) {
          console.log(`generando frente limpio → ${path.basename(frontPath)}`);
          const out = await kontextEdit(await getFalUrl(toDiskPath(image)), FRONT_PROMPT);
          await sharp(out).webp({ quality: 92 }).toFile(frontPath);
          generated++;
        }
        entry.image = frontUrl;
        // Un hover auto-generado de una foto anterior ya no corresponde a esta.
        if (/-side\.webp$/.test(entry.hoverImage ?? '')) delete entry.hoverImage;
        image = frontUrl;
        dirty = true;
        // Guarda ya: si un paso posterior falla, el frente no se regenera ni se paga dos veces.
        writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`);
      }

      const sourcePath = toDiskPath(image);

      // 1. Fuente para "Probar con cámara" (desde el frente: sin patas, lente blanco).
      const tryonPath = tryOnSrcPath(image);
      if (!existsSync(tryonPath)) {
        if (!hasKey) {
          console.warn(`falta tryon-src para ${file} (sin FAL_KEY no se genera)`);
        } else {
          console.log(`generando tryon-src → ${path.basename(tryonPath)}`);
          const out = await kontextEdit(await getFalUrl(sourcePath), TRYON_PROMPT);
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
          const out = await kontextEdit(await getFalUrl(sourcePath), SIDE_PROMPT);
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
        // El caption se lee sobre el tryon-src (fondo blanco, solo la montura): la foto
        // original suele traer objetos de fondo que contaminan el color (ej. "red").
        const pixelSource = existsSync(tryonPath) ? tryonPath : sourcePath;
        const captionUrl = hasKey ? await getFalUrl(pixelSource) : null;
        const color = await detectFrameColor(pixelSource, captionUrl);
        entry.colors = [{ name: color.name, hex: color.hex, lenses: [] }];
        dirty = true;
        console.log(`color detectado para ${file}: ${color.name} ${color.hex}`);
      }

      // 4. Género (filtro del catálogo): formas no ambiguas por regla fija (sin gastar
      // la llamada de visión) — cat-eye → mujer, aviador → hombre; el resto lo
      // clasifica Gemini sobre la imagen limpia.
      if (!entry.genero || !GENEROS.includes(entry.genero)) {
        const ref = `${entry.frameShape || ''} ${entry.name || ''} ${file}`;
        const refColores = (entry.colors || []).map((c) => c.name || '').join(' ');
        const generoRegla = /cat[\s-]?eye|rosad|\brosa\b|oro rosa/i.test(`${ref} ${refColores}`)
          ? 'mujer'
          : /aviador/i.test(ref)
            ? 'hombre'
            : null;
        if (generoRegla) {
          entry.genero = generoRegla;
        } else {
          const genderSource = existsSync(tryonPath) ? tryonPath : sourcePath;
          entry.genero = hasKey ? await askFrameGender(await getFalUrl(genderSource)) : 'unisex';
        }
        dirty = true;
        console.log(`género detectado para ${file}: ${entry.genero}${generoRegla ? ' (regla de forma)' : ''}`);
      }

      // 5. Rostros que favorece (filtro del catálogo): sale de frameShape con la
      // matriz de arriba. Solo se rellena si está vacío — si el cliente lo corrigió
      // a mano en el CMS se respeta.
      if (entry.frameShape && (!Array.isArray(entry.rostros) || entry.rostros.length === 0)) {
        entry.rostros = Object.keys(FACE_RECS).filter((r) => FACE_RECS[r].includes(entry.frameShape));
        dirty = true;
        console.log(`rostros detectados para ${file}: ${entry.rostros.join(', ')}`);
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
