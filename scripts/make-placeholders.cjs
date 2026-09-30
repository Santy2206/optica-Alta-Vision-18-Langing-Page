const fs = require('fs');
const sharp = require('sharp');

const dir = 'public/uploads/catalogo';
const promoDir = 'public/uploads/promociones';
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(promoDir, { recursive: true });

const make = async (w, h, label, out) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#00B4B0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Arial" font-size="28">${label}</text></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(out);
  console.log('created', out);
};

(async () => {
  await make(1200, 630, 'Promo - foto pendiente', `${promoDir}/examen-visual.webp`);

  // Placeholders compartidos por categoría para monturas sin foto real todavía
  // (isPlaceholderImage() en src/utils/images.ts las reconoce y muestra un ícono en su lugar).
  await make(800, 600, 'Foto pendiente', `${dir}/placeholder-sol.webp`);
  await make(800, 600, 'Foto pendiente', `${dir}/placeholder-deportivas.webp`);
  await make(800, 600, 'Foto pendiente', `${dir}/placeholder-ninos.webp`);
})();
