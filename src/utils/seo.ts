import site from './site';

/** Títulos y descripciones por página, generados desde site.json. */

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const MARCA = 'Alta Visión 18';

/** Barrio si existe; si no, "Bogotá". */
export const zona = site.barrio || 'Bogotá';
/** "Fontibón, Bogotá" o solo "Bogotá" (evita "Bogotá, Bogotá"). */
export const zonaCompleta = site.barrio ? `${site.barrio}, Bogotá` : 'Bogotá';

/** Agrega " | Alta Visión 18" solo si el título completo cabe en 60 caracteres. */
function conMarca(base: string): string {
  const completo = `${base} | ${MARCA}`;
  return completo.length <= MAX_TITLE ? completo : base;
}

/** Corta en el último espacio antes del límite, sin dejar la frase a medias con puntuación colgando. */
function limitar(texto: string, max = MAX_DESCRIPTION): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`;
}

export const seo = {
  home: {
    title: conMarca(`Óptica en ${zona} | Examen visual y gafas`),
    description: limitar(
      `Óptica en ${zonaCompleta}. Examen visual, gafas formuladas y de sol listas en ${site.tiempoEntrega}. Agenda por WhatsApp.`,
    ),
  },
  catalogo: {
    title: conMarca(`Monturas y gafas en ${zona} | Catálogo`),
    description: limitar(
      `Catálogo de monturas formuladas, de sol, para niños y deportivas en ${zonaCompleta}. Pruébatelas con tu cámara y cotiza por WhatsApp.`,
    ),
  },
  nosotros: {
    title: conMarca(`Nosotros | Óptica en ${zona}`),
    description: limitar(
      `Conoce Óptica Alta Visión 18 en ${zonaCompleta}: examen visual, atención personalizada y garantía de fábrica en tus gafas.`,
    ),
  },
};
