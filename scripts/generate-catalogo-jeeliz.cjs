// Genera src/content/catalogo/*.json a partir de la base de datos pública y gratuita
// de Jeeliz (jeelizGlassesVTOWidget, licencia Apache 2.0): scripts/jeeliz-glassesSKU.csv.
//
// Agrupa los SKUs por modelo (misma montura = mismo archivo) y cada color/acabado
// queda como una variante dentro de "colors", con su propio tryOnSku para que el
// botón "Probar con cámara" cargue exactamente esa variante.
//
// Se excluyen marcas de lujo/novedad que una óptica local real no manejaría
// (Dior, Prada, Gucci, Burberry, Stella McCartney, Thierry Lasry, genéricos de
// AliExpress) para que el catálogo sea creíble para el negocio.
//
// La lógica de agrupación vive en scripts/jeeliz-lib.cjs (compartida con
// scripts/build-tryon-index.cjs, que genera el índice de auto-match para
// monturas reales del negocio sin SKU asignado a mano).
//
// Volver a correr: node scripts/generate-catalogo-jeeliz.cjs

const fs = require('fs');
const path = require('path');
const { buildGroups, PLACEHOLDER_BY_CATEGORY } = require('./jeeliz-lib.cjs');

const OUT_DIR = path.join(__dirname, '..', 'src', 'content', 'catalogo');

const groups = buildGroups();

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const file of fs.readdirSync(OUT_DIR)) {
  fs.unlinkSync(path.join(OUT_DIR, file));
}

let totalFrames = 0;
let totalLenses = 0;

for (const group of groups) {
  totalFrames += group.colors.length;
  totalLenses += group.colors.reduce((n, c) => n + c.lenses.length, 0);

  const item = {
    name: group.name,
    brand: group.brand,
    category: group.category,
    price: null,
    image: PLACEHOLDER_BY_CATEGORY[group.category],
    imageAlt: `${group.brand} ${group.name} — vista de referencia (demo de prueba virtual)`,
    featured: group.featured,
    tryOnSku: group.colors[0].tryOnSku,
    colors: group.colors,
  };

  fs.writeFileSync(path.join(OUT_DIR, `${group.key}.json`), JSON.stringify(item, null, 2) + '\n');
}

console.log(`Generados ${groups.length} modelos, ${totalFrames} colores de marco y ${totalLenses} opciones de lente.`);
