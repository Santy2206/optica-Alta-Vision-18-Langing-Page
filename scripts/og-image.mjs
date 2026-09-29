// Genera public/og-default.png (1200×630) para la vista previa al compartir por WhatsApp/redes.
// Uso: npm run og  — volver a correr si cambian barrio, calificación o total de reseñas.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const site = JSON.parse(await readFile(new URL('../src/content/configuracion/site.json', import.meta.url), 'utf8'));

const barrio = (site.barrio ?? '').trim() || 'Bogotá';
const rating = typeof site.googleReviews?.rating === 'number' ? site.googleReviews.rating : null;
const total = typeof site.googleReviews?.total === 'number' ? site.googleReviews.total : null;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtRating = (n) => n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Colores de marca (src/styles/global.css @theme)
const AGUAMARINA = '#00B4B0';
const VERDE_NEON = '#39FF14';
const SLATE_900 = '#0f172a';
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// Estrella dibujada como path (no depende de que la fuente tenga el glifo ★).
const star = (x, y, size, fill) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? size / 2 : size / 5;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="${fill}"/>`;
};

// "4,9 en Google · +180 reseñas": el total se redondea hacia abajo a la decena
// para que la imagen no quede desactualizada con cada reseña nueva.
const totalRedondeado = total !== null && total >= 10 ? Math.floor(total / 10) * 10 : total;
const ratingLine =
  rating !== null
    ? `${fmtRating(rating)} en Google${totalRedondeado !== null ? ` · +${totalRedondeado.toLocaleString('es-CO')} reseñas` : ''}`
    : '';

// Composición centrada: WhatsApp a veces recorta la miniatura a un cuadrado central (630×630),
// así que todo el contenido cabe entre x=285 y x=915.
const CX = W / 2;
const CARD_W = 520;
const CARD_H = 180;
const CARD_Y = 60;
const ratingText = ratingLine ? esc(ratingLine) : '';
// Ancho real del texto (se renderiza solo y se recorta) para pegar la estrella al texto
// y centrar el conjunto estrella + texto.
const RATING_FONT = `font-family="${FONT}" font-size="34" font-weight="700"`;
const ratingWidth = ratingText
  ? (
      await sharp(
        Buffer.from(
          `<svg width="${W}" height="80" xmlns="http://www.w3.org/2000/svg"><text x="10" y="50" ${RATING_FONT} fill="#000">${ratingText}</text></svg>`,
        ),
      )
        .trim()
        .toBuffer({ resolveWithObject: true })
    ).info.width
  : 0;
const STAR = 40;
const GAP = 14;
const groupStart = CX - (STAR + GAP + ratingWidth) / 2;

const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${AGUAMARINA}"/>
  <rect x="0" y="${H - 18}" width="${W}" height="18" fill="${VERDE_NEON}"/>
  <rect x="${CX - CARD_W / 2}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="28" fill="#ffffff"/>
  <text x="${CX}" y="350" text-anchor="middle" font-family="${FONT}" font-size="66" font-weight="800" fill="${SLATE_900}">${esc(`Óptica en ${barrio}`)}</text>
  <text x="${CX}" y="405" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="600" fill="${SLATE_900}">Examen visual y gafas formuladas y de sol</text>
  ${
    ratingText
      ? `<g>
    ${star(groupStart + STAR / 2, 488, STAR, SLATE_900)}
    <text x="${groupStart + STAR + GAP}" y="501" ${RATING_FONT} fill="${SLATE_900}">${ratingText}</text>
  </g>`
      : ''
  }
</svg>`;

const logo = await sharp(fileURLToPath(new URL('../public/logo.png', import.meta.url)))
  .resize({ width: CARD_W - 60, height: CARD_H - 40, fit: 'inside' })
  .toBuffer();
const { width: lw = CARD_W - 60, height: lh = CARD_H - 40 } = await sharp(logo).metadata();

await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: Math.round(CX - lw / 2), top: Math.round(CARD_Y + (CARD_H - lh) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(fileURLToPath(new URL('../public/og-default.png', import.meta.url)));

console.log(`og-default.png generado: "Óptica en ${barrio}"${ratingLine ? ` · ${ratingLine}` : ''}`);
