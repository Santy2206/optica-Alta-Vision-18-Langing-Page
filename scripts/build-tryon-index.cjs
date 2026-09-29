// Genera src/data/tryOnCatalog.json: un índice liviano de los modelos reales de la base
// gratuita de Jeeliz (marca + nombre + categoría + SKU) para que el sitio pueda encontrar
// automáticamente un SKU de "probar con cámara" cuando el negocio agrega una montura REAL
// (con su propia foto) sin asignar un SKU a mano — por ejemplo, si escriben marca "Ray-Ban"
// y nombre "Aviador", el sitio ya sabe qué modelo de Jeeliz se le parece.
//
// No genera un modelo 3D nuevo desde la foto (eso no es técnicamente viable hoy con
// buena calidad para monturas) — conecta el nombre del producto con el modelo 3D más
// parecido que Jeeliz ya tiene digitalizado. Si no hay coincidencia de marca/modelo,
// src/utils/tryOnMatch.ts cae a un modelo genérico de la misma categoría.
//
// Volver a correr si cambia scripts/jeeliz-glassesSKU.csv: node scripts/build-tryon-index.cjs

const fs = require('fs');
const path = require('path');
const { buildGroups } = require('./jeeliz-lib.cjs');

const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'tryOnCatalog.json');

const groups = buildGroups();

// Un modelo "genérico" por categoría, usado cuando una montura real no coincide con
// ningún modelo conocido — mejor una vista de referencia similar que ningún try-on.
const GENERIC_BY_CATEGORY = {
  sol: 'rb-wayfarer',
  deportivas: 'oakley-holbrook',
  ninos: 'rb-kids-square',
  formuladas: 'rb-clubmaster',
};

const index = groups.map((group) => ({
  key: group.key,
  brand: group.brand,
  name: group.name,
  category: group.category,
  colors: group.colors.map((c) => ({
    name: c.name,
    tryOnSku: c.tryOnSku,
    lenses: c.lenses,
  })),
}));

const genericKeys = Object.values(GENERIC_BY_CATEGORY);
const missing = genericKeys.filter((key) => !index.some((g) => g.key === key));
if (missing.length > 0) {
  throw new Error(`GENERIC_BY_CATEGORY apunta a claves que ya no existen: ${missing.join(', ')}`);
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(
  OUT_PATH,
  JSON.stringify({ generic: GENERIC_BY_CATEGORY, models: index }, null, 2) + '\n',
);

console.log(`Índice de try-on: ${index.length} modelos escritos en ${path.relative(process.cwd(), OUT_PATH)}`);
