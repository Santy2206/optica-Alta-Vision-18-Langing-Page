// Decide si Netlify debe saltarse un build (netlify.toml → build.ignore).
// Exit 0 = saltar el build · exit != 0 = construir.
//
// Problema que resuelve: el CMS hace commit con la foto cruda; Netlify construía de
// inmediato (publicando la foto fea y gastando ~2 min), y ~1 min después el workflow
// enrich-catalogo.yml hacía otro commit con las imágenes generadas por IA → segundo
// build. Aquí se salta el primero: el workflow SIEMPRE cierra con un commit del bot
// (aunque la IA falle), y ese sí se construye.
//
// Solo salta si TODO esto se cumple:
//   - el cambio a desplegar toca el catálogo (entradas o fotos),
//   - alguna montura aún no pasó por la IA (misma regla que enrich-catalogo.mjs),
//   - el commit no es del bot (el del bot siempre se construye).
// Ante cualquier error o duda → construye (nunca deja el sitio sin actualizar).
//
// `--pending`: exit 0 si hay monturas por procesar (lo usa el workflow).

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGO_DIR = path.join(ROOT, 'src', 'content', 'catalogo');
const PUBLIC_DIR = path.join(ROOT, 'public');

const BUILD = 1;
const SKIP = 0;

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function hasPendingEnrichment() {
  return readdirSync(CATALOGO_DIR)
    .filter((f) => f.endsWith('.json'))
    .some((file) => {
      const { image } = JSON.parse(readFileSync(path.join(CATALOGO_DIR, file), 'utf8'));
      if (!image || image.includes('/placeholder-') || !image.startsWith('/uploads/catalogo/')) {
        return false;
      }
      const disk = path.join(PUBLIC_DIR, image);
      if (!existsSync(disk) || /-front\.webp$/.test(image)) return false;
      const base = path.basename(disk, path.extname(disk));
      return !existsSync(path.join(path.dirname(disk), `${base}-tryon-src.webp`));
    });
}

function main() {
  const pending = hasPendingEnrichment();
  if (process.argv.includes('--pending')) return pending ? SKIP : BUILD;
  if (!pending) return BUILD;

  const head = process.env.COMMIT_REF || 'HEAD';
  if (sh(`git log -1 --format=%an ${head}`) === 'github-actions[bot]') return BUILD;

  const cached = process.env.CACHED_COMMIT_REF;
  const changed = cached
    ? sh(`git diff --name-only ${cached} ${head}`)
    : sh(`git diff --name-only ${head}~1 ${head}`);
  const touchesCatalog = changed
    .split('\n')
    .some((f) => f.startsWith('src/content/catalogo/') || f.startsWith('public/uploads/catalogo/'));

  return touchesCatalog ? SKIP : BUILD;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`netlify-ignore: ${err.message} — se construye por seguridad`);
  process.exit(BUILD);
}
