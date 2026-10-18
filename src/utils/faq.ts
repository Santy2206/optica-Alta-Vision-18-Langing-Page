/**
 * FAQ ordenada por peso de la objeción: dinero → confianza → tiempo → logística.
 * Las respuestas de política del negocio salen de site.json; si el dato está vacío,
 * la pregunta no se muestra ni entra al schema FAQPage. Compartida por FAQ.astro y FlowFAQ.astro.
 */
import site from './site';
import { formatCOP } from './precio';

const { examen, pagos, precioDesdeMontura, tiempoEntrega, faq } = site;

const respuestaExamen = (() => {
  const precio = examen.precio !== null ? formatCOP(examen.precio) : '';
  if (examen.gratisConCompra && precio) {
    return `Es gratis si compras tus gafas con nosotros. Si solo quieres el examen, cuesta ${precio}.`;
  }
  if (examen.gratisConCompra) return 'Es gratis si compras tus gafas con nosotros.';
  if (precio) return `Cuesta ${precio}.`;
  return '';
})();

export const faqs = [
  { q: '¿Cuánto cuesta el examen visual?', a: respuestaExamen },
  {
    q: '¿Cuánto cuestan las gafas formuladas?',
    a:
      precioDesdeMontura !== null
        ? `Monturas desde ${formatCOP(precioDesdeMontura)}; el valor final depende del lente.`
        : '',
  },
  {
    q: '¿Qué formas de pago aceptan?',
    a: `Aceptamos ${pagos.mediosPagoTexto}.`,
  },
  { q: '¿Qué pasa si mi fórmula no me queda bien?', a: faq.garantiaFormula },
  {
    q: '¿Qué garantía tienen las monturas?',
    a: 'Todas tienen garantía por defectos de fábrica. El periodo exacto varía según la marca.',
  },
  {
    q: '¿Qué tipos de lentes manejan?',
    a: 'Monofocales, progresivos, con filtro de luz azul y fotocromáticos. Te asesoramos para elegir el que mejor se adapte a tu fórmula y uso diario.',
  },
  {
    q: '¿Venden lentes blandos?',
    a: 'Sí. Contamos con lentes de contacto blandos y te orientamos según tu fórmula y necesidades.',
  },
  { q: '¿Cuánto tarda la entrega?', a: `Tus gafas quedan listas en ${tiempoEntrega}.` },
  {
    q: '¿Qué incluye la compra de las gafas?',
    a: 'Con tu compra te entregamos un kit de cuidado: limpiador, estuche y pañuelo, listo para proteger y mantener tus gafas.',
  },
  { q: '¿Atienden niños?', a: faq.ninos },
  {
    q: '¿Necesito cita previa?',
    a: 'No es obligatoria. Te recomendamos agendar por WhatsApp para atenderte sin esperas; también te recibimos si llegas sin cita.',
  },
].filter((item) => item.a.trim() !== '');

export const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};
