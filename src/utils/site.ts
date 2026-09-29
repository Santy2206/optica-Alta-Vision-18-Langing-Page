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
const pagos = obj(r.pagos);
const probador = obj(r.probador);
const faq = obj(r.faq);
const nosotrosRaw = obj(r.nosotros);
const direccionPostal = obj(r.direccionPostal);
const horarioRaw = obj(r.horario);
const geo = obj(r.geo);

const DEFAULT_TIEMPO_ENTREGA = '3 a 5 días hábiles';
const DEFAULT_PROBADOR_CTA = 'Me gustan, ¿las tienen disponibles?';
const DEFAULT_HERO_TITULO = 'Ve mejor en {tiempoEntrega}{barrio}';
const DEFAULT_HERO_SUBTITULO = 'Optometría profesional, monturas formuladas y de sol{cuotas}.';

const barrio = str(r.barrio);
const tiempoEntrega = str(r.tiempoEntrega) || DEFAULT_TIEMPO_ENTREGA;
// Solo se afirma "pagos en cuotas" / financiadores si el cliente lo confirmó en el CMS.
const addi = pagos.addi === true;
// Sistecredito (clave actual) + alias legacy "istecredito" por si quedó en CMS viejo.
const sistecredito = pagos.sistecredito === true || pagos.istecredito === true;
const cuotas = pagos.cuotas === true || addi || sistecredito;

const financiadores = [
  addi && 'ADDI',
  sistecredito && 'Sistecredito',
].filter((v): v is string => Boolean(v));

/** Texto legible de medios de pago para FAQ / microcopy. */
const mediosPagoTexto = (() => {
  const base = ['Efectivo', 'tarjeta débito o crédito', 'transferencia'];
  if (financiadores.length === 1) base.push(financiadores[0]);
  else if (financiadores.length > 1) {
    base.push(`${financiadores.slice(0, -1).join(', ')} e ${financiadores[financiadores.length - 1]}`);
  } else if (pagos.cuotas === true) {
    base.push('pagos a cuotas');
  }
  if (base.length === 1) return base[0];
  return `${base.slice(0, -1).join(', ')} y ${base[base.length - 1]}`;
})();

// --- Horario: única fuente para el texto visible y el schema openingHoursSpecification ---
const DIAS = [
  ['Monday', 'Lunes'],
  ['Tuesday', 'Martes'],
  ['Wednesday', 'Miércoles'],
  ['Thursday', 'Jueves'],
  ['Friday', 'Viernes'],
  ['Saturday', 'Sábado'],
  ['Sunday', 'Domingo'],
] as const;
type DiaSchema = (typeof DIAS)[number][0];

const HORA_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const hora = (v: unknown): string => {
  const m = HORA_RE.exec(str(v));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

const diasHorario: DiaSchema[] = DIAS.map(([en]) => en).filter(
  (en) => Array.isArray(horarioRaw.dias) && horarioRaw.dias.includes(en),
);
const abre = hora(horarioRaw.abre);
const cierra = hora(horarioRaw.cierra);

/** "11:00" → "11am", "20:00" → "8pm", "10:30" → "10:30am". */
function horaLegible(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${sufijo}`;
}

/** Días consecutivos → "Lunes a Sábado"; sueltos → "Lunes, Miércoles y Viernes". */
function diasLegibles(dias: DiaSchema[]): string {
  const idx = dias.map((d) => DIAS.findIndex(([en]) => en === d));
  const nombre = (i: number) => DIAS[i][1];
  const consecutivos = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (idx.length >= 3 && consecutivos) return `${nombre(idx[0])} a ${nombre(idx[idx.length - 1])}`;
  const nombres = idx.map(nombre);
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres.join('');
}

const horarioCompleto = diasHorario.length > 0 && abre !== '' && cierra !== '';
const horarioTexto = horarioCompleto
  ? `${diasLegibles(diasHorario)}, ${horaLegible(abre)} - ${horaLegible(cierra)}`
  : '';

/**
 * {tiempoEntrega} → valor; {barrio} → ", en {barrio}" o se elimina si está vacío;
 * {cuotas} → ", con pagos en cuotas" solo si pagos.cuotas es true.
 */
function interpolar(template: string): string {
  return template
    .replaceAll('{tiempoEntrega}', tiempoEntrega)
    .replaceAll('{barrio}', barrio ? `, aquí en ${barrio}` : '')
    .replaceAll('{cuotas}', cuotas ? ', con pagos en cuotas' : '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const site = {
  telefono: str(r.telefono),
  /** Texto visible generado desde `horarioSchema` ("Lunes a Sábado, 11am - 8pm"); vacío si falta algún dato. */
  horario: horarioTexto,
  /** Datos para openingHoursSpecification; null si el horario está incompleto. */
  horarioSchema: horarioCompleto ? { dias: diasHorario, abre, cierra } : null,
  barrio,
  direccion: str(r.direccion),
  /** Dirección estructurada para el schema PostalAddress (no se parsea `direccion`). */
  direccionPostal: {
    calle: str(direccionPostal.calle),
    localidad: str(direccionPostal.localidad) || 'Bogotá',
  },
  geo: {
    lat: num(geo.lat),
    lng: num(geo.lng),
  },
  redesSociales: {
    instagram: str(redes.instagram),
    facebook: str(redes.facebook),
  },
  googleMapsEmbedUrl: str(r.googleMapsEmbedUrl),
  examen: {
    precio: num(examen.precio),
    gratisConCompra: examen.gratisConCompra === true,
  },
  pagos: { cuotas, addi, sistecredito, financiadores, mediosPagoTexto },
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
  probador: {
    ctaTexto: str(probador.ctaTexto) || DEFAULT_PROBADOR_CTA,
  },
  /** Respuestas de política del negocio: vacío = la pregunta no se muestra. */
  faq: {
    garantiaFormula: str(faq.garantiaFormula),
    ninos: str(faq.ninos),
  },
  /** Página /nosotros. Cada bloque se oculta si su campo está vacío. */
  nosotros: {
    historia: str(nosotrosRaw.historia),
    cita: str(nosotrosRaw.cita),
    fotosLocal: Array.isArray(nosotrosRaw.fotosLocal) ? nosotrosRaw.fotosLocal.filter((f): f is string => typeof f === 'string' && f.trim() !== '') : [],
  },
  heroImagen: str(r.heroImagen),
  hero: {
    titulo: interpolar(str(hero.titulo) || DEFAULT_HERO_TITULO),
    subtitulo: interpolar(str(hero.subtitulo) || DEFAULT_HERO_SUBTITULO),
  },
} as const;

export type Site = typeof site;
export default site;
