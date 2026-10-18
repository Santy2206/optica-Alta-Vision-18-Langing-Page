// Máscara del cristal de un marco, para los efectos de lente de la sección animada de /prueba
// (monofocal, progresivo, luz azul, fotocromático). Se saca de la diferencia entre el recorte del
// probador con lente transparente (`{foto}-tryon.webp`) y el fotocromático (`-tryon-fotocromatico.webp`):
// justo donde uno es transparente y el otro está relleno, ahí está el cristal. Como ambos salen de la
// misma imagen, la máscara calza al píxel con el marco que se muestra.
//
// Salida: public/images/flow/lente-mascara.png (alfa = cristal) y lente-mascara.json (cajas de cada lente).
// Uso: node scripts/generate-flow-lens-mask.mjs [slug]   (por defecto aviador01-negro-cuadrado-a)

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CUTOUTS = path.join(ROOT, 'public', 'uploads', 'catalogo', 'cutouts');
const OUT = path.join(ROOT, 'public', 'images', 'flow');

const slug = process.argv[2] ?? 'aviador01-negro-cuadrado-a';

const clear = await sharp(path.join(CUTOUTS, `${slug}-tryon.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const photo = await sharp(path.join(CUTOUTS, `${slug}-tryon-fotocromatico.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = clear.info;
if (photo.info.width !== w || photo.info.height !== h) throw new Error('Los recortes no tienen el mismo tamaño');

const alpha = new Uint8Array(w * h);
for (let p = 0; p < w * h; p++) {
  const a = (photo.data[p * 4 + 3] * (255 - clear.data[p * 4 + 3])) / 255;
  alpha[p] = a < 24 ? 0 : Math.min(255, Math.round(a * 1.2));
}

// Cajas de los 2 lentes: columnas con cristal, partidas por la mayor franja vacía (el puente).
const colHas = new Uint8Array(w);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] > 128) colHas[x] = 1;
const runs = [];
for (let x = 0; x < w; x++) {
  if (!colHas[x]) continue;
  if (runs.length && x - runs[runs.length - 1][1] <= Math.round(w * 0.02)) runs[runs.length - 1][1] = x;
  else runs.push([x, x]);
}
runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
const lenses = runs
  .slice(0, 2)
  .sort((a, b) => a[0] - b[0])
  .map(([x0, x1]) => {
    let y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) if (alpha[y * w + x] > 128) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0: x0 / w, x1: (x1 + 1) / w, y0: y0 / h, y1: (y1 + 1) / h };
  });

const rgba = Buffer.alloc(w * h * 4, 255);
for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = alpha[p];

mkdirSync(OUT, { recursive: true });
await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(path.join(OUT, 'lente-mascara.png'));
writeFileSync(path.join(OUT, 'lente-mascara.json'), JSON.stringify({ slug, width: w, height: h, lenses }, null, 2) + '\n');
console.log(`[mascara] ${slug} ${w}x${h}, ${lenses.length} lentes`, JSON.stringify(lenses));
