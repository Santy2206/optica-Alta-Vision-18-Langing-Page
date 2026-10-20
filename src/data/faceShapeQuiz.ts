import type { FrameShape } from './frameShape';

export type FaceShapeId = 'ovalado' | 'redondo' | 'cuadrado' | 'rectangular' | 'corazon' | 'triangular' | 'diamante';

export type JawContour = 'suave' | 'angular';

export type FaceMeasurements = {
  /** Ancho de frente (cm), de sien a sien. */
  forehead: number;
  /** Ancho de pómulos (cm), el punto más ancho de las mejillas. */
  cheekbones: number;
  /** Ancho de mandíbula (cm), de esquina a esquina en línea recta. */
  jaw: number;
  /** Largo del rostro (cm), desde la línea del cabello hasta la punta del mentón. */
  length: number;
  /** Contorno de la mandíbula: ayuda a distinguir redondo vs cuadrado. */
  jawContour: JawContour;
};

export type FaceShapeResult = {
  shape: FaceShapeId;
  /** Etiqueta corta del subtipo (p. ej. "alargado", "equilibrado"). */
  subtype: string;
  /** Título listo para UI: "Ovalado · equilibrado". */
  displayLabel: string;
  confidence: 'alta' | 'media';
  ratios: {
    lengthToWidth: number;
    foreheadToJaw: number;
    cheekToForehead: number;
    cheekToJaw: number;
  };
  summary: string;
  /** Descripción de la forma (misma que se muestra en el resultado). */
  description: string;
  /** Formas de montura recomendadas, en orden de prioridad. */
  recommendedFrames: FrameShape[];
};

export const faceShapeInfo: Record<FaceShapeId, { label: string; image: string; description: string }> = {
  ovalado: {
    label: 'Ovalado',
    image: '/images/rostros/ovalado.svg',
    description:
      'Proporciones equilibradas: casi cualquier montura te queda bien. Aprovecha para experimentar con formas y colores.',
  },
  redondo: {
    label: 'Redondo',
    image: '/images/rostros/redondo.svg',
    description:
      'Mejillas y mandíbula suaves, ancho y alto similares. Las monturas angulares le dan más definición a tu rostro.',
  },
  cuadrado: {
    label: 'Cuadrado',
    image: '/images/rostros/cuadrado.svg',
    description:
      'Mandíbula marcada y frente ancha, con líneas rectas. Las monturas redondeadas suavizan tus rasgos.',
  },
  rectangular: {
    label: 'Rectangular / alargado',
    image: '/images/rostros/rectangular.svg',
    description:
      'Rostro claramente más largo que ancho, con frente, pómulos y mandíbula de ancho parecido. Las monturas altas y anchas acortan visualmente tu rostro.',
  },
  corazon: {
    label: 'Triángulo invertido / corazón',
    image: '/images/rostros/corazon.svg',
    description:
      'Frente ancha y mentón angosto. Las monturas más anchas en la parte baja equilibran tu rostro.',
  },
  triangular: {
    label: 'Triangular',
    image: '/images/rostros/triangular.svg',
    description:
      'Frente más angosta y mandíbula más ancha. Las monturas con detalle o color arriba llevan la atención a la parte alta del rostro.',
  },
  diamante: {
    label: 'Diamante',
    image: '/images/rostros/diamante.svg',
    description:
      'Pómulos marcados y frente/mentón angostos. Las monturas de ojo de gato, tipo clubmaster u ovaladas resaltan tus pómulos.',
  },
};

// Qué formas de montura recomendar según la forma de rostro, en orden de prioridad (el
// resultado del test reparte los productos entre ellas). Basado en guías de estilo
// estándar de óptica, no en una medición clínica:
// - ovalado: casi cualquiera.
// - redondo: angulares (cuadrada/hexagonal, rectangular, ojo de gato angular, aviador estructurado) para dar definición.
// - cuadrado: curvas que suavizan (redonda, ovalada, aviador).
// - rectangular/alargado: monturas con altura y curvas que acortan el rostro (aviador, redonda, ovalada, clubmaster, ojo de gato).
// - corazón / triángulo invertido: más anchas abajo o livianas; se evitan las cargadas arriba (ojo de gato, browline).
// - triangular: lo contrario; volumen arriba (ojo de gato, clubmaster/browline).
// - diamante: ojos y pómulos suavizados (ojo de gato, ovalada, redonda) o ceja marcada (clubmaster).
export const frameRecommendations: Record<FaceShapeId, FrameShape[]> = {
  ovalado: ['aviador', 'cat-eye', 'rectangular', 'cuadrada', 'redonda', 'clubmaster', 'ovalada'],
  redondo: ['cuadrada', 'rectangular', 'cat-eye', 'aviador'],
  cuadrado: ['redonda', 'ovalada', 'aviador'],
  rectangular: ['aviador', 'redonda', 'ovalada', 'clubmaster', 'cat-eye'],
  corazon: ['aviador', 'ovalada', 'redonda', 'cat-eye', 'clubmaster', 'cuadrada'],
  triangular: ['cat-eye', 'clubmaster'],
  diamante: ['cat-eye', 'ovalada', 'redonda', 'clubmaster'],
};

/**
 * Selección manual de monturas (ids del catálogo, en orden) para formas donde la montura
 * concreta importa más que su silueta: en corazón / triángulo invertido solo van las ligeras,
 * al aire (rimless/semi-rimless), claras o translúcidas; las demás formas (salvo ovalado, que
 * admite casi todo el catálogo) tienen su lista elegida a mano. Si una forma está aquí, el test y el
 * filtro del catálogo usan esta lista en lugar de `frameRecommendations`.
 */
export const curatedFrames: Partial<Record<FaceShapeId, string[]>> = {
  corazon: [
    'aviador01-plateado-rimless-a', // Aviador Rimless Plateado
    'aviador01-dorado-rimless-989', // Aviador Rimless Plateado Carey
    'aviador01-dorado-rimless-a', // Aviador Rimless Plateado Negro
    'cateye05-rimless-dorado-a', // Cat-Eye Rimless Palo de Rosa
    'cateye05-transparente-941', // Cat-Eye Semi-rimless
    'clubmaster07-plateado-980', // Clubmaster Semi-rimless
    'redonda03-plateado-968', // Ovalada Palo de Rosa
    'redonda03-plateado-sticker-a', // Ovalada Plateada
    'redonda03-cyo-plateado', // Redonda Lila
    'acetatocuadrada09-transparente-b', // Cuadrada Cristal
    'acetatocuadrada09-transparente-a', // Cuadrada Transparente
    'clubmaster07-transparente-b', // Clubmaster Champagne
    'clubmaster07-transparente-sticker-a', // Clubmaster Transparente
  ],
  redondo: [
    'acetatocuadrada09-gris-a', // Cuadrada Gris
    'acetatocuadrada09-gris-b', // Cuadrada Gris Mate
    'acetatocuadrada09-transparente-a', // Cuadrada Transparente
    'acetatocuadrada09-transparente-b', // Cuadrada Cristal
    'acetatocuadrada09-verde-a', // Cuadrada Verde Oliva
    'rect02-plateado-990', // Rectangular Plateado
    'rect02-plateado-a', // Rectangular Plateado 2
    'cateye05-dorado-angular-a', // Cat-Eye Dorado Angular
    'cateye05-negra-angular-942', // Cat-Eye Azul Angular
    'cateye05-transparente-b', // Cat-Eye Hexagonal Dorado
    'hexagonal04-dorado-a', // Hexagonal Dorada
    'hexagonal04-dorado-b', // Hexagonal Plateada
    'hexagonal04-dorado-sticker', // Hexagonal Oro Rosa
    'aviador01-negro-rectangular-987', // Aviador Cobre Rectangular
    'aviador01-negro-cuadrado-a', // Aviador Morado Cuadrado
    'aviador01-plateado-cuadrado-974', // Aviador Palo de Rosa Cuadrado
    'aviador01-plateado-cuadrado-cobre', // Aviador Plateado Cuadrado
  ],
  cuadrado: [
    'panto10-negro-021', // Redonda Panto Negro
    'redonda03-cyo-plateado', // Redonda Lila
    'redonda03-plateado-968', // Ovalada Palo de Rosa
    'redonda03-plateado-sticker-a', // Ovalada Plateada
    'aviador01-plateado-redondeado-a', // Aviador Plateado Redondeado
    'aviador01-plateado-redondeado-b', // Aviador Dorado Redondeado
    'aviador01-dorado-aviador-988', // Aviador Café
    'aviador01-dorado-aviador-clasico-a', // Aviador Dorado Clásico
    'aviador01-plateado-clasico-a', // Aviador Plateado Clásico
    'aviador01-plateado-simple-962', // Aviador Plateado
    'aviador01-plateado-simple-977', // Aviador Plateado 2
    'aviador01-plateado-logo-puente', // Aviador Plateado Puente
    'aviador01-dorado-rimless-989', // Aviador Rimless Plateado Carey
    'aviador01-dorado-rimless-a', // Aviador Rimless Plateado Negro
    'aviador01-plateado-rimless-a', // Aviador Rimless Plateado
  ],
  rectangular: [
    'aviador01-dorado-aviador-988', // Aviador Café
    'aviador01-dorado-aviador-clasico-a', // Aviador Dorado Clásico
    'aviador01-plateado-clasico-a', // Aviador Plateado Clásico
    'aviador01-plateado-simple-962', // Aviador Plateado
    'aviador01-plateado-simple-977', // Aviador Plateado 2
    'aviador01-plateado-logo-puente', // Aviador Plateado Puente
    'aviador01-plateado-redondeado-a', // Aviador Plateado Redondeado
    'aviador01-plateado-redondeado-b', // Aviador Dorado Redondeado
    'aviador01-negro-cuadrado-a', // Aviador Morado Cuadrado
    'aviador01-plateado-cuadrado-974', // Aviador Palo de Rosa Cuadrado
    'aviador01-plateado-cuadrado-cobre', // Aviador Plateado Cuadrado
    'aviador01-dorado-rimless-989', // Aviador Rimless Plateado Carey
    'aviador01-dorado-rimless-a', // Aviador Rimless Plateado Negro
    'aviador01-plateado-rimless-a', // Aviador Rimless Plateado
    'panto10-negro-021', // Redonda Panto Negro
    'redonda03-cyo-plateado', // Redonda Lila
    'redonda03-plateado-968', // Ovalada Palo de Rosa
    'redonda03-plateado-sticker-a', // Ovalada Plateada
    'clubmaster07-negro-978', // Clubmaster Negro
    'clubmaster07-plateado-980', // Clubmaster Semi-rimless
    'clubmaster07-transparente-b', // Clubmaster Champagne
    'clubmaster07-transparente-sticker-a', // Clubmaster Transparente
    'cateye05-dorado-clasico-a', // Cat-Eye Gris Dorado
    'cateye05-negra-logo-a', // Cat-Eye Burdeo
    'cateye05-rosado-930', // Cat-Eye Rosado
    'cateyeacetato06-azul-a', // Cat-Eye Acetato Azul
    'cateyeacetato06-azul-dorado-935', // Cat-Eye Acetato Negro
    'cateyeacetato06-negro-azul-936', // Cat-Eye Acetato Gris
  ],
  triangular: [
    'cateye05-dorado-angular-a', // Cat-Eye Dorado Angular
    'cateye05-dorado-clasico-a', // Cat-Eye Gris Dorado
    'cateye05-negra-angular-942', // Cat-Eye Azul Angular
    'cateye05-negra-logo-a', // Cat-Eye Burdeo
    'cateye05-rosado-930', // Cat-Eye Rosado
    'cateyeacetato06-azul-a', // Cat-Eye Acetato Azul
    'cateyeacetato06-azul-dorado-935', // Cat-Eye Acetato Negro
    'cateyeacetato06-negro-azul-936', // Cat-Eye Acetato Gris
    'clubmaster07-negro-978', // Clubmaster Negro
    'clubmaster07-plateado-980', // Clubmaster Semi-rimless
    'clubmaster07-transparente-b', // Clubmaster Champagne
    'clubmaster07-transparente-sticker-a', // Clubmaster Transparente
  ],
  diamante: [
    'cateye05-dorado-clasico-a', // Cat-Eye Gris Dorado
    'cateye05-rosado-930', // Cat-Eye Rosado
    'cateye05-rimless-dorado-a', // Cat-Eye Rimless Palo de Rosa
    'redonda03-plateado-968', // Ovalada Palo de Rosa
    'redonda03-plateado-sticker-a', // Ovalada Plateada
    'panto10-negro-021', // Redonda Panto Negro
    'redonda03-cyo-plateado', // Redonda Lila
    'clubmaster07-negro-978', // Clubmaster Negro
    'clubmaster07-transparente-b', // Clubmaster Champagne
    'clubmaster07-plateado-980', // Clubmaster Semi-rimless
  ],
};

/**
 * Umbrales de diamante de la cinta métrica (frente de sien a sien, mandíbula de esquina a
 * esquina). La cámara tiene los suyos en faceShapeCamera.ts porque mide otros puntos. Calibrados con
 * ~6000 rostros (landmarks de MediaPipe): los pómulos superan SIEMPRE a frente y
 * mandíbula en algún grado (mediana pómulos/frente 1.12, pómulos/mandíbula 1.18; con
 * un margen del 5% la regla se cumplía en el 98% de los rostros). Aquí exigimos un margen
 * que solo cumple un 2-4% de los rostros: pómulos ≥13% más anchos que la frente y ≥19%
 * más anchos que la mandíbula.
 */
export const DIAMOND_MIN_CHEEK_TO_FOREHEAD = 1.13;
export const DIAMOND_MIN_CHEEK_TO_JAW = 1.19;

/** Estructura única de resultado, idéntica para la cámara y la cinta métrica. */
export function buildFaceShapeResult(
  shape: FaceShapeId,
  data: Pick<FaceShapeResult, 'subtype' | 'confidence' | 'ratios' | 'summary'>,
): FaceShapeResult {
  const label = faceShapeInfo[shape].label;
  return {
    shape,
    ...data,
    displayLabel: data.subtype ? `${label} · ${data.subtype}` : label,
    description: faceShapeInfo[shape].description,
    recommendedFrames: frameRecommendations[shape],
  };
}

/** Pasos de medición: ilustración + cómo + errores típicos de ese paso. */
export const measurementSteps = [
  {
    id: 'forehead',
    field: 'forehead' as const,
    title: 'Ancho de la frente',
    how: 'Cinta en línea recta de sien a sien, a mitad entre cejas y nacimiento del cabello.',
    image: '/images/medicion/frente.webp',
    imageAlt: 'Ilustración: medir el ancho de la frente de sien a sien',
    placeholder: 'Ej. 13.5',
    mistakes: [
      'No rodees la cabeza: es de un extremo al otro, en recto.',
      'No incluyas orejas ni cabello; la cinta toca piel en las sienes.',
      'No aprietes hasta hundir la piel: firme, sin comprimir.',
    ],
  },
  {
    id: 'cheekbones',
    field: 'cheekbones' as const,
    title: 'Ancho de los pómulos',
    how: 'Punto más ancho de las mejillas, justo debajo del borde externo de cada ojo.',
    image: '/images/medicion/pomulos.webp',
    imageAlt: 'Ilustración: medir el ancho de los pómulos de hueso a hueso',
    placeholder: 'Ej. 14.0',
    mistakes: [
      'Siente el hueso del pómulo con los dedos; no midas solo “mejilla blanda”.',
      'Línea recta de hueso a hueso: no curvas la cinta por la cara.',
      'No midas a la altura de la boca ni de las cejas: es bajo el ojo.',
    ],
  },
  {
    id: 'jaw',
    field: 'jaw' as const,
    title: 'Ancho de la mandíbula',
    how: 'De esquina a esquina del maxilar (abajo de cada oreja, donde el hueso hace ángulo), en recto.',
    image: '/images/medicion/mandibula.webp',
    imageAlt: 'Ilustración: medir la mandíbula en línea recta, no por el mentón',
    placeholder: 'Ej. 12.5',
    mistakes: [
      'No pases la cinta por debajo del mentón ni sigas la curva.',
      'Busca el ángulo del hueso bajo cada oreja; no midas en el cuello.',
      'Boca cerrada y relajada: no aprietes la quijada.',
    ],
  },
  {
    id: 'length',
    field: 'length' as const,
    title: 'Largo del rostro',
    how: 'Desde el centro de la línea del cabello hasta la punta del mentón, cabeza derecha.',
    image: '/images/medicion/largo.webp',
    imageAlt: 'Ilustración: medir el largo del rostro de la línea del cabello al mentón',
    placeholder: 'Ej. 19.0',
    mistakes: [
      'No empieces en la ceja: es desde donde nace el cabello (hairline).',
      'Con flequillo o entradas, parte el cabello y mide el nacimiento real.',
      'Cabeza erguida y mirada al frente: inclinar alarga o acorta el resultado.',
    ],
  },
] as const;

export const measurementPrep = [
  'Cinta métrica flexible (o hilo + regla).',
  'Cabello recogido; frente y mandíbula libres.',
  'Espejo de frente, cabeza derecha.',
  'Centímetros con 1 decimal (ej. 13,5).',
];

const MIN_CM = 8;
const MAX_CM = 30;

/**
 * Rangos de proporciones humanas realistas, relativos al ancho de pómulos. Fuera de
 * estos rangos casi seguro hay un error al medir (cinta mal ubicada, cm vs mm, campos
 * cruzados), no un rostro real.
 */
export const PROPORTION_BOUNDS = {
  foreheadToCheek: [0.7, 1.15],
  jawToCheek: [0.65, 1.15],
  lengthToCheek: [1.0, 1.9],
} as const;

export class InvalidMeasurementsError extends Error {}

/** Devuelve un mensaje de error si las medidas son imposibles entre sí, o null si son plausibles. */
export function validateMeasurements(m: Pick<FaceMeasurements, 'forehead' | 'cheekbones' | 'jaw' | 'length'>): string | null {
  const { forehead, cheekbones, jaw, length } = m;
  if (![forehead, cheekbones, jaw, length].every(isValidMeasurement)) {
    return 'Usa centímetros entre 8 y 30 (ej. 13,5) en las 4 casillas.';
  }
  const inRange = (value: number, [min, max]: readonly [number, number]) => value >= min && value <= max;
  if (!inRange(forehead / cheekbones, PROPORTION_BOUNDS.foreheadToCheek)) {
    return 'La frente no cuadra con tus pómulos: revisa ambas medidas (de sien a sien y de hueso a hueso del pómulo).';
  }
  if (!inRange(jaw / cheekbones, PROPORTION_BOUNDS.jawToCheek)) {
    return 'La mandíbula no cuadra con tus pómulos: mídela en línea recta de esquina a esquina del maxilar, sin seguir la curva.';
  }
  if (!inRange(length / cheekbones, PROPORTION_BOUNDS.lengthToCheek)) {
    return 'El largo del rostro no cuadra con el ancho: mídelo desde el nacimiento del cabello hasta la punta del mentón.';
  }
  return null;
}

export function isValidMeasurement(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_CM && value <= MAX_CM;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function withinPct(a: number, b: number, pct: number): boolean {
  const base = Math.max(a, b);
  if (base === 0) return true;
  return Math.abs(a - b) / base <= pct;
}

function widthsSimilar(forehead: number, cheekbones: number, jaw: number, pct = 0.1): boolean {
  return withinPct(forehead, cheekbones, pct) && withinPct(cheekbones, jaw, pct) && withinPct(forehead, jaw, pct);
}

/**
 * Calcula forma + subtipo a partir de 4 medidas (cm) y el contorno de mandíbula.
 * Heurística de estilo (no clínica): prioriza diamante → triangular → corazón → compactos → rectangular → alargados → ovalado.
 */
export function calculateFaceShape(m: FaceMeasurements): FaceShapeResult {
  const invalid = validateMeasurements(m);
  if (invalid) throw new InvalidMeasurementsError(invalid);
  const { forehead, cheekbones, jaw, length, jawContour } = m;
  const maxWidth = Math.max(forehead, cheekbones, jaw);
  const lengthToWidth = length / maxWidth;
  const foreheadToJaw = forehead / jaw;
  const cheekToForehead = cheekbones / forehead;
  const cheekToJaw = cheekbones / jaw;

  const ratios = {
    lengthToWidth: round1(lengthToWidth),
    foreheadToJaw: round1(foreheadToJaw),
    cheekToForehead: round1(cheekToForehead),
    cheekToJaw: round1(cheekToJaw),
  };

  const equalWidths = widthsSimilar(forehead, cheekbones, jaw, 0.1);
  const cheeksWidest = cheekToForehead >= DIAMOND_MIN_CHEEK_TO_FOREHEAD && cheekToJaw >= DIAMOND_MIN_CHEEK_TO_JAW;
  const foreheadWidest = forehead >= cheekbones * 0.98 && forehead > jaw * 1.12;
  // Compacto: largo y ancho cercanos. 1.28 (antes 1.2) cubre redondos/cuadrados
  // reales y los de cámara; por encima de eso suele ser ovalado.
  const compact = lengthToWidth < 1.28;
  const elongated = lengthToWidth >= 1.5;

  let shape: FaceShapeId;
  let subtype: string;
  let confidence: 'alta' | 'media' = 'alta';
  let summary: string;

  // 1) Diamante: pómulos claramente lo más ancho; frente y mandíbula más angostas.
  if (cheeksWidest && foreheadToJaw < 1.12 && foreheadToJaw > 0.88) {
    shape = 'diamante';
    subtype = cheekToForehead >= 1.2 && cheekToJaw >= 1.25 ? 'marcado' : 'sutil';
    summary =
      subtype === 'marcado'
        ? 'Tus pómulos son claramente lo más ancho; frente y mandíbula se estrechan de forma simétrica.'
        : 'Los pómulos destacan un poco sobre frente y mandíbula: un diamante suave.';
  }
  // 2) Triangular: la mandíbula es la parte más ancha (≥8% más que la frente y cercana a los pómulos).
  else if (foreheadToJaw <= 0.92 && jaw >= cheekbones * 0.93) {
    shape = 'triangular';
    subtype = foreheadToJaw <= 0.85 ? 'marcado' : 'suave';
    summary =
      subtype === 'marcado'
        ? 'La mandíbula es claramente más ancha que la frente: forma triangular.'
        : 'Mandíbula algo más ancha que la frente: triangular suave.';
    if (subtype === 'suave') confidence = 'media';
  }
  // 3) Corazón / triángulo invertido: frente ancha y mandíbula/mentón notablemente más angostos.
  else if (foreheadWidest || foreheadToJaw >= 1.15) {
    shape = 'corazon';
    subtype = foreheadToJaw >= 1.25 ? 'marcado' : 'suave';
    summary =
      subtype === 'marcado'
        ? 'La parte alta del rostro es claramente más ancha y la mandíbula se afina hacia el mentón.'
        : 'Frente un poco más ancha que la mandíbula: forma de corazón suave.';
    if (!foreheadWidest && foreheadToJaw < 1.2) confidence = 'media';
  }
  // 4) Compactos (largo ≈ ancho): el contorno de mandíbula decide cuadrado vs redondo.
  // Sin esa pista, un rostro con anchos parejos se confunde fácil entre ambos.
  else if (compact) {
    if (jawContour === 'angular') {
      shape = 'cuadrado';
      subtype = equalWidths ? 'clásico' : 'mandíbula marcada';
      summary =
        subtype === 'clásico'
          ? 'Frente, pómulos y mandíbula tienen anchos parecidos, líneas angulares y el rostro no es alargado.'
          : 'Rostro compacto con mandíbula angular: se acerca a un cuadrado definido.';
    } else {
      shape = 'redondo';
      subtype = equalWidths || Math.abs(lengthToWidth - 1) < 0.08 ? 'clásico' : 'suave';
      summary =
        subtype === 'clásico'
          ? 'Largo y ancho muy similares, con contornos suaves: el clásico rostro redondo.'
          : 'Proporciones compactas y mandíbula suave, sin líneas muy angulares.';
    }
  }
  // 5) Rectangular/alargado: claramente más largo que ancho, anchos parejos y mandíbula angular.
  else if (lengthToWidth >= 1.4 && jawContour === 'angular' && widthsSimilar(forehead, cheekbones, jaw, 0.14)) {
    shape = 'rectangular';
    subtype = elongated ? 'marcado' : 'suave';
    summary = 'Rostro claramente más largo que ancho, con anchos parejos y mandíbula definida: rectangular.';
    if (!elongated) confidence = 'media';
  }
  // 6) Alargado con anchos parejos y contorno suave → ovalado alargado.
  else if (elongated && (equalWidths || widthsSimilar(forehead, cheekbones, jaw, 0.14))) {
    shape = 'ovalado';
    subtype = 'alargado';
    summary =
      'Tu rostro es claramente más largo que ancho, con anchos bastante equilibrados. En estilo se acerca a un ovalado alargado.';
  }
  // 7) Ovalado por defecto (proporciones equilibradas).
  else {
    shape = 'ovalado';
    if (elongated) {
      subtype = 'alargado';
      summary = 'Rostro más largo que ancho con proporciones suaves: ovalado alargado.';
    } else if (lengthToWidth < 1.3) {
      subtype = 'compacto';
      confidence = 'media';
      summary = 'Proporciones cercanas a un ovalado compacto; si dubitas, repite las medidas con calma.';
    } else {
      subtype = 'equilibrado';
      summary =
        'Ninguna zona domina de forma extrema: proporciones equilibradas típicas del rostro ovalado.';
    }
  }

  // Si dos formas compiten (ratios en zona gris), bajamos confianza.
  if (
    (shape === 'redondo' || shape === 'cuadrado') &&
    lengthToWidth >= 1.18 &&
    lengthToWidth < 1.28
  ) {
    confidence = 'media';
  }
  if (shape === 'diamante' && subtype === 'sutil') {
    confidence = 'media';
  }

  return buildFaceShapeResult(shape, { subtype, confidence, ratios, summary });
}

/** @deprecated Usar calculateFaceShape. Se mantiene por compatibilidad de imports. */
export function scoreQuiz(_answerIndexes: number[]): FaceShapeId {
  return 'ovalado';
}

/** @deprecated El test manual ya no usa preguntas de opción múltiple. */
export const quizQuestions: never[] = [];
