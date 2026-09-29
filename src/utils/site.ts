import raw from '../content/configuracion/site.json';

/**
 * Acceso tipado y normalizado a site.json (editable desde Decap).
 * Decap guarda "" en campos number vacíos y puede omitir objetos completos,
 * así que todo pasa por aquí: string vacío → "", número inválido → null.
 * Regla: si un valor queda vacío/null, el componente que lo usa NO se renderiza.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const r = raw as Record<string, unknown>;
const examen = obj(r.examen);
const reviews = obj(r.googleReviews);
const optometra = obj(r.optometra);
const hero = obj(r.hero);
const redes = obj(r.redesSociales);

const DEFAULT_TIEMPO_ENTREGA = '3 a 5 días hábiles';
const DEFAULT_HERO_TITULO = 'Tu examen visual y tus gafas listas en {tiempoEntrega}{barrio}';
const DEFAULT_HERO_SUBTITULO =
  'Optometría profesional, monturas formuladas y de sol, con pagos en cuotas.';

const barrio = str(r.barrio);
const tiempoEntrega = str(r.tiempoEntrega) || DEFAULT_TIEMPO_ENTREGA;

/** {tiempoEntrega} → valor; {barrio} → ", en {barrio}" o se elimina si está vacío. */
function interpolar(template: string): string {
  return template
    .replaceAll('{tiempoEntrega}', tiempoEntrega)
    .replaceAll('{barrio}', barrio ? `, en ${barrio}` : '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const site = {
  telefono: str(r.telefono),
  horario: str(r.horario),
  barrio,
  direccion: str(r.direccion),
  redesSociales: {
    instagram: str(redes.instagram),
    facebook: str(redes.facebook),
  },
  googleMapsEmbedUrl: str(r.googleMapsEmbedUrl),
  examen: {
    precio: num(examen.precio),
    gratisConCompra: examen.gratisConCompra === true,
  },
  precioDesdeMontura: num(r.precioDesdeMontura),
  tiempoEntrega,
  aniosExperiencia: num(r.aniosExperiencia),
  clientesAtendidos: num(r.clientesAtendidos),
  googleReviews: {
    rating: num(reviews.rating),
    total: num(reviews.total),
    url: str(reviews.url),
  },
  optometra: {
    nombre: str(optometra.nombre),
    cargo: str(optometra.cargo),
    tarjetaProfesional: str(optometra.tarjetaProfesional),
    foto: str(optometra.foto),
  },
  heroImagen: str(r.heroImagen),
  hero: {
    titulo: interpolar(str(hero.titulo) || DEFAULT_HERO_TITULO),
    subtitulo: interpolar(str(hero.subtitulo) || DEFAULT_HERO_SUBTITULO),
  },
} as const;

export type Site = typeof site;
export default site;
