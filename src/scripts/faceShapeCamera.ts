import type { FaceShapeId } from '../data/faceShapeQuiz';
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
  minFaceHeight: 150,
  maxFaceHeight: 235,
};

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
};

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
  if (!landmarks || landmarks.length === 0) return { issue: 'NO_FACE' };

  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;
  const toGuide = (p: Landmark) => ({
    x: (1 - (p.x * vw * scale + offsetX) / cw) * GUIDE.width,
    y: ((p.y * vh * scale + offsetY) / ch) * GUIDE.height,
  });

  const nose = toGuide(landmarks[POINTS.noseTip]);
  const faceHeight = toGuide(landmarks[POINTS.chin]).y - toGuide(landmarks[POINTS.foreheadTop]).y;

  if (faceHeight < GUIDE.minFaceHeight) return { issue: 'TOO_FAR', nose };
  if (faceHeight > GUIDE.maxFaceHeight) return { issue: 'TOO_CLOSE', nose };

  const dx = nose.x - GUIDE.noseX;
  const dy = nose.y - GUIDE.noseY;
  if (Math.hypot(dx, dy) > GUIDE.noseTolerance) {
    const direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'izquierda' : 'derecha') : dy > 0 ? 'arriba' : 'abajo';
    return { issue: 'OFF_CENTER', nose, direction };
  }

  return { issue: poseIssue(landmarks, headPose(result)), nose };
}

// Clasificador (regresión logística sobre los 468 landmarks),
// entrenado con ~6000 fotos etiquetadas (forma de rostro: corazón, oblongo,
// ovalado, redondo, cuadrado) — ~69% de acierto en fotos no vistas (carpeta de prueba), ~71%
// uniendo oblongo+cuadrado. No predice "diamante" (el dataset no la incluye);
// esa forma solo se obtiene con la guía de medición. Los pesos ya incluyen la
// estandarización de los datos.
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

type ShapeScores = Partial<Record<FaceShapeId, number>>;

// Probabilidad por forma (suma 1) para un cuadro.
function classifyScores(rawLandmarks: Landmark[], size: ImageSize): ShapeScores {
  const features = landmarkFeatures(rawLandmarks.map((p) => toImageSpace(p, size)));
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

export class FaceShapeCameraError extends Error {
  code: 'NO_FACE' | 'BAD_ANGLE' | 'MODEL_LOAD_FAILED';
  constructor(code: 'NO_FACE' | 'BAD_ANGLE' | 'MODEL_LOAD_FAILED', message: string) {
    super(message);
    this.code = code;
  }
}

const FRAME_COUNT = 8;
const FRAME_INTERVAL_MS = 90;
const MIN_GOOD_FRAMES = 3;

// Toma varios cuadros seguidos (~0.7 s) del video: promediar sus probabilidades
// elimina el ruido de un cuadro malo (parpadeo, micro-movimiento).
export async function captureFrames(video: HTMLVideoElement): Promise<HTMLCanvasElement[]> {
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const frame = document.createElement('canvas');
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext('2d')?.drawImage(video, 0, 0, frame.width, frame.height);
    frames.push(frame);
    if (i < FRAME_COUNT - 1) await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
  }
  return frames;
}

export async function detectFaceShape(frames: HTMLCanvasElement[]): Promise<FaceShapeId> {
  let landmarker;
  try {
    landmarker = await loadFaceLandmarker();
  } catch {
    throw new FaceShapeCameraError('MODEL_LOAD_FAILED', 'No se pudo cargar el analizador facial.');
  }

  const total: ShapeScores = {};
  let good = 0;
  let faces = 0;
  for (const frame of frames) {
    const result = landmarker.detect(frame);
    const landmarks = result?.faceLandmarks?.[0];
    if (!landmarks || landmarks.length === 0) continue;
    faces++;
    if (poseIssue(landmarks, headPose(result))) continue;
    const scores = classifyScores(landmarks, { width: frame.width || 1, height: frame.height || 1 });
    for (const [shape, p] of Object.entries(scores) as [FaceShapeId, number][]) total[shape] = (total[shape] ?? 0) + p;
    good++;
  }

  if (faces === 0) throw new FaceShapeCameraError('NO_FACE', 'No detectamos un rostro en la foto.');
  if (good < MIN_GOOD_FRAMES) throw new FaceShapeCameraError('BAD_ANGLE', 'El rostro no está mirando directo a la cámara.');

  const [shape] = Object.entries(total).sort((a, b) => b[1] - a[1])[0] as [FaceShapeId, number];
  console.debug('[faceShape]', { frames: good, shape, scores: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, +(v / good).toFixed(3)])) });
  return shape;
}
