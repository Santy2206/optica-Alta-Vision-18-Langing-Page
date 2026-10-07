// Genera packshots HOVER (ángulo ¾/diagonal) con Fal a partir del manifest.
// Solo is_primary_angle=true y solo sku_group que pasaron QA de front (_qa/_verdict.json).
//
// Uso:
//   node scripts/generate-packshots-angle.mjs
//   node scripts/generate-packshots-angle.mjs --dry-run
//   node scripts/generate-packshots-angle.mjs --force
//   node scripts/generate-packshots-angle.mjs --only sku1,sku2

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fal } from '@fal-ai/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROJECTS = path.join(ROOT, '..');
const MANIFEST = path.join(PROJECTS, 'Imaganes', 'Catalogo_Clasificado', '_manifest.csv');
const OUT_ROOT = path.join(PROJECTS, 'Imaganes', 'Catalogo_Packshot');
const VERDICT = path.join(OUT_ROOT, '_qa', '_verdict.json');
const REPORT = path.join(OUT_ROOT, '_angle_batch_report.json');

const ANGLE_PROMPT = `Professional ecommerce product photo of the EXACT same eyeglasses from the reference.
KEEP the same diagonal / three-quarter camera angle as the reference — do NOT rotate to a full front view.
Eyewear as a catalog product, full frame visible with padding, pure white seamless studio background (#FFFFFF).
Clear transparent demo lenses nearly invisible matching the white background, only very subtle glass reflections.
Soft even studio lighting, minimal soft shadow or none.
No shelf, no blue furniture, no stickers, no barcode labels, no text, no logos, no person, no hands, no clutter.
Preserve exact frame shape, materials, colors, bridge, nose pads, hinges, temple angle and proportions from the reference.
Sharp catalog product photography for a product card hover image.`;

function parseArgs(argv) {
  const args = { dryRun: false, force: false, limit: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--only') {
      args.only = new Set(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  throw new Error('keys.env no define FAL_KEY');
}

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
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function isTrue(v) {
  return String(v || '').trim().toLowerCase() === 'true';
}

function safeName(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

function loadPassSet() {
  if (!existsSync(VERDICT)) {
    console.warn('[packshots-angle] No hay verdict QA; se procesan todos los primary angle');
    return null;
  }
  const v = JSON.parse(readFileSync(VERDICT, 'utf8'));
  const rejected = new Set((v.reject || []).map((r) => r.sku_group));
  return rejected;
}

function selectJobs(rows, args, rejected) {
  let jobs = rows.filter((r) => r.role === 'angle' && isTrue(r.is_primary_angle));
  if (rejected) jobs = jobs.filter((r) => !rejected.has(r.sku_group));
  // solo si existe front packshot aprobado
  jobs = jobs.filter((r) => {
    const frontPath = path.join(OUT_ROOT, safeName(r.familia), safeName(r.sku_group), 'front.jpg');
    return existsSync(frontPath);
  });
  if (args.only) jobs = jobs.filter((r) => args.only.has(r.sku_group));
  const seen = new Set();
  jobs = jobs.filter((r) => {
    if (seen.has(r.sku_group)) return false;
    seen.add(r.sku_group);
    return true;
  });
  if (args.limit != null && Number.isFinite(args.limit)) jobs = jobs.slice(0, args.limit);
  return jobs;
}

async function generateOne(job, { force }) {
  const familia = safeName(job.familia);
  const sku = safeName(job.sku_group);
  const outDir = path.join(OUT_ROOT, familia, sku);
  const outJpg = path.join(outDir, 'hover.jpg');
  const outMeta = path.join(outDir, 'hover.meta.json');
  mkdirSync(outDir, { recursive: true });

  if (!force && existsSync(outJpg) && existsSync(outMeta)) {
    return { status: 'skipped', outJpg, reason: 'already exists' };
  }

  const candidates = [
    job.dest_path,
    job.source_path,
    path.join(PROJECTS, 'Imaganes', 'Catalogo_Clasificado', job.familia, 'angle', job.dest_filename),
  ].filter(Boolean);
  const inputPath = candidates.find((p) => existsSync(p));
  if (!inputPath) {
    return { status: 'error', reason: `input missing. tried: ${candidates.join(' | ')}` };
  }

  const bytes = readFileSync(inputPath);
  const mime = inputPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const uploaded = await fal.storage.upload(new Blob([bytes], { type: mime }));

  const result = await fal.subscribe('fal-ai/flux-2-pro/edit', {
    input: {
      prompt: ANGLE_PROMPT,
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
    role: 'hover',
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
  if (!existsSync(MANIFEST)) throw new Error(`No está el manifest: ${MANIFEST}`);
  const rows = parseCsv(readFileSync(MANIFEST, 'utf8'));
  const rejected = loadPassSet();
  const jobs = selectJobs(rows, args, rejected);

  console.log(`[packshots-angle] jobs=${jobs.length}`);
  if (args.dryRun) {
    for (const j of jobs) console.log(`  DRY  ${j.familia} | ${j.sku_group}`);
    console.log('[packshots-angle] dry-run (0 Fal)');
    return;
  }

  fal.config({ credentials: loadFalKey() });
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
    process.stdout.write(`[packshots-angle] ${i + 1}/${jobs.length} ${job.sku_group} … `);
    try {
      const res = await generateOne(job, args);
      report.items.push({ sku_group: job.sku_group, familia: job.familia, ...res });
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
      report.items.push({ sku_group: job.sku_group, familia: job.familia, status: 'error', reason: err.message });
      console.log(`ERROR: ${err.message}`);
    }
  }

  report.finishedAt = new Date().toISOString();
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`[packshots-angle] listo. ok=${report.ok} skipped=${report.skipped} error=${report.error}`);
  console.log(`[packshots-angle] report → ${REPORT}`);
}

main().catch((err) => {
  console.error('[packshots-angle] FATAL:', err.message);
  process.exit(1);
});
