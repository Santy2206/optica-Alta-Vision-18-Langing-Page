// Genera packshots FRONTALES e-commerce con Fal a partir del manifest clasificado.
// Solo usa is_primary_front=true. No toca el sitio web ni borra originales.
//
// Uso:
//   node scripts/generate-packshots-front.mjs
//   node scripts/generate-packshots-front.mjs --dry-run
//   node scripts/generate-packshots-front.mjs --limit 5
//   node scripts/generate-packshots-front.mjs --only hexagonal04__dorado_b,clubmaster07__transparente_b
//   node scripts/generate-packshots-front.mjs --force   # regenera aunque ya exista
//
// Auth: FAL_KEY en env o keys.env (nunca se imprime).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fal } from '@fal-ai/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROJECTS = path.join(ROOT, '..');
const MANIFEST = path.join(
  PROJECTS,
  'Imaganes',
  'Catalogo_Clasificado',
  '_manifest.csv',
);
const OUT_ROOT = path.join(PROJECTS, 'Imaganes', 'Catalogo_Packshot');
const REPORT = path.join(OUT_ROOT, '_front_batch_report.json');

const FRONT_PROMPT = `Professional ecommerce product packshot of the EXACT same eyeglasses from the reference photo.
Front view, eye-level camera, perfectly centered on a pure white seamless studio background (#FFFFFF).
Full frame visible with comfortable padding around — do NOT crop the upper rim, temple tips, or any part of the frame.
Clear transparent demo lenses that are nearly invisible and almost the same white as the background, only very subtle realistic glass reflections.

CRITICAL — temples/arms geometry:
- Exactly ONE left temple and ONE right temple. No ghost, doubled, mirrored, or duplicated arms.
- Temples go straight back from the hinges (away from the camera), partially visible through each clear lens as a single thin line — not two parallel arms, not arms bending weirdly, not arms pointing down in front of the lenses.
- No second pair of temples, no floating arms, no arms folded the wrong way in front of the lenses.
- Nose pads only where the real frame has them; no extra legs under the lenses.

Soft even studio lighting, no hard shadows, no colored background, no shelf, no blue furniture, no barcode, no stickers, no labels, no text, no logos, no brand names, no person, no hands, no clutter.
Preserve the exact frame shape, materials, colors, bridge, nose pads, hinges and proportions from the reference.
Sharp catalog product photography, high detail, clean silhouette.`;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    limit: null,
    only: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--only') {
      args.only = new Set(
        argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
  }
  return args;
}

function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  const envPath = path.join(ROOT, 'keys.env');
  if (!existsSync(envPath)) throw new Error('No FAL_KEY en env y no existe keys.env');
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(?:export\s+)?FAL_KEY\s*=\s*(.*)$/);
    if (m) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  throw new Error('keys.env no define FAL_KEY');
}

/** CSV mínimo con comillas y comas. */
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function isTrue(v) {
  return String(v || '')
    .trim()
    .toLowerCase() === 'true';
}

function safeName(s) {
  return String(s)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim();
}

function selectJobs(rows, args) {
  let jobs = rows.filter((r) => r.role === 'front' && isTrue(r.is_primary_front));
  if (args.only) {
    jobs = jobs.filter((r) => args.only.has(r.sku_group));
  }
  // Un primary front por sku_group (por si el CSV tuviera duplicados)
  const seen = new Set();
  jobs = jobs.filter((r) => {
    if (seen.has(r.sku_group)) return false;
    seen.add(r.sku_group);
    return true;
  });
  if (args.limit != null && Number.isFinite(args.limit)) {
    jobs = jobs.slice(0, args.limit);
  }
  return jobs;
}

async function generateOne(job, { force }) {
  const familia = safeName(job.familia);
  const sku = safeName(job.sku_group);
  const outDir = path.join(OUT_ROOT, familia, sku);
  const outJpg = path.join(outDir, 'front.jpg');
  const outMeta = path.join(outDir, 'front.meta.json');

  mkdirSync(outDir, { recursive: true });

  if (!force && existsSync(outJpg) && existsSync(outMeta)) {
    return { status: 'skipped', outJpg, reason: 'already exists' };
  }

  const candidates = [
    job.dest_path,
    job.source_path,
    path.join(
      PROJECTS,
      'Imaganes',
      'Catalogo_Clasificado',
      job.familia,
      'front',
      job.dest_filename,
    ),
  ].filter(Boolean);

  const inputPath = candidates.find((p) => existsSync(p));
  if (!inputPath) {
    return {
      status: 'error',
      reason: `input missing. tried: ${candidates.join(' | ')}`,
    };
  }

  const bytes = readFileSync(inputPath);
  const mime = inputPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const file = new Blob([bytes], { type: mime });
  const uploaded = await fal.storage.upload(file);

  const result = await fal.subscribe('fal-ai/flux-2-pro/edit', {
    input: {
      prompt: FRONT_PROMPT,
      image_urls: [uploaded],
      image_size: 'landscape_4_3',
      output_format: 'jpeg',
      safety_tolerance: '2',
    },
    logs: false,
  });

  const images = result.data?.images ?? [];
  if (!images.length || !images[0].url) {
    writeFileSync(
      outMeta,
      JSON.stringify({ ok: false, sku_group: job.sku_group, result: result.data, requestId: result.requestId }, null, 2),
    );
    return { status: 'error', reason: 'no images[0].url', requestId: result.requestId };
  }

  const res = await fetch(images[0].url);
  if (!res.ok) return { status: 'error', reason: `download ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outJpg, buf);

  const meta = {
    ok: true,
    role: 'front',
    familia: job.familia,
    sku_group: job.sku_group,
    source_filename: job.source_filename || job.dest_filename,
    input_path: inputPath,
    output_path: outJpg,
    bytes: buf.length,
    model: 'fal-ai/flux-2-pro/edit',
    requestId: result.requestId,
    seed: result.data?.seed,
    sourceUrl: images[0].url,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(outMeta, JSON.stringify(meta, null, 2));

  return { status: 'ok', outJpg, bytes: buf.length, requestId: result.requestId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(MANIFEST)) {
    throw new Error(`No está el manifest: ${MANIFEST}`);
  }

  const rows = parseCsv(readFileSync(MANIFEST, 'utf8'));
  const jobs = selectJobs(rows, args);
  console.log(`[packshots-front] manifest rows=${rows.length} jobs=${jobs.length}`);
  console.log(`[packshots-front] out=${OUT_ROOT}`);
  if (args.dryRun) {
    for (const j of jobs) {
      console.log(`  DRY  ${j.familia} | ${j.sku_group} | ${j.dest_filename}`);
    }
    console.log('[packshots-front] dry-run listo (0 llamadas a Fal)');
    return;
  }

  const key = loadFalKey();
  if (!key) throw new Error('FAL_KEY vacío');
  fal.config({ credentials: key });
  mkdirSync(OUT_ROOT, { recursive: true });

  const report = {
    startedAt: new Date().toISOString(),
    model: 'fal-ai/flux-2-pro/edit',
    total: jobs.length,
    ok: 0,
    skipped: 0,
    error: 0,
    items: [],
  };

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const label = `${i + 1}/${jobs.length} ${job.sku_group}`;
    process.stdout.write(`[packshots-front] ${label} … `);
    try {
      const res = await generateOne(job, args);
      report.items.push({
        sku_group: job.sku_group,
        familia: job.familia,
        ...res,
      });
      if (res.status === 'ok') {
        report.ok += 1;
        console.log(`OK (${res.bytes} bytes)`);
      } else if (res.status === 'skipped') {
        report.skipped += 1;
        console.log(`skip (${res.reason})`);
      } else {
        report.error += 1;
        console.log(`ERROR: ${res.reason}`);
      }
    } catch (err) {
      report.error += 1;
      report.items.push({
        sku_group: job.sku_group,
        familia: job.familia,
        status: 'error',
        reason: err.message,
      });
      console.log(`ERROR: ${err.message}`);
    }
  }

  report.finishedAt = new Date().toISOString();
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    `[packshots-front] listo. ok=${report.ok} skipped=${report.skipped} error=${report.error}`,
  );
  console.log(`[packshots-front] report → ${REPORT}`);
}

main().catch((err) => {
  console.error('[packshots-front] FATAL:', err.message);
  process.exit(1);
});
