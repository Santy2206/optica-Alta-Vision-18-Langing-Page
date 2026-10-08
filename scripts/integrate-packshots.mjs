// Integra packshots aprobados (QA) al sitio:
//  - WebP en public/uploads/catalogo/
//  - JSON en src/content/catalogo/
//  - Limpia ítems demo viejos opcionales
//
// Uso: node scripts/integrate-packshots.mjs
// Luego: npm run cutouts

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROJECTS = path.join(ROOT, '..');
const PACK = path.join(PROJECTS, 'Imaganes', 'Catalogo_Packshot');
const VERDICT = path.join(PACK, '_qa', '_verdict.json');
const OUT_IMG = path.join(ROOT, 'public', 'uploads', 'catalogo');
const OUT_JSON = path.join(ROOT, 'src', 'content', 'catalogo');

/** Nombres legibles a partir del sku_group */
function humanName(sku) {
  const map = {
    aviador01__dorado_aviador_988: 'Aviador Dorado',
    aviador01__dorado_aviador_clasico_a: 'Aviador Dorado Clásico',
    aviador01__dorado_rimless_989: 'Aviador Rimless Dorado',
    aviador01__dorado_rimless_a: 'Aviador Rimless Dorado 2',
    aviador01__negro_cuadrado_a: 'Aviador Negro Cuadrado',
    aviador01__negro_rectangular_987: 'Aviador Negro Rectangular',
    aviador01__plateado_clasico_a: 'Aviador Plateado Clásico',
    aviador01__plateado_cuadrado_974: 'Aviador Plateado Cuadrado',
    aviador01__plateado_cuadrado_cobre: 'Aviador Cobre',
    aviador01__plateado_logo_puente: 'Aviador Plateado Puente',
    aviador01__plateado_redondeado_a: 'Aviador Plateado Redondeado',
    aviador01__plateado_redondeado_b: 'Aviador Plateado Redondeado 2',
    aviador01__plateado_rimless_a: 'Aviador Rimless Plateado',
    aviador01__plateado_simple_962: 'Aviador Plateado',
    aviador01__plateado_simple_977: 'Aviador Plateado 2',
    rect02__plateado_990: 'Rectangular Plateado',
    rect02__plateado_a: 'Rectangular Plateado 2',
    redonda03__cyo_plateado: 'Redonda Plateada',
    redonda03__plateado_968: 'Ovalada Plateada',
    redonda03__plateado_sticker_a: 'Ovalada Plateada 2',
    hexagonal04__dorado_a: 'Hexagonal Dorada',
    hexagonal04__dorado_b: 'Hexagonal Dorada 2',
    hexagonal04__dorado_sticker: 'Hexagonal Dorada 3',
    cateye05__dorado_angular_a: 'Cat-Eye Dorado Angular',
    cateye05__dorado_clasico_a: 'Cat-Eye Dorado',
    cateye05__negra_angular_942: 'Cat-Eye Azul Angular',
    cateye05__negra_logo_a: 'Cat-Eye Burdeo',
    cateye05__rimless_dorado_a: 'Cat-Eye Rimless Dorado',
    cateye05__rosado_930: 'Cat-Eye Rosado',
    cateye05__transparente_941: 'Cat-Eye Semi-rimless',
    cateye05__transparente_b: 'Cat-Eye Hexagonal Dorado',
    cateyeacetato06__azul_a: 'Cat-Eye Acetato Azul',
    cateyeacetato06__azul_dorado_935: 'Cat-Eye Acetato Negro',
    cateyeacetato06__negro_azul_936: 'Cat-Eye Acetato Gris',
    clubmaster07__negro_978: 'Clubmaster Negro',
    clubmaster07__plateado_980: 'Clubmaster Semi-rimless',
    clubmaster07__transparente_b: 'Clubmaster Champagne',
    clubmaster07__transparente_sticker_a: 'Clubmaster Transparente',
    deportiva08__negro_azul_a: 'Deportiva Negra',
    deportiva08__transparente_azul_998: 'Deportiva Café',
    deportiva08__transparente_naranja_a: 'Deportiva Gris',
    deportiva08__transparente_verde_a: 'Deportiva Transparente Verde',
    acetatocuadrada09__gris_a: 'Cuadrada Gris',
    acetatocuadrada09__gris_b: 'Cuadrada Gris Mate',
    acetatocuadrada09__transparente_a: 'Cuadrada Transparente',
    acetatocuadrada09__transparente_b: 'Cuadrada Cristal',
    acetatocuadrada09__verde_a: 'Cuadrada Verde Oliva',
    panto10__negro_021: 'Panto Negro',
  };
  if (map[sku]) return map[sku];
  return sku
    .replace(/^[^_]+__/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function categoryFor(familia, sku) {
  if (familia.startsWith('08_')) return 'deportivas';
  if (familia.startsWith('01_') && /sol|tint/i.test(sku)) return 'sol';
  return 'formuladas';
}

/** Forma de montura (test de rostro) según la carpeta de familia. Se puede corregir en el CMS. */
function frameShapeFor(familia) {
  const map = {
    '01_': 'aviador',
    '02_': 'rectangular',
    '03_': 'redonda',
    '04_': 'cuadrada',
    '05_': 'cat-eye',
    '06_': 'cat-eye',
    '07_': 'clubmaster',
    '08_': 'rectangular',
    '09_': 'cuadrada',
    '10_': 'redonda',
  };
  return map[familia.slice(0, 3)];
}

function colorGuess(name, sku) {
  const s = `${name} ${sku}`.toLowerCase();
  if (/dorado|gold|cobre|champagne|rosado|rosa/.test(s)) {
    if (/rosado|rosa/.test(s)) return { name: 'Rosado', hex: '#C4A4A0' };
    if (/cobre/.test(s)) return { name: 'Cobre', hex: '#B87333' };
    if (/champagne/.test(s)) return { name: 'Champagne', hex: '#E8D5C4' };
    return { name: 'Dorado', hex: '#C5A46E' };
  }
  if (/plateado|silver|gris|gunmetal/.test(s)) return { name: 'Plateado', hex: '#C0C0C0' };
  if (/negro|black/.test(s)) return { name: 'Negro', hex: '#1a1a1a' };
  if (/azul|blue/.test(s)) return { name: 'Azul', hex: '#1e3a5f' };
  if (/verde|green|oliva/.test(s)) return { name: 'Verde', hex: '#6B7C5E' };
  if (/burdeo|vino|cafe|café|marron|brown/.test(s)) return { name: 'Café', hex: '#5C4033' };
  if (/transparente|cristal|clear/.test(s)) return { name: 'Transparente', hex: '#E8E8E8' };
  return { name: 'Único', hex: '#888888' };
}

function slugify(sku) {
  return sku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function main() {
  if (!existsSync(VERDICT)) throw new Error(`Falta verdict: ${VERDICT}`);
  const verdict = JSON.parse(readFileSync(VERDICT, 'utf8'));
  const rejected = new Set((verdict.reject || []).map((r) => r.sku_group));

  mkdirSync(OUT_IMG, { recursive: true });
  mkdirSync(OUT_JSON, { recursive: true });

  // Quitar demos viejos del catálogo (no packshot pipeline)
  const legacy = [
    'aviador-dorado',
    'clubmaster-azul',
    'hexagonal-dorada',
    'redonda-acetato-negra',
    'vintage',
  ];
  for (const id of legacy) {
    const jp = path.join(OUT_JSON, `${id}.json`);
    if (existsSync(jp)) {
      rmSync(jp);
      console.log(`[integrate] removed legacy json ${id}`);
    }
  }

  const families = readdirSync(PACK, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);

  let done = 0;
  let skipped = 0;
  const written = [];

  for (const familia of families) {
    const famDir = path.join(PACK, familia);
    for (const sku of readdirSync(famDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()) {
      if (rejected.has(sku)) {
        skipped += 1;
        console.log(`[integrate] skip reject ${sku}`);
        continue;
      }
      const frontPath = path.join(famDir, sku, 'front.jpg');
      if (!existsSync(frontPath)) {
        skipped += 1;
        continue;
      }
      const hoverPath = path.join(famDir, sku, 'hover.jpg');
      const slug = slugify(sku);
      const webpName = `${slug}.webp`;
      const hoverWebpName = `${slug}-hover.webp`;
      const webpOut = path.join(OUT_IMG, webpName);
      const hoverOut = path.join(OUT_IMG, hoverWebpName);

      await sharp(frontPath).webp({ quality: 88 }).toFile(webpOut);
      let hoverUrl = undefined;
      if (existsSync(hoverPath)) {
        await sharp(hoverPath).webp({ quality: 88 }).toFile(hoverOut);
        hoverUrl = `/uploads/catalogo/${hoverWebpName}`;
      }

      const name = humanName(sku);
      const color = colorGuess(name, sku);
      const category = categoryFor(familia, sku);
      const imageUrl = `/uploads/catalogo/${webpName}`;

      const json = {
        name,
        brand: 'Óptica Alta Visión 18',
        category,
        ...(frameShapeFor(familia) ? { frameShape: frameShapeFor(familia) } : {}),
        price: null,
        image: imageUrl,
        imageAlt: `Montura ${name}`,
        featured: done < 8,
        colors: [
          {
            name: color.name,
            hex: color.hex,
            image: imageUrl,
            ...(hoverUrl ? { modelImage: hoverUrl } : {}),
            lenses: [],
          },
        ],
        ...(hoverUrl ? { hoverImage: hoverUrl } : {}),
      };

      writeFileSync(path.join(OUT_JSON, `${slug}.json`), JSON.stringify(json, null, 2) + '\n');
      written.push({ slug, name, category, hover: Boolean(hoverUrl) });
      done += 1;
      console.log(`[integrate] ${slug} (${name})${hoverUrl ? ' +hover' : ''}`);
    }
  }

  const report = {
    done,
    skippedReject: rejected.size,
    written,
    at: new Date().toISOString(),
  };
  writeFileSync(path.join(PACK, '_integrate_report.json'), JSON.stringify(report, null, 2));
  console.log(`[integrate] listo: ${done} productos, ${written.filter((w) => w.hover).length} con hover`);
  console.log('[integrate] siguiente: npm run cutouts');
}

main().catch((e) => {
  console.error('[integrate] FATAL', e.message);
  process.exit(1);
});
