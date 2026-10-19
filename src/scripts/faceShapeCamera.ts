import type { FaceShapeId } from '../data/faceShapeQuiz';

// Detección de forma de rostro: MediaPipe corre en el navegador (encuadre, pose
// y clasificación de respaldo). La forma final la decide un modelo de visión vía
// el Worker de Cloudflare (/api/face-shape); la foto no se guarda.
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

// Contorno del rostro (óvalo de MediaPipe), en orden.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

// Ancho del contorno a una altura dada (cruce de una línea horizontal con el polígono).
function widthAt(poly: { x: number; y: number }[], y: number): number {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0;
}

/**
 * Clasifica por el perfil de anchos del contorno (frente, mandíbula, mentón)
 * y la relación largo/ancho. Los umbrales se calibraron con landmarks reales
 * de MediaPipe sobre fotos de referencia: los puntos sueltos (sienes, ángulo
 * de mandíbula) casi no cambian entre rostros, pero el perfil del contorno sí.
 * Es una guía orientativa de estilo, no una medición clínica.
 */
function classify(rawLandmarks: Landmark[], size: ImageSize): FaceShapeId {
  const landmarks = rawLandmarks.map((p) => toImageSpace(p, size));
  const oval = FACE_OVAL.map((i) => landmarks[i]);
  const top = landmarks[POINTS.foreheadTop].y;
  const height = landmarks[POINTS.chin].y - top;
  const at = (q: number) => widthAt(oval, top + q * height);

  const maxWidth = Math.max(...[0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map(at), 1e-6);
  const fore = at(0.1) / maxWidth;
  const jaw = at(0.8) / maxWidth;
  const chin = at(0.9) / maxWidth;
  const len = height / maxWidth;

  let shape: FaceShapeId;
  if (len < 1.15) shape = 'redondo';
  else if (jaw >= 0.8) shape = 'cuadrado';
  else if (jaw >= 0.72) shape = len >= 1.22 ? 'cuadrado' : 'ovalado';
  else if (fore >= 0.9) shape = 'diamante';
  else if (len >= 1.22) shape = 'cuadrado';
  else if (chin <= 0.495) shape = 'corazon';
  else shape = 'ovalado';

  console.debug('[faceShape]', { fore, jaw, chin, len, shape });
  return shape;
}

export class FaceShapeCameraError extends Error {
  code: 'NO_FACE' | 'BAD_ANGLE' | 'MODEL_LOAD_FAILED';
  constructor(code: 'NO_FACE' | 'BAD_ANGLE' | 'MODEL_LOAD_FAILED', message: string) {
    super(message);
    this.code = code;
  }
}

export async function detectFaceShape(source: HTMLCanvasElement): Promise<FaceShapeId> {
  let landmarker;
  try {
    landmarker = await loadFaceLandmarker();
  } catch {
    throw new FaceShapeCameraError('MODEL_LOAD_FAILED', 'No se pudo cargar el analizador facial.');
  }

  const result = landmarker.detect(source);
  const landmarks = result?.faceLandmarks?.[0];

  if (!landmarks || landmarks.length === 0) {
    throw new FaceShapeCameraError('NO_FACE', 'No detectamos un rostro en la foto.');
  }

  if (poseIssue(landmarks, headPose(result))) {
    throw new FaceShapeCameraError('BAD_ANGLE', 'El rostro no está mirando directo a la cámara.');
  }

  const size: ImageSize = {
    width: source.width || 1,
    height: source.height || 1,
  };

  const localShape = classify(landmarks, size);
  return (await classifyWithAI(source)) ?? localShape;
}

const AI_ENDPOINT = '/api/face-shape';
const AI_TIMEOUT_MS = 25000;
const AI_MAX_WIDTH = 640;
const FACE_SHAPES: readonly FaceShapeId[] = ['ovalado', 'redondo', 'cuadrado', 'corazon', 'diamante'];

// Pregunta a un modelo de visión (vía el Worker de Cloudflare) la forma del
// rostro. Si no hay conexión, el endpoint no existe (dev) o falla, devuelve
// null y se usa la clasificación local por landmarks.
async function classifyWithAI(source: HTMLCanvasElement): Promise<FaceShapeId | null> {
  try {
    const scale = Math.min(1, AI_MAX_WIDTH / source.width);
    const small = document.createElement('canvas');
    small.width = Math.round(source.width * scale);
    small.height = Math.round(source.height * scale);
    small.getContext('2d')?.drawImage(source, 0, 0, small.width, small.height);

    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: small.toDataURL('image/jpeg', 0.85) }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const { shape } = await res.json();
    return FACE_SHAPES.includes(shape) ? shape : null;
  } catch {
    return null;
  }
}
