import type { FaceShapeId } from '../data/faceShapeQuiz';

// Detección de forma de rostro 100% en el navegador: la foto nunca se sube a
// ningún servidor, solo se usa para calcular unas proporciones y se descarta.
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
const POINTS = {
  noseTip: 1,
  foreheadTop: 10,
  chin: 152,
  cheekRight: 234,
  cheekLeft: 454,
  templeRight: 127,
  templeLeft: 356,
  jawRight: 58,
  jawLeft: 288,
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

// Distancia 3D (no solo x/y): la profundidad (z) que da MediaPipe compensa
// buena parte del escorzo que introduce girar o inclinar la cabeza, así que
// las medidas cambian menos según el ángulo de la foto.
function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Si la cabeza está girada hacia un lado, la nariz queda mucho más cerca de
// una mejilla/mandíbula que de la otra. Cuando eso pasa, las medidas de
// ancho no son confiables y es mejor pedir otra foto en vez de adivinar.
function isFacingCamera(landmarks: Landmark[]): boolean {
  const nose = landmarks[POINTS.noseTip];

  const cheekRatio =
    distance(nose, landmarks[POINTS.cheekRight]) / distance(nose, landmarks[POINTS.cheekLeft]);
  const jawRatio = distance(nose, landmarks[POINTS.jawRight]) / distance(nose, landmarks[POINTS.jawLeft]);

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

function classify(landmarks: Landmark[]): FaceShapeId {
  const faceLength = distance(landmarks[POINTS.foreheadTop], landmarks[POINTS.chin]);
  const cheekWidth = distance(landmarks[POINTS.cheekRight], landmarks[POINTS.cheekLeft]);
  const foreheadWidth = distance(landmarks[POINTS.templeRight], landmarks[POINTS.templeLeft]);
  const jawWidth = distance(landmarks[POINTS.jawRight], landmarks[POINTS.jawLeft]);

  const ratioLengthWidth = faceLength / cheekWidth;

  if (foreheadWidth > cheekWidth * 1.02 && jawWidth < foreheadWidth * 0.85) {
    return 'corazon';
  }

  if (cheekWidth > foreheadWidth * 1.08 && cheekWidth > jawWidth * 1.08) {
    return 'diamante';
  }

  if (ratioLengthWidth >= 1.35) {
    return 'ovalado';
  }

  if (jawWidth >= cheekWidth * 0.92 && ratioLengthWidth < 1.15) {
    return 'cuadrado';
  }

  if (ratioLengthWidth < 1.2) {
    return 'redondo';
  }

  return 'ovalado';
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

  return classify(landmarks);
}
