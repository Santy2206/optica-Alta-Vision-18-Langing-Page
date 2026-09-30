// Overlay 2D de "probar con cámara": dibuja la foto real de la montura (con
// fondo ya recortado por scripts/generate-cutouts.mjs) sobre el video en vivo,
// posicionada según los ojos detectados por MediaPipe Face Landmarker. No es
// un modelo 3D — es un "sticker" que sigue la cara, suficiente para dar una
// idea del tamaño/color de la montura sin necesitar escanear cada producto.
//
// Mismo modelo y CDN que src/scripts/faceShapeCamera.ts, pero en modo 'VIDEO'
// (tracking continuo) en vez de 'IMAGE' (una detección puntual) — por eso es
// una instancia de FaceLandmarker separada, los modos no se pueden mezclar.
const VISION_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Índices del mesh canónico de 468 puntos de MediaPipe: esquina externa de
// cada ojo (ancho/ángulo de la montura) y puente entre cejas (ancla vertical).
const POINTS = {
  eyeOuterA: 33,
  eyeOuterB: 263,
  bridge: 168,
};

// La montura visible en una foto de producto suele ser más ancha que la
// distancia entre las esquinas externas de los ojos (incluye bisagras/varillas
// que se abren más que el ancho de la cara). Son constantes de partida — hay
// que ajustarlas a ojo en cuanto haya fotos reales del negocio en cámara.
const FRAME_WIDTH_RATIO = 1.55;
// Fracción de la altura de la imagen que queda por ENCIMA del punto de anclaje
// (el puente), para que el borde superior del marco quede a la altura de los ojos.
const FRAME_VERTICAL_OFFSET = 0.42;

// Si el ancho entre ojos en 2D (x,y) es mucho menor que en 3D (x,y,z), la cabeza
// está girada de lado: la distancia real entre los ojos no cambió, pero su
// proyección en la pantalla sí (escorzo). Por debajo de este umbral, la foto
// plana de la montura ya no se puede dibujar de forma creíble (no hay cómo
// mostrar la montura "de lado" con una sola foto de frente), así que se oculta
// en vez de mostrarla achicada y mal ubicada.
const MIN_FRONTAL_RATIO = 0.62;

type Landmark = { x: number; y: number; z: number };

let landmarkerPromise: Promise<any> | null = null;

async function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(/* @vite-ignore */ VISION_BUNDLE_URL);
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
      return FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    })();
  }
  return landmarkerPromise;
}

// Se llama al abrir el modal para que el modelo esté listo (o cargando) antes
// de que termine el getUserMedia, y así el primer frame ya tenga overlay.
export function preloadTryOnLandmarker() {
  loadLandmarker().catch(() => {
    landmarkerPromise = null;
  });
}

export type TryOnOverlayController = { stop: () => void };

// El video se muestra espejado (-scale-x-100) con object-cover; esta función
// replica la transformación de checkAlignment() en faceShapeCamera.ts para
// llevar un landmark normalizado (0..1, sin espejar) a píxeles de canvas.
// Devuelve también `scale` (video → canvas) para poder convertir distancias
// calculadas en espacio del video (no solo puntos) a píxeles de canvas.
function makeToCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;
  const toCanvas = (p: Landmark) => ({
    x: (1 - (p.x * vw * scale + offsetX) / cw) * cw,
    y: ((p.y * vh * scale + offsetY) / ch) * ch,
  });
  return { toCanvas, scale, vw, vh };
}

function resizeCanvasToContainer(canvas: HTMLCanvasElement) {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

export function startTryOnOverlay(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  glassesImg: HTMLImageElement,
): TryOnOverlayController {
  const ctx = canvas.getContext('2d');
  let rafId = 0;
  let stopped = false;

  resizeCanvasToContainer(canvas);
  const onResize = () => resizeCanvasToContainer(canvas);
  window.addEventListener('resize', onResize);

  loadLandmarker()
    .then((landmarker) => {
      const loop = () => {
        if (stopped) return;
        rafId = requestAnimationFrame(loop);
        if (!ctx || !video.videoWidth || !video.videoHeight) return;

        const result = landmarker.detectForVideo(video, performance.now());
        const landmarks: Landmark[] | undefined = result?.faceLandmarks?.[0];
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!landmarks || glassesImg.naturalWidth === 0) return;

        const rawA = landmarks[POINTS.eyeOuterA];
        const rawB = landmarks[POINTS.eyeOuterB];

        // Ancho entre ojos en espacio del video, con y sin profundidad (z). z comparte
        // escala aproximada con x (documentación de MediaPipe), por eso se multiplica
        // por el mismo ancho de video. Girar la cabeza reduce el ancho en 2D (escorzo)
        // pero no en 3D — comparar ambos permite detectar el giro y corregir el tamaño.
        const { toCanvas, scale, vw } = makeToCanvas(video, canvas);
        const dxRaw = (rawB.x - rawA.x) * vw;
        const dyRaw = (rawB.y - rawA.y) * video.videoHeight;
        const dzRaw = (rawB.z - rawA.z) * vw;
        const span2D = Math.hypot(dxRaw, dyRaw);
        const span3D = Math.hypot(dxRaw, dyRaw, dzRaw);
        if (span3D === 0 || span2D / span3D < MIN_FRONTAL_RATIO) return; // girado de lado: no se puede dibujar de forma creíble

        const a = toCanvas(rawA);
        const b = toCanvas(rawB);
        const bridge = toCanvas(landmarks[POINTS.bridge]);

        const eyeSpanPx = span3D * scale;
        // El flip de X (mirror) puede hacer que "a" quede a la derecha de "b" en vez de
        // a la izquierda; sin normalizar, atan2 da un ángulo cercano a 180° en vez de a
        // 0° y la imagen se dibuja de cabeza. Se fuerza a que el vector siempre apunte
        // "hacia la derecha" (dx >= 0) — el ángulo de una imagen simétrica como unas
        // gafas solo importa módulo 180°, así que esto no cambia la inclinación real.
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (dx < 0) {
          dx = -dx;
          dy = -dy;
        }
        const angle = Math.atan2(dy, dx);
        const frameWidthPx = eyeSpanPx * FRAME_WIDTH_RATIO;
        const frameHeightPx = frameWidthPx * (glassesImg.naturalHeight / glassesImg.naturalWidth);

        ctx.save();
        ctx.translate(bridge.x, bridge.y);
        ctx.rotate(angle);
        ctx.drawImage(
          glassesImg,
          -frameWidthPx / 2,
          -frameHeightPx * FRAME_VERTICAL_OFFSET,
          frameWidthPx,
          frameHeightPx,
        );
        ctx.restore();
      };
      rafId = requestAnimationFrame(loop);
    })
    .catch(() => {
      // Si el modelo no carga, se deja ver la cámara sin overlay en vez de bloquear el modal.
    });

  return {
    stop: () => {
      stopped = true;
      window.removeEventListener('resize', onResize);
      if (rafId) cancelAnimationFrame(rafId);
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
