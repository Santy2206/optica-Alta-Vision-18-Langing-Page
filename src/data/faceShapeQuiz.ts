import type { FrameShape } from './frameShape';

export type FaceShapeId = 'ovalado' | 'redondo' | 'cuadrado' | 'corazon' | 'diamante';

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
  corazon: {
    label: 'Corazón',
    image: '/images/rostros/corazon.svg',
    description:
      'Frente ancha y mentón angosto. Las monturas más anchas en la parte baja equilibran tu rostro.',
  },
  diamante: {
    label: 'Diamante',
    image: '/images/rostros/diamante.svg',
    description:
      'Pómulos marcados y frente/mentón angostos. Las monturas ovaladas o de ojo de gato resaltan tus pómulos.',
  },
};

// Qué formas de montura recomendar según la forma de rostro.
// Basado en guías de estilo estándar de óptica, no en una medición clínica.
export const frameRecommendations: Record<FaceShapeId, FrameShape[]> = {
  ovalado: ['rectangular', 'cuadrada', 'aviador', 'cat-eye'],
  redondo: ['cuadrada', 'rectangular', 'aviador'],
  cuadrado: ['redonda', 'ovalada', 'aviador'],
  corazon: ['cat-eye', 'redonda', 'aviador'],
  diamante: ['ovalada', 'cat-eye', 'aviador'],
};

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
 * Heurística de estilo (no clínica): prioriza diamante → corazón → compactos → alargados → ovalado.
 */
export function calculateFaceShape(m: FaceMeasurements): FaceShapeResult {
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
  const cheeksWidest = cheekbones >= forehead * 1.06 && cheekbones >= jaw * 1.06;
  const foreheadWidest = forehead >= cheekbones * 0.98 && forehead > jaw * 1.12;
  const compact = lengthToWidth < 1.2;
  const elongated = lengthToWidth >= 1.5;

  let shape: FaceShapeId;
  let subtype: string;
  let confidence: 'alta' | 'media' = 'alta';
  let summary: string;

  // 1) Diamante: pómulos claramente lo más ancho; frente y mandíbula más angostas.
  if (cheeksWidest && foreheadToJaw < 1.12 && foreheadToJaw > 0.88) {
    shape = 'diamante';
    subtype = cheekToForehead >= 1.15 && cheekToJaw >= 1.15 ? 'marcado' : 'sutil';
    summary =
      subtype === 'marcado'
        ? 'Tus pómulos son claramente lo más ancho; frente y mandíbula se estrechan de forma simétrica.'
        : 'Los pómulos destacan un poco sobre frente y mandíbula: un diamante suave.';
  }
  // 2) Corazón: frente ancha y mandíbula/mentón notablemente más angostos.
  else if (foreheadWidest || foreheadToJaw >= 1.15) {
    shape = 'corazon';
    subtype = foreheadToJaw >= 1.25 ? 'marcado' : 'suave';
    summary =
      subtype === 'marcado'
        ? 'La parte alta del rostro es claramente más ancha y la mandíbula se afina hacia el mentón.'
        : 'Frente un poco más ancha que la mandíbula: forma de corazón suave.';
    if (!foreheadWidest && foreheadToJaw < 1.2) confidence = 'media';
  }
  // 3) Compactos (largo ≈ ancho): el contorno de mandíbula decide cuadrado vs redondo.
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
  // 4) Alargado con anchos parejos → ovalado alargado (equivalente estilístico a oblongo).
  else if (elongated && (equalWidths || widthsSimilar(forehead, cheekbones, jaw, 0.14))) {
    shape = 'ovalado';
    subtype = 'alargado';
    summary =
      'Tu rostro es claramente más largo que ancho, con anchos bastante equilibrados. En estilo se acerca a un ovalado alargado.';
  }
  // 5) Ovalado por defecto (proporciones equilibradas).
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
    lengthToWidth >= 1.15 &&
    lengthToWidth < 1.25
  ) {
    confidence = 'media';
  }
  if (shape === 'diamante' && (cheekToForehead < 1.1 || cheekToJaw < 1.1)) {
    confidence = 'media';
  }

  const displayLabel = `${faceShapeInfo[shape].label} · ${subtype}`;

  return { shape, subtype, displayLabel, confidence, ratios, summary };
}

/** @deprecated Usar calculateFaceShape. Se mantiene por compatibilidad de imports. */
export function scoreQuiz(_answerIndexes: number[]): FaceShapeId {
  return 'ovalado';
}

/** @deprecated El test manual ya no usa preguntas de opción múltiple. */
export const quizQuestions: never[] = [];
