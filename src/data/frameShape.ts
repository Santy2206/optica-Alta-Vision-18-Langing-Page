// Inferencia de "forma de montura" a partir del nombre/categoría del producto.
// No es un campo del CMS: se calcula en build time para poder recomendar
// monturas en el test de forma de rostro sin tener que re-etiquetar el catálogo a mano.

export type FrameShape = 'aviador' | 'cuadrada' | 'redonda' | 'rectangular' | 'cat-eye' | 'ovalada';

type CatalogItem = {
  name: string;
  category: string;
};

const NAME_RULES: Array<[RegExp, FrameShape]> = [
  [/cat.?eye|ojo de gato/i, 'cat-eye'],
  [/clubmaster|browline|rectangular|plegable/i, 'rectangular'],
  [/aviator|aviador|piloto|caravan|outdoorsman|cockpit|predator|shooter|double.?bridge/i, 'aviador'],
  [/round|redond|clubround|erika|andy|original/i, 'redonda'],
  [/wayfarer|justin|chris|boyfriend|marshal|frogskins|hexagonal|square|cuadrad/i, 'cuadrada'],
];

const CATEGORY_DEFAULTS: Record<string, FrameShape | null> = {
  sol: 'aviador',
  deportivas: 'rectangular',
  ninos: 'redonda',
  formuladas: 'ovalada',
  contacto: null,
};

export function getFrameShape(item: CatalogItem): FrameShape | null {
  if (item.category === 'contacto') return null;

  const byName = NAME_RULES.find(([pattern]) => pattern.test(item.name));
  if (byName) return byName[1];

  return CATEGORY_DEFAULTS[item.category] ?? null;
}

/** Nombre legible en plural, para "Te quedan: {estilos}". */
export const frameShapeLabel: Record<FrameShape, string> = {
  aviador: 'Aviador',
  cuadrada: 'Cuadradas',
  redonda: 'Redondas',
  rectangular: 'Rectangulares',
  'cat-eye': 'Ojo de gato',
  ovalada: 'Ovaladas',
};
