import {
  buildFaceShapeResult,
  DIAMOND_MIN_CHEEK_TO_FOREHEAD,
  DIAMOND_MIN_CHEEK_TO_JAW,
  type FaceShapeId,
  type FaceShapeResult,
} from '../data/faceShapeQuiz';
import faceShapeModel from '../data/faceShapeModel.json';

// Detección de forma de rostro 100% en el navegador: la foto nunca se sube a
// ningún servidor, solo se usa para calcular la forma y se descarta.
//
// Usa MediaPipe Face Landmarker (@mediapipe/tasks-vision), cargado bajo demanda
// desde CDN solo cuando el usuario elige "usar la cámara" en el test.
const VISION_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Índices del mesh canónico de 468 puntos de MediaPipe usados para estimar
// proporciones del rostro. Son puntos de referencia estándar, no una medición
// clínica — el resultado es una guía orientativa de estilo.
//
// Para frente/mandíbula usamos varios puntos del contorno (no solo un par):
// un solo índice suele quedar muy adentro y aplana las diferencias de forma.
const POINTS = {
  noseTip: 1,
  foreheadTop: 10,
  chin: 152,
  // Pómulos / mejillas (lado derecho e izquierdo del ovalo).
  cheekRight: 234,
  cheekLeft: 454,
  // Sienes / frente lateral (más altos que 127/356, que caen cerca del ojo).
  templeRight: [54, 21, 162, 127] as const,
  templeLeft: [284, 251, 389, 356] as const,
  // Ángulo de mandíbula (gonion aproximado + vecinos del contorno).
  jawRight: [172, 136, 150, 58] as const,
  jawLeft: [397, 365, 379, 288] as const,
  // Mentón lateral: ayuda a estimar si la mandíbula es angular o suave.
  chinRight: 176,
  chinLeft: 400,
};

// Si la nariz queda mucho más cerca de un lado del rostro que del otro, la
// persona está girada respecto a la cámara y las medidas no son confiables
// (un giro hace que un lado se vea más angosto por perspectiva).
const MAX_ASYMMETRY_RATIO = 1.25;

// Límites de pose de la cabeza (grados). Inclinar la barbilla arriba/abajo
// acorta el largo aparente del rostro y altera la proporción largo/ancho.
const MAX_YAW_DEG = 10;
const MAX_PITCH_DEG = 12;
const MAX_ROLL_DEG = 7;

// Guía visual del paso de cámara, en unidades del viewBox del SVG (400x300,
// igual a la proporción 4:3 del contenedor). Mantener alineado con el SVG de
// FaceShapeTest.astro.
export const GUIDE = {
  width: 400,
  height: 300,
  noseX: 200,
  noseY: 174,
  noseTolerance: 22,
  // El ancho del rostro debe ocupar entre el 45% y el 55% del ancho de la guía (el óvalo
  // dibujado mide 208/400 = 52%). Se estima con la distancia entre los ojos, que no
  // depende del cabello ni de la barbilla.
  minFaceWidthRatio: 0.45,
  maxFaceWidthRatio: 0.55,
};

// Ancho de pómulos / distancia entre esquinas externas de los ojos (landmarks 33-263):
// mediana 1.555 (rango p5-p95: 1.47-1.65) en ~5000 rostros.
const CHEEK_WIDTH_PER_INTER_EYE = 1.555;

// Control de movimiento: se captura solo con la cabeza quieta. El desplazamiento se mide
// en píxeles de un video de referencia de 640 px de ancho, para que el umbral no dependa
// de la resolución de la cámara.
export const AUTO_CAPTURE_STILL_MS = 1000;
const MAX_FRAME_SHIFT_PX = 3;
const MAX_WINDOW_DRIFT_PX = 6;
const MOTION_REFERENCE_WIDTH = 640;
const MOTION_POINTS = [1, 10, 152, 234, 454, 33, 263, 61, 291, 172, 397, 54, 284] as const;

type Landmark = { x: number; y: number; z: number };

let faceLandmarkerPromise: Promise<any> | null = null;

async function loadFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(/* @vite-ignore */ VISION_BUNDLE_URL);
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
      return FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    })();
  }
  return faceLandmarkerPromise;
}

// Se llama al abrir el paso de cámara para que el modelo ya esté listo cuando
// el usuario tome la foto (evita una espera larga justo después de capturar).
export function preloadFaceLandmarker() {
  loadFaceLandmarker().catch(() => {
    // Si falla, se reintenta (y se maneja el error) en detectFaceShape().
    faceLandmarkerPromise = null;
  });
}

// MediaPipe devuelve x/y normalizados 0–1 por el ancho y el alto de la imagen
// por separado. Sin multiplicar por el aspect ratio, el largo del rostro se
// infla en fotos verticales (casi todas las selfies) y casi todo sale "ovalado".
type ImageSize = { width: number; height: number };

function toImageSpace(p: Landmark, size: ImageSize): Landmark {
  // MediaPipe: x,y ∈ [0,1] por eje; z usa aproximadamente la misma escala que x
  // (unidad ≈ ancho de imagen). Hay que reescalar o el largo se infla en vertical.
  return {
    x: p.x * size.width,
    y: p.y * size.height,
    z: p.z * size.width,
  };
}

// Distancia 3D en espacio de imagen: la profundidad (z) compensa parte del
// escorzo al girar o inclinar la cabeza.
function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function avgLandmark(landmarks: Landmark[], indices: readonly number[]): Landmark {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of indices) {
    const p = landmarks[i];
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = indices.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

function widthBetween(
  landmarks: Landmark[],
  left: readonly number[] | number,
  right: readonly number[] | number,
): number {
  const l = typeof left === 'number' ? landmarks[left] : avgLandmark(landmarks, left);
  const r = typeof right === 'number' ? landmarks[right] : avgLandmark(landmarks, right);
  return distance(l, r);
}

// Si la cabeza está girada hacia un lado, la nariz queda mucho más cerca de
// una mejilla/mandíbula que de la otra. Cuando eso pasa, las medidas de
// ancho no son confiables y es mejor pedir otra foto en vez de adivinar.
function isFacingCamera(landmarks: Landmark[]): boolean {
  const nose = landmarks[POINTS.noseTip];
  const jawR = avgLandmark(landmarks, POINTS.jawRight);
  const jawL = avgLandmark(landmarks, POINTS.jawLeft);

  const cheekRatio =
    distance(nose, landmarks[POINTS.cheekRight]) / distance(nose, landmarks[POINTS.cheekLeft]);
  const jawRatio = distance(nose, jawR) / distance(nose, jawL);

  const worseRatio = Math.max(cheekRatio, 1 / cheekRatio, jawRatio, 1 / jawRatio);
  return worseRatio <= MAX_ASYMMETRY_RATIO;
}

type HeadPose = { yaw: number; pitch: number; roll: number };

// Ángulos de la cabeza a partir de la matriz de transformación facial de
// MediaPipe (4x4, column-major). Un rostro de frente ≈ rotación identidad.
function headPose(result: any): HeadPose | null {
  const m: number[] | undefined = result?.facialTransformationMatrixes?.[0]?.data;
  if (!m || m.length < 16) return null;
  const r = (row: number, col: number) => m[col * 4 + row];
  const toDeg = 180 / Math.PI;
  let pitch = Math.atan2(r(2, 1), r(2, 2)) * toDeg;
  if (Math.abs(pitch) > 90) pitch -= Math.sign(pitch) * 180;
  return {
    yaw: Math.asin(Math.max(-1, Math.min(1, -r(2, 0)))) * toDeg,
    pitch,
    roll: Math.atan2(r(1, 0), r(0, 0)) * toDeg,
  };
}

function poseIssue(landmarks: Landmark[], pose: HeadPose | null): 'TURNED' | 'TILTED' | 'PITCHED' | null {
  if (!isFacingCamera(landmarks) || (pose && Math.abs(pose.yaw) > MAX_YAW_DEG)) return 'TURNED';
  if (pose && Math.abs(pose.roll) > MAX_ROLL_DEG) return 'TILTED';
  if (pose && Math.abs(pose.pitch) > MAX_PITCH_DEG) return 'PITCHED';
  return null;
}

export type AlignmentIssue = 'NO_FACE' | 'TOO_FAR' | 'TOO_CLOSE' | 'OFF_CENTER' | 'TURNED' | 'TILTED' | 'PITCHED';

export type AlignmentResult = {
  issue: AlignmentIssue | null;
  // Posición de la punta de la nariz en coordenadas del viewBox de la guía.
  nose?: { x: number; y: number };
  direction?: 'izquierda' | 'derecha' | 'arriba' | 'abajo';
  /** Milisegundos seguidos sin movimiento dentro de la zona de alineación (0 si hay movimiento). */
  stillMs?: number;
  /** Desplazamiento medio de los landmarks respecto al cuadro anterior (px de referencia). */
  shiftPx?: number;
};

type MotionSample = { time: number; points: { x: number; y: number }[] };
let motionPrev: MotionSample | null = null;
let motionWindowStart: MotionSample | null = null;
let motionStillShifts = 0;

export function resetMotionGate() {
  motionPrev = null;
  motionWindowStart = null;
  motionStillShifts = 0;
}

const meanShift = (a: MotionSample, b: MotionSample) =>
  a.points.reduce((sum, p, i) => sum + Math.hypot(p.x - b.points[i].x, p.y - b.points[i].y), 0) / a.points.length;

// Velocidad de los landmarks entre cuadros consecutivos. Hacen falta 3 cuadros seguidos
// (2 desplazamientos) por debajo de 3 px para empezar a contar la quietud; cualquier
// salto mayor, o una deriva lenta acumulada, reinicia el conteo.
function updateMotionGate(landmarks: Landmark[], vw: number, vh: number): { shiftPx: number; stillMs: number } {
  const k = MOTION_REFERENCE_WIDTH / vw;
  const sample: MotionSample = {
    time: performance.now(),
    points: MOTION_POINTS.map((i) => ({ x: landmarks[i].x * vw * k, y: landmarks[i].y * vh * k })),
  };
  const prev = motionPrev;
  motionPrev = sample;
  if (!prev) return { shiftPx: Infinity, stillMs: 0 };

  const shiftPx = meanShift(prev, sample);
  if (shiftPx > MAX_FRAME_SHIFT_PX) {
    motionStillShifts = 0;
    motionWindowStart = null;
    return { shiftPx, stillMs: 0 };
  }

  motionStillShifts++;
  motionWindowStart ??= prev;
  if (meanShift(motionWindowStart, sample) > MAX_WINDOW_DRIFT_PX) {
    motionStillShifts = 1;
    motionWindowStart = prev;
  }
  return { shiftPx, stillMs: motionStillShifts >= 2 ? sample.time - motionWindowStart.time : 0 };
}

// Revisión en vivo del encuadre: compara la cara detectada con la guía
// visual (círculo de la nariz + tamaño del óvalo) y con la pose de la cabeza.
// El video se muestra espejado y con object-cover, así que las coordenadas se
// convierten a lo que el usuario ve en pantalla.
export async function checkAlignment(video: HTMLVideoElement): Promise<AlignmentResult> {
  const landmarker = await loadFaceLandmarker();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch) return { issue: 'NO_FACE' };

  const result = landmarker.detect(video);
  const landmarks: Landmark[] | undefined = result?.faceLandmarks?.[0];
  if (!landmarks || landmarks.length === 0) return resetAndReturn({ issue: 'NO_FACE' });

  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;
  const toGuide = (p: Landmark) => ({
    x: (1 - (p.x * vw * scale + offsetX) / cw) * GUIDE.width,
    y: ((p.y * vh * scale + offsetY) / ch) * GUIDE.height,
  });

  const nose = toGuide(landmarks[POINTS.noseTip]);
  const eyeR = toGuide(landmarks[33]);
  const eyeL = toGuide(landmarks[263]);
  const faceWidthRatio = (Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y) * CHEEK_WIDTH_PER_INTER_EYE) / GUIDE.width;

  if (faceWidthRatio < GUIDE.minFaceWidthRatio) return resetAndReturn({ issue: 'TOO_FAR', nose });
  if (faceWidthRatio > GUIDE.maxFaceWidthRatio) return resetAndReturn({ issue: 'TOO_CLOSE', nose });

  const dx = nose.x - GUIDE.noseX;
  const dy = nose.y - GUIDE.noseY;
  if (Math.hypot(dx, dy) > GUIDE.noseTolerance) {
    const direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'izquierda' : 'derecha') : dy > 0 ? 'arriba' : 'abajo';
    return resetAndReturn({ issue: 'OFF_CENTER', nose, direction });
  }

  const issue = poseIssue(landmarks, headPose(result));
  if (issue) return resetAndReturn({ issue, nose });
  return { issue: null, nose, ...updateMotionGate(landmarks, vw, vh) };
}

function resetAndReturn(result: AlignmentResult): AlignmentResult {
  resetMotionGate();
  return result;
}

// Modelo (regresión logística sobre los landmarks ya normalizados), entrenado con
// ~6000 fotos etiquetadas (corazón, oblongo, ovalado, redondo, cuadrado): ~69% de
// acierto en fotos no vistas. Un modelo que recibe SOLO razones geométricas rinde
// mucho menos (~45-49%), por eso las razones (extractFaceRatios) se usan para mostrar
// medidas, decidir "diamante" y estimar la confianza, no como entrada del modelo. El
// dataset no incluye "diamante": esa forma sale de la regla híbrida de abajo. Los
// pesos ya incluyen la estandarización de los datos.
const MODEL_TO_SHAPE: Record<string, FaceShapeId> = {
  heart: 'corazon',
  oblong: 'cuadrado',
  oval: 'ovalado',
  round: 'redondo',
  square: 'cuadrado',
};

// Landmarks → vector: se rota para alinear los ojos, se centra en la punta de
// la nariz y se escala por el ancho de pómulos (invariante a tamaño y roll).
function landmarkFeatures(landmarks: Landmark[]): number[] {
  const eyeR = landmarks[33];
  const eyeL = landmarks[263];
  const angle = Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const nose = landmarks[POINTS.noseTip];
  const rotated = landmarks.map((p) => {
    const x = p.x - nose.x;
    const y = p.y - nose.y;
    return [x * cos - y * sin, x * sin + y * cos];
  });
  const scale = Math.hypot(rotated[454][0] - rotated[234][0], rotated[454][1] - rotated[234][1]) || 1;
  return rotated.flatMap(([x, y]) => [x / scale, y / scale]);
}

export type FaceRatios = {
  /** Alto total del rostro (punto 10 → mentón) / ancho de pómulos. */
  lengthToWidthRatio: number;
  /** Ancho de frente (sienes) / ancho de pómulos. */
  foreheadToCheekboneRatio: number;
  /** Ancho de mandíbula (ángulos del maxilar) / ancho de pómulos. */
  jawToCheekboneRatio: number;
  /** Ángulo (grados) del maxilar en el gonion, entre la rama y la línea al mentón. 180° = recto. */
  jawAngle: number;
};

const dist2d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

function angleAt(vertex: Landmark, a: Landmark, b: Landmark): number {
  const ux = a.x - vertex.x;
  const uy = a.y - vertex.y;
  const wx = b.x - vertex.x;
  const wy = b.y - vertex.y;
  const cos = (ux * wx + uy * wy) / (Math.hypot(ux, uy) * Math.hypot(wx, wy) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Razones geométricas invariantes a escala, a partir de landmarks en espacio de imagen (px). */
export function extractFaceRatios(landmarks: Landmark[]): FaceRatios {
  const d = (a: number, b: number) => dist2d(landmarks[a], landmarks[b]);
  const cheek = d(POINTS.cheekRight, POINTS.cheekLeft) || 1;
  return {
    lengthToWidthRatio: d(POINTS.foreheadTop, POINTS.chin) / cheek,
    foreheadToCheekboneRatio: (d(54, 284) + d(21, 251)) / 2 / cheek,
    jawToCheekboneRatio: (d(58, 288) + d(172, 397)) / 2 / cheek,
    jawAngle:
      (angleAt(landmarks[172], landmarks[58], landmarks[152]) + angleAt(landmarks[397], landmarks[288], landmarks[152])) /
      2,
  };
}

type ShapeScores = Partial<Record<FaceShapeId, number>>;

// Probabilidad por forma (suma 1).
function classifyScores(landmarks: Landmark[]): ShapeScores {
  const features = landmarkFeatures(landmarks);
  const scores: ShapeScores = {};
  const logits = faceShapeModel.weights.map((w, k) => w.reduce((s, v, i) => s + v * features[i], faceShapeModel.bias[k]));
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  faceShapeModel.classes.forEach((c, k) => {
    const shape = MODEL_TO_SHAPE[c];
    scores[shape] = (scores[shape] ?? 0) + exps[k] / total;
  });
  return scores;
}

// Si el modelo dice ovalado/corazón con confianza moderada o alta pero los pómulos son
// claramente lo más ancho (umbrales calibrados en faceShapeQuiz.ts), es diamante.
const OVERRIDE_MIN_CONFIDENCE = 0.4;

function shouldOverrideToDiamond(shape: FaceShapeId, confidence: number, ratios: FaceRatios): boolean {
  if (shape !== 'ovalado' && shape !== 'corazon') return false;
  if (confidence < OVERRIDE_MIN_CONFIDENCE) return false;
  return (
    1 / ratios.foreheadToCheekboneRatio >= DIAMOND_MIN_CHEEK_TO_FOREHEAD &&
    1 / ratios.jawToCheekboneRatio >= DIAMOND_MIN_CHEEK_TO_JAW
  );
}

export class FaceShapeCameraError extends Error {
  code: 'NO_FACE' | 'BAD_ANGLE' | 'MODEL_LOAD_FAILED';
  constructor(code: 'NO_FACE' | 'BAD_ANGLE' | 'MODEL_LOAD_FAILED', message: string) {
    super(message);
    this.code = code;
  }
}

export type CapturedFrame = {
  /** Landmarks normalizados de MediaPipe. */
  landmarks: Landmark[];
  size: ImageSize;
  /** 1 = nariz exactamente a la misma distancia de ambos ojos. */
  symmetry: number;
  poseOk: boolean;
  /** Copia reducida del cuadro (para dibujar las medidas sobre la foto del resultado). */
  image: HTMLCanvasElement;
};

// Simetría horizontal con las distancias nariz → ojos (esquina externa e interna): si la
// cabeza gira, la nariz se acerca a un ojo y se aleja del otro.
function symmetryScore(landmarks: Landmark[], size: ImageSize): number {
  const pts = landmarks.map((p) => toImageSpace(p, size));
  const nose = pts[POINTS.noseTip];
  const right = (dist2d(nose, pts[33]) + dist2d(nose, pts[133])) / 2;
  const left = (dist2d(nose, pts[263]) + dist2d(nose, pts[362])) / 2;
  return 1 - Math.abs(right - left) / ((right + left) / 2 || 1);
}

const FRAME_COUNT = 8;
const SNAPSHOT_WIDTH = 640;
const FRAME_INTERVAL_MS = 90;

// Toma varios cuadros seguidos (~0.7 s) y mide la simetría de cada uno. Devuelve los
// cuadros con rostro ordenados de más a menos simétrico: se usa el mejor, en lugar de
// promediar a ciegas cuadros con la cabeza ligeramente girada.
export async function captureFrames(video: HTMLVideoElement): Promise<CapturedFrame[]> {
  let landmarker;
  try {
    landmarker = await loadFaceLandmarker();
  } catch {
    throw new FaceShapeCameraError('MODEL_LOAD_FAILED', 'No se pudo cargar el analizador facial.');
  }

  const frames: CapturedFrame[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  const size: ImageSize = { width: canvas.width || 1, height: canvas.height || 1 };

  for (let i = 0; i < FRAME_COUNT; i++) {
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const result = landmarker.detect(canvas);
    const landmarks: Landmark[] | undefined = result?.faceLandmarks?.[0];
    if (landmarks && landmarks.length > 0) {
      const image = document.createElement('canvas');
      image.width = Math.min(SNAPSHOT_WIDTH, size.width);
      image.height = Math.round((image.width * size.height) / size.width);
      image.getContext('2d')?.drawImage(canvas, 0, 0, image.width, image.height);
      frames.push({
        landmarks,
        size,
        symmetry: symmetryScore(landmarks, size),
        poseOk: !poseIssue(landmarks, headPose(result)),
        image,
      });
    }
    if (i < FRAME_COUNT - 1) await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
  }
  return frames.sort((a, b) => b.symmetry - a.symmetry);
}

const SUMMARY = {
  camera: 'Calculado con tu foto a partir de las proporciones de tu rostro (frente, pómulos, mandíbula y largo).',
  diamond: 'Tus pómulos son claramente lo más ancho de tu rostro, con frente y mandíbula más angostas.',
};

export type FaceOverlay = {
  image: HTMLCanvasElement;
  /** Landmarks normalizados del cuadro mostrado. */
  landmarks: Landmark[];
  ratios: FaceRatios;
  /** Texto en lenguaje natural que explica las razones calculadas. */
  explanation: string;
};

export type CameraFaceShapeResult = FaceShapeResult & { overlay: FaceOverlay };

// Líneas de medida y su color. Frente y mandíbula son el promedio de 2 pares de puntos
// (igual que extractFaceRatios), por eso se dibujan los dos.
export const MEASUREMENT_LINES = [
  { id: 'length', label: 'Largo', color: '#38bdf8', pairs: [[10, 152]] },
  { id: 'forehead', label: 'Frente', color: '#fbbf24', pairs: [[54, 284], [21, 251]] },
  { id: 'cheek', label: 'Pómulos', color: '#ff1493', pairs: [[234, 454]] },
  { id: 'jaw', label: 'Mandíbula', color: '#00b4b0', pairs: [[58, 288], [172, 397]] },
] as const;

/** Dibuja la foto capturada y las 4 medidas sobre ella. */
export function drawMeasurementOverlay(target: HTMLCanvasElement, overlay: FaceOverlay) {
  const { image, landmarks } = overlay;
  target.width = image.width;
  target.height = image.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  const lineWidth = Math.max(2, image.width / 160);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  for (const { color, pairs } of MEASUREMENT_LINES) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    for (const [a, b] of pairs) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      ctx.beginPath();
      ctx.moveTo(pa.x * image.width, pa.y * image.height);
      ctx.lineTo(pb.x * image.width, pb.y * image.height);
      ctx.stroke();
      for (const p of [pa, pb]) {
        ctx.beginPath();
        ctx.arc(p.x * image.width, p.y * image.height, lineWidth * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// Palabras para describir cada razón; los cortes son los terciles de ~6000 rostros, así
// que "corto/medio/alargado" es relativo a un rostro típico.
function describeRatios(ratios: FaceRatios, shapeLabel: string): string {
  const { lengthToWidthRatio: len, foreheadToCheekboneRatio: fore, jawToCheekboneRatio: jaw, jawAngle } = ratios;
  const lengthWord = len < 1.164 ? 'un rostro más bien corto' : len <= 1.198 ? 'una proporción media' : 'un rostro más alargado';
  const fj = fore / jaw;
  const foreJawWord =
    fj > 1.08
      ? 'la frente es claramente más ancha que la mandíbula'
      : fj >= 1.03
        ? 'la frente es un poco más ancha que la mandíbula'
        : 'frente y mandíbula tienen casi el mismo ancho';
  const angleWord = jawAngle < 146 ? 'marcada' : jawAngle <= 150 ? 'intermedia' : 'suave';
  const pct = (n: number) => Math.round(n * 100);
  return (
    `Largo del rostro (línea azul): ${len.toFixed(2)} veces el ancho de tus pómulos, ${lengthWord}. ` +
    `Frente (amarillo): ${pct(fore)}% del ancho de tus pómulos (rosa). Mandíbula (turquesa): ${pct(jaw)}%; ${foreJawWord}. ` +
    `Ángulo de la mandíbula: ${Math.round(jawAngle)}°, una línea ${angleWord}. ` +
    `Con estas proporciones, tu forma más cercana es ${shapeLabel.toLowerCase()}.`
  );
}

export function detectFaceShape(frames: CapturedFrame[]): CameraFaceShapeResult {
  if (frames.length === 0) throw new FaceShapeCameraError('NO_FACE', 'No detectamos un rostro en la foto.');
  const best = frames.find((f) => f.poseOk);
  if (!best) throw new FaceShapeCameraError('BAD_ANGLE', 'El rostro no está mirando directo a la cámara.');

  const pixels = best.landmarks.map((p) => toImageSpace(p, best.size));
  const ratios = extractFaceRatios(pixels);
  const scores = classifyScores(pixels);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [FaceShapeId, number][];
  const [top, topP] = ranked[0];
  const secondP = ranked[1]?.[1] ?? 0;

  const diamond = shouldOverrideToDiamond(top, topP, ratios);
  const shape: FaceShapeId = diamond ? 'diamante' : top;
  const confidence = !diamond && topP >= 0.5 && topP - secondP >= 0.15 ? 'alta' : 'media';
  console.debug('[faceShape]', { shape, diamond, symmetry: +best.symmetry.toFixed(3), scores, ratios });

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const base = buildFaceShapeResult(shape, {
    subtype: '',
    confidence,
    summary: diamond ? SUMMARY.diamond : SUMMARY.camera,
    ratios: {
      lengthToWidth: round1(ratios.lengthToWidthRatio),
      foreheadToJaw: round1(ratios.foreheadToCheekboneRatio / ratios.jawToCheekboneRatio),
      cheekToForehead: round1(1 / ratios.foreheadToCheekboneRatio),
      cheekToJaw: round1(1 / ratios.jawToCheekboneRatio),
    },
  });
  return {
    ...base,
    overlay: {
      image: best.image,
      landmarks: best.landmarks,
      ratios,
      explanation: describeRatios(ratios, base.displayLabel),
    },
  };
}
