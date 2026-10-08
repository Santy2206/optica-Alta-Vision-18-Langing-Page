// Forma de la montura, usada por el test de forma de rostro para recomendar monturas.
// Fuente principal: el campo `frameShape` del producto (CMS, obligatorio en productos
// nuevos). Si falta, se infiere del nombre/categoría como respaldo.

export const FRAME_SHAPES = ['aviador', 'cuadrada', 'rectangular', 'clubmaster', 'redonda', 'ovalada', 'cat-eye'] as const;

export type FrameShape = (typeof FRAME_SHAPES)[number];

type CatalogItem = {
  name: string;
  category: string;
  frameShape?: FrameShape;
};

const NAME_RULES: Array<[RegExp, FrameShape]> = [
  [/cat.?eye|ojo de gato/i, 'cat-eye'],
  [/clubmaster|browline/i, 'clubmaster'],
  [/rectangular|plegable/i, 'rectangular'],
  [/aviator|aviador|piloto|caravan|outdoorsman|cockpit|predator|shooter|double.?bridge/i, 'aviador'],
  [/round|redond|panto|clubround|erika|andy|original/i, 'redonda'],
  [/oval/i, 'ovalada'],
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
  if (item.frameShape) return item.frameShape;

  const byName = NAME_RULES.find(([pattern]) => pattern.test(item.name));
  if (byName) return byName[1];

  return CATEGORY_DEFAULTS[item.category] ?? null;
}

/** Nombre legible en plural, para "Te quedan: {estilos}". */
export const frameShapeLabel: Record<FrameShape, string> = {
  aviador: 'Aviador',
  cuadrada: 'Cuadradas',
  rectangular: 'Rectangulares',
  clubmaster: 'Clubmaster',
  redonda: 'Redondas',
  ovalada: 'Ovaladas',
  'cat-eye': 'Ojo de gato',
};
