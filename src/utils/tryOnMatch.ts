import catalogData from '../data/tryOnCatalog.json';

interface LensOption {
  name: string;
  hex: string;
  tryOnSku: string;
}

interface ColorOption {
  name: string;
  tryOnSku: string;
  lenses: LensOption[];
}

interface Model {
  key: string;
  brand: string;
  name: string;
  category: string;
  colors: ColorOption[];
}

interface Catalog {
  generic: Record<string, string>;
  models: Model[];
}

const catalog = catalogData as Catalog;

export interface TryOnMatch {
  sku: string;
  frame: string;
  lenses: LensOption[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean);
}

/** Nombre principal de la marca, sin sufijos de referencia ("Carrera · Ref. 113/S" → "Carrera"). */
function primaryBrand(brand: string): string {
  return brand.split('·')[0].trim();
}

/**
 * Encuentra automáticamente un SKU de "probar con cámara" para una montura real que
 * no tiene un SKU asignado a mano, por coincidencia de marca/nombre contra el catálogo
 * gratuito de Jeeliz (scripts/jeeliz-glassesSKU.csv → src/data/tryOnCatalog.json).
 *
 * No genera un modelo 3D nuevo desde la foto del producto — eso no es viable hoy con
 * buena calidad para monturas — conecta el nombre con el modelo 3D más parecido que
 * Jeeliz ya tiene digitalizado. Si no hay coincidencia de marca, cae a un modelo
 * genérico de la misma categoría para que siempre haya algo que mostrar (el modal ya
 * avisa que es una vista de referencia).
 */
export function findTryOnMatch(brand: string, name: string, category: string): TryOnMatch | null {
  const query = normalize(`${brand} ${name}`);

  const scored = catalog.models
    .map((model) => {
      const brandWords = words(primaryBrand(model.brand));
      const brandHit = brandWords.length > 0 && brandWords.every((w) => query.includes(w));
      if (!brandHit) return { model, score: 0 };

      const nameHit = words(model.name).some((w) => w.length > 2 && query.includes(w));
      return { model, score: nameHit ? 2 : 1 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.model ?? catalog.models.find((m) => m.key === catalog.generic[category]);
  if (!best) return null;

  const color = best.colors[0];
  if (!color) return null;

  return { sku: color.tryOnSku, frame: color.name, lenses: color.lenses };
}
