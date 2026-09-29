// Lógica compartida para leer scripts/jeeliz-glassesSKU.csv (base pública y gratuita
// de Jeeliz, licencia Apache 2.0) y agruparla por modelo real (marca + nombre comercial).
//
// La usan:
// - scripts/generate-catalogo-jeeliz.cjs (siembra el catálogo demo con los 57 modelos)
// - scripts/build-tryon-index.cjs (genera src/data/tryOnCatalog.json, el índice que usa
//   el sitio para encontrar automáticamente un SKU de "probar con cámara" cuando el
//   negocio agrega una montura real sin SKU manual, por coincidencia de marca/nombre)

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'jeeliz-glassesSKU.csv');

const EXCLUDE_PREFIXES = [
  'aliexpress_',
  'thierry_lasry',
  'smcc_',
  'dior_',
  'prada_',
  'gucci_',
  'burberry_',
];

// --- 1. Reglas de agrupación (orden importa: más específico primero) ---
const GROUPS = [
  { test: /^rayban_round_doubleBridge_/, key: 'rb-round-double-bridge', nombre: 'Round Double Bridge', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_doubleBridge_/, key: 'rb-double-bridge', nombre: 'Double Bridge', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_new_wayfarer_/, key: 'rb-new-wayfarer', nombre: 'New Wayfarer', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_wayfarer_/, key: 'rb-wayfarer', nombre: 'Wayfarer', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_clubmasterFleck_/, key: 'rb-clubmaster-fleck', nombre: 'Clubmaster Fleck', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_clubmaster_/, key: 'rb-clubmaster', nombre: 'Clubmaster', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_clubround_/, key: 'rb-clubround', nombre: 'Clubround', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_aviator_/, key: 'rb-aviator', nombre: 'Aviador', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_round_/, key: 'rb-round', nombre: 'Round', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_erika_/, key: 'rb-erika', nombre: 'Erika', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_cockpit_/, key: 'rb-cockpit', nombre: 'Cockpit', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_justin_/, key: 'rb-justin', nombre: 'Justin', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_boyfriend_/, key: 'rb-boyfriend', nombre: 'Boyfriend', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_chris_/, key: 'rb-chris', nombre: 'Chris', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_predator_/, key: 'rb-predator', nombre: 'Predator', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_andy_/, key: 'rb-andy', nombre: 'Andy', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_caravan_/, key: 'rb-caravan', nombre: 'Caravan', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^rayban_ferrari_/, key: 'rb-ferrari', nombre: 'Ferrari', brand: 'Ray-Ban', categoria: 'sol' },

  { test: /^marshal_/, key: 'rb-marshal', nombre: 'Marshal', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blazeaviator_/, key: 'rb-blaze-aviator', nombre: 'Blaze Aviador', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^Outdoorsman_/, key: 'rb-outdoorsman', nombre: 'Outdoorsman', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_wayfarer_/, key: 'rb-blaze-wayfarer', nombre: 'Blaze Wayfarer', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_rb4380n_/, key: 'rb-kids-square', nombre: 'Kids Square', brand: 'Ray-Ban', categoria: 'ninos' },
  { test: /^blaze_db_/, key: 'rb-blaze-doublebridge', nombre: 'Blaze Doublebridge', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_round_/, key: 'rb-blaze-round', nombre: 'Blaze Round', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_clubmaster_/, key: 'rb-blaze-clubmaster', nombre: 'Blaze Clubmaster', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_hexagonal_/, key: 'rb-blaze-hexagonal', nombre: 'Blaze Hexagonal', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_genral_/, key: 'rb-blaze-general', nombre: 'Blaze General', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_shooter_/, key: 'rb-blaze-shooter', nombre: 'Blaze Shooter', brand: 'Ray-Ban', categoria: 'sol' },
  { test: /^blaze_cateye_/, key: 'rb-blaze-cateye', nombre: 'Blaze Ojo de Gato', brand: 'Ray-Ban', categoria: 'sol' },

  // Carrera, Persol y Polaroid identifican sus modelos solo por código de referencia:
  // les damos un nombre comercial en español y dejamos el código visible en "brand".
  { test: /^carrera_113S_/i, key: 'carrera-113s', nombre: 'Piloto Metálico', brand: 'Carrera · Ref. 113/S', categoria: 'sol' },
  { test: /^carrera_114S_/i, key: 'carrera-114s', nombre: 'Cuadrado Urbano', brand: 'Carrera · Ref. 114/S', categoria: 'sol' },
  { test: /^carrera_116s_/i, key: 'carrera-116s', nombre: 'Rectangular Clásico', brand: 'Carrera · Ref. 116/S', categoria: 'sol' },
  { test: /^carrera_118S_/i, key: 'carrera-118s', nombre: 'Piloto Acetato', brand: 'Carrera · Ref. 118/S', categoria: 'sol' },
  { test: /^carrera_119S_/i, key: 'carrera-119s', nombre: 'Cuadrado Deportivo', brand: 'Carrera · Ref. 119/S', categoria: 'sol' },
  { test: /^carrera_5003_/, key: 'carrera-5003', nombre: 'Retro Clásico', brand: 'Carrera · Ref. 5003', categoria: 'sol' },
  { test: /^carrera_5029_/, key: 'carrera-5029', nombre: 'Rectangular Moderno', brand: 'Carrera · Ref. 5029', categoria: 'sol' },
  { test: /^carrera_6008_/, key: 'carrera-6008', nombre: 'Cuadrado Ejecutivo', brand: 'Carrera · Ref. 6008', categoria: 'sol' },

  { test: /^frogskins_/, key: 'oakley-frogskins', nombre: 'Frogskins', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^flak_/, key: 'oakley-flak', nombre: 'Flak', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^latch_/, key: 'oakley-latch', nombre: 'Latch', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^holbrook_/, key: 'oakley-holbrook', nombre: 'Holbrook', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^catalyst_/, key: 'oakley-catalyst', nombre: 'Catalyst', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^oakley_jawbreak_/, key: 'oakley-jawbreaker', nombre: 'Jawbreaker', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^oakley_m2_/, key: 'oakley-m2', nombre: 'M2 Frame', brand: 'Oakley', categoria: 'deportivas' },
  { test: /^oakley_radar_path_/, key: 'oakley-radar-path', nombre: 'Radar Path', brand: 'Oakley', categoria: 'deportivas' },

  { test: /^persol_PO0649_/i, key: 'persol-po0649', nombre: 'Original', brand: 'Persol · Ref. PO0649', categoria: 'sol' },
  { test: /^persol_PO3105S_/i, key: 'persol-po3105s', nombre: 'Vintage Cuadrado', brand: 'Persol · Ref. PO3105S', categoria: 'sol' },
  { test: /^persol_PO0714_/i, key: 'persol-po0714', nombre: 'Plegable Clásico', brand: 'Persol · Ref. PO0714', categoria: 'sol' },

  { test: /^mykita_/, key: 'mykita-doug', nombre: 'Doug', brand: 'Mykita', categoria: 'sol' },

  { test: /^polaroid_6003_/, key: 'polaroid-6003', nombre: 'Urbano', brand: 'Polaroid · Ref. 6003', categoria: 'sol' },
  { test: /^polaroid_1013_/, key: 'polaroid-1013', nombre: 'Esencial', brand: 'Polaroid · Ref. 1013', categoria: 'sol' },
  { test: /^polaroid_6009_/, key: 'polaroid-6009', nombre: 'Metro', brand: 'Polaroid · Ref. 6009', categoria: 'sol' },
  { test: /^polaroid_4005_/, key: 'polaroid-4005', nombre: 'Horizonte', brand: 'Polaroid · Ref. 4005', categoria: 'sol' },
  { test: /^polaroid_6016_/, key: 'polaroid-6016', nombre: 'Brisa', brand: 'Polaroid · Ref. 6016', categoria: 'sol' },
  { test: /^polaroid_4023_/, key: 'polaroid-4023', nombre: 'Costa', brand: 'Polaroid · Ref. 4023', categoria: 'sol' },
  { test: /^polaroid_7009_/, key: 'polaroid-7009', nombre: 'Sport', brand: 'Polaroid · Ref. 7009', categoria: 'sol' },
];

const FEATURED_KEYS = new Set([
  'rb-aviator',
  'rb-wayfarer',
  'rb-clubmaster',
  'oakley-radar-path',
  'carrera-118s',
]);

const PLACEHOLDER_BY_CATEGORY = {
  sol: '/uploads/catalogo/placeholder-sol.webp',
  deportivas: '/uploads/catalogo/placeholder-deportivas.webp',
  ninos: '/uploads/catalogo/placeholder-ninos.webp',
};

// --- 2. Diccionario de tokens de color/acabado (para armar el nombre en español) ---
const TOKENS = {
  noir: { es: 'Negro', hex: '#1C1C1C', kind: 'color' },
  black: { es: 'Negro', hex: '#1C1C1C', kind: 'color' },
  blanc: { es: 'Blanco', hex: '#F5F5F5', kind: 'color' },
  white: { es: 'Blanco', hex: '#F5F5F5', kind: 'color' },
  gris: { es: 'Gris', hex: '#8E8E8E', kind: 'color' },
  gray: { es: 'Gris', hex: '#8E8E8E', kind: 'color' },
  grey: { es: 'Gris', hex: '#8E8E8E', kind: 'color' },
  argent: { es: 'Plateado', hex: '#C0C0C0', kind: 'color' },
  silver: { es: 'Plateado', hex: '#C0C0C0', kind: 'color' },
  cuivre: { es: 'Cobre', hex: '#B87333', kind: 'color' },
  bronze: { es: 'Bronce', hex: '#8C7853', kind: 'color' },
  gunmetal: { es: 'Gunmetal', hex: '#4B4B4E', kind: 'color' },
  gun: { es: 'Gunmetal', hex: '#4B4B4E', kind: 'color' },
  havane: { es: 'Habano', hex: '#8B5A2B', kind: 'color' },
  havana: { es: 'Habano', hex: '#8B5A2B', kind: 'color' },
  marron: { es: 'Marrón', hex: '#6B4423', kind: 'color' },
  brown: { es: 'Marrón', hex: '#6B4423', kind: 'color' },
  or: { es: 'Dorado', hex: '#C9A227', kind: 'color' },
  gold: { es: 'Dorado', hex: '#C9A227', kind: 'color' },
  orange: { es: 'Naranja', hex: '#E07A2F', kind: 'color' },
  bleu: { es: 'Azul', hex: '#2A5CAA', kind: 'color' },
  blue: { es: 'Azul', hex: '#2A5CAA', kind: 'color' },
  vert: { es: 'Verde', hex: '#2E8B57', kind: 'color' },
  green: { es: 'Verde', hex: '#2E8B57', kind: 'color' },
  rouge: { es: 'Rojo', hex: '#C0392B', kind: 'color' },
  red: { es: 'Rojo', hex: '#C0392B', kind: 'color' },
  rose: { es: 'Rosado', hex: '#E8A0BF', kind: 'color' },
  pink: { es: 'Rosado', hex: '#E8A0BF', kind: 'color' },
  violet: { es: 'Violeta', hex: '#6A3FA0', kind: 'color' },
  purple: { es: 'Violeta', hex: '#6A3FA0', kind: 'color' },
  jaune: { es: 'Amarillo', hex: '#E8C547', kind: 'color' },
  yellow: { es: 'Amarillo', hex: '#E8C547', kind: 'color' },
  transparent: { es: 'Transparente', hex: '#EAF6F5', kind: 'color' },
  cristal: { es: 'Cristal', hex: '#EAF6F5', kind: 'color' },
  lilas: { es: 'Lila', hex: '#9B7EDE', kind: 'color' },
  denim: { es: 'Denim', hex: '#6E8FAF', kind: 'color' },

  degrade: { es: 'degradado', kind: 'finish' },
  gradient: { es: 'degradado', kind: 'finish' },
  flash: { es: 'flash', kind: 'finish' },
  mirroir: { es: 'espejado', kind: 'finish' },
  miroir: { es: 'espejado', kind: 'finish' },
  mirror: { es: 'espejado', kind: 'finish' },
  classique: { es: 'clásico', kind: 'finish' },
  classic: { es: 'clásico', kind: 'finish' },
  polarise: { es: 'polarizado', kind: 'finish' },
  polarized: { es: 'polarizado', kind: 'finish' },
  chromance: { es: 'cromado', kind: 'finish' },
  matte: { es: 'mate', kind: 'finish' },
  mat: { es: 'mate', kind: 'finish' },
  g15: { es: 'G-15', kind: 'finish' },
  b15: { es: 'B-15', kind: 'finish' },

  clair: { es: 'claro', kind: 'modifier' },
  fonce: { es: 'oscuro', kind: 'modifier' },

  bi: { kind: 'skip' },
  color: { kind: 'skip' },
};

const TOKEN_KEYS_BY_LENGTH_DESC = Object.keys(TOKENS).sort((a, b) => b.length - a.length);

function splitCamelCase(word) {
  return word.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function greedyTokenize(chunk) {
  let remaining = chunk;
  const found = [];
  while (remaining.length > 0) {
    const match = TOKEN_KEYS_BY_LENGTH_DESC.find((key) => remaining.startsWith(key));
    if (match) {
      found.push(TOKENS[match]);
      remaining = remaining.slice(match.length);
    } else {
      // consumir un carácter "desconocido" a la vez y agrupar al final
      const nextKnownIndex = TOKEN_KEYS_BY_LENGTH_DESC
        .map((key) => remaining.indexOf(key))
        .filter((i) => i > 0);
      const cut = nextKnownIndex.length > 0 ? Math.min(...nextKnownIndex) : remaining.length;
      const unknown = remaining.slice(0, cut);
      if (unknown.trim().length > 0 && !/^\d+$/.test(unknown)) {
        found.push({ es: unknown.charAt(0).toUpperCase() + unknown.slice(1), kind: 'unknown' });
      }
      remaining = remaining.slice(cut);
    }
  }
  return found;
}

function tokenizeSegments(segments) {
  return segments
    .map(splitCamelCase)
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap(greedyTokenize)
    .filter((t) => t && t.kind !== 'skip');
}

function describe(tokens, fallback) {
  const seen = new Set();
  const colorWords = [];
  const otherWords = [];

  for (const t of tokens) {
    if (seen.has(t.es)) continue;
    seen.add(t.es);
    if (t.kind === 'color' || t.kind === 'unknown') colorWords.push(t);
    else otherWords.push(t.es);
  }

  const colorsLabel = colorWords.map((c) => c.es).join(' / ');
  const extras = otherWords.join(' ');
  let label = [colorsLabel, extras].filter(Boolean).join(' ') || fallback;
  label = label.charAt(0).toUpperCase() + label.slice(1);

  const hexes = colorWords.filter((c) => c.hex).map((c) => c.hex);
  const hex = hexes[0] || '#8E8E8E';
  const hex2 = hexes.find((h) => h !== hex);

  return { label, hex, hex2 };
}

const METAL_SEGMENTS = new Set(['gun', 'argent', 'or', 'cuivre', 'bronze', 'gold', 'silver']);
const MODIFIER_SEGMENTS = new Set(['clair', 'fonce']);

// Los SKUs de Jeeliz siguen el patrón <marco>_<lente>. Casos especiales:
// - "noir_gun_bleu_mirroir": el 2º segmento metálico es parte del marco (marco bicolor)
//   siempre que al lente le quede algún color propio.
// - "marron_clair_vert_mirroir": "clair" modifica al marco, no al lente.
function splitFrameLens(remainder) {
  const segments = remainder.split('_').filter((s) => s && !/^\d+$/.test(s));
  const frame = [segments[0]];
  let lens = segments.slice(1);

  const lensHasColor = (segs) => tokenizeSegments(segs).some((t) => t.kind === 'color');

  if (lens.length >= 2 && METAL_SEGMENTS.has(lens[0].toLowerCase()) && lensHasColor(lens.slice(1))) {
    frame.push(lens[0]);
    lens = lens.slice(1);
  }
  if (lens.length >= 2 && MODIFIER_SEGMENTS.has(lens[0].toLowerCase())) {
    frame.push(lens[0]);
    lens = lens.slice(1);
  }

  return {
    frame: describe(tokenizeSegments(frame), 'Único'),
    lens: describe(tokenizeSegments(lens), 'Original'),
  };
}

/** Lee el CSV y agrupa los SKUs por modelo real (misma montura = mismo grupo). */
function buildGroups() {
  const csv = fs.readFileSync(CSV_PATH, 'utf-8').split('\n').slice(1);
  const groupsData = new Map();

  for (const rawLine of csv) {
    const line = rawLine.trim();
    if (!line) continue;
    const commaIndex = line.indexOf(',');
    if (commaIndex === -1) continue;
    const sku = line.slice(0, commaIndex).trim();
    if (!sku) continue;
    if (EXCLUDE_PREFIXES.some((p) => sku.startsWith(p))) continue;
    if (sku === 'rayban_wayfarer_Jeeliz') continue;

    const groupDef = GROUPS.find((g) => g.test.test(sku));
    if (!groupDef) continue; // SKU no cubierto por ninguna regla conocida: se omite

    const prefixMatch = sku.match(groupDef.test);
    const remainder = sku.slice(prefixMatch[0].length);
    if (!remainder) continue;

    if (!groupsData.has(groupDef.key)) {
      groupsData.set(groupDef.key, { def: groupDef, variants: [] });
    }
    groupsData.get(groupDef.key).variants.push({ sku, remainder });
  }

  const groups = [];
  for (const [key, { def, variants }] of groupsData) {
    const framesByLabel = new Map();
    for (const { sku, remainder } of variants) {
      const { frame, lens } = splitFrameLens(remainder);
      if (!framesByLabel.has(frame.label)) {
        framesByLabel.set(frame.label, {
          name: frame.label,
          hex: frame.hex,
          ...(frame.hex2 ? { hex2: frame.hex2 } : {}),
          tryOnSku: sku,
          lenses: [],
        });
      }
      const entry = framesByLabel.get(frame.label);
      if (!entry.lenses.some((l) => l.name === lens.label)) {
        entry.lenses.push({ name: lens.label, hex: lens.hex, tryOnSku: sku });
      }
    }
    const colors = [...framesByLabel.values()];
    groups.push({
      key,
      name: def.nombre,
      brand: def.brand,
      category: def.categoria,
      featured: FEATURED_KEYS.has(key),
      placeholderImage: PLACEHOLDER_BY_CATEGORY[def.categoria],
      colors,
    });
  }

  return groups;
}

module.exports = { buildGroups, GROUPS, PLACEHOLDER_BY_CATEGORY };
