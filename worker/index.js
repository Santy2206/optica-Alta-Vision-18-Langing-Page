// Cloudflare Worker: sirve el sitio estático (binding ASSETS) y expone
// POST /api/face-shape, que pregunta a un modelo de visión (Claude vía fal)
// la forma del rostro. La clave FAL_KEY vive solo aquí (wrangler secret).
// La foto no se guarda: se reenvía al modelo y se descarta.

const VISION_MODEL_URL = 'https://fal.run/openrouter/router/vision';
const VISION_LLM = 'anthropic/claude-sonnet-4.5';
const SHAPES = ['ovalado', 'redondo', 'cuadrado', 'corazon', 'diamante'];
const ENGLISH_TO_SHAPE = { oval: 'ovalado', round: 'redondo', square: 'cuadrado', heart: 'corazon', diamond: 'diamante' };
const MAX_IMAGE_CHARS = 2_000_000;

const PROMPT = [
  'You are an expert optician classifying face shape for eyeglass frames from a frontal photo.',
  'Judge ONLY bone structure and outline; ignore hair, beard, makeup, lighting, glasses, expression.',
  'Step 1: estimate, as relative numbers where the widest of the three = 100: forehead width (at the temples), cheekbone width, jaw width (at the angles of the jaw).',
  'Step 2: estimate face length (hairline to chin) divided by cheekbone width.',
  'Step 3: describe the chin (pointed, rounded, flat/square) and the jaw angles (soft or angular).',
  'Step 4: choose ONE shape using these rules, checking in this order:',
  '- heart: forehead is the widest and the jaw is clearly narrower (at least ~15% narrower), chin pointed or narrow.',
  '- diamond: cheekbones are the widest by a clear margin; forehead AND jaw both clearly narrower than the cheekbones.',
  '- square: forehead, cheekbones and jaw all similar width, with a strong angular jaw and flat/wide chin (also if the face is long but the jaw is straight and angular).',
  '- round: length is about equal to width (ratio under ~1.2), full soft cheeks, rounded jaw and chin, no angles.',
  '- oval: length clearly greater than width (ratio about 1.3-1.5), forehead slightly wider than the jaw, softly rounded jaw and chin. Oval is NOT a default: use it only if none of the others fits clearly.',
  'Show your brief reasoning, then end with a final line exactly like: ANSWER: <oval|round|square|heart|diamond>',
].join('\n');

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function handleFaceShape(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.FAL_KEY) return json({ error: 'not_configured' }, 503);

  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'origin' }, 403);

  let image;
  try {
    ({ image } = await request.json());
  } catch {
    return json({ error: 'body' }, 400);
  }
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
    return json({ error: 'image' }, 400);
  }

  const res = await fetch(VISION_MODEL_URL, {
    method: 'POST',
    headers: { Authorization: `Key ${env.FAL_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: VISION_LLM,
      image_urls: [image],
      temperature: 0,
      prompt: PROMPT,
    }),
  });
  if (!res.ok) return json({ error: 'upstream' }, 502);

  const output = String((await res.json()).output ?? '').toLowerCase();
  const word = output.match(/answer:\s*\**\s*(oval|round|square|heart|diamond)/)?.[1];
  const shape = word ? ENGLISH_TO_SHAPE[word] : null;
  return shape && SHAPES.includes(shape) ? json({ shape }) : json({ error: 'unrecognized' }, 502);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/face-shape') return handleFaceShape(request, env);
    return env.ASSETS.fetch(request);
  },
};
