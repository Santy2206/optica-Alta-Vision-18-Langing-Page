/**
 * Única fuente de links de WhatsApp. Usable en frontmatter (SSR) y en <script> del cliente.
 * Cada CTA pasa un `origen` distinto (header, hero, catalogo:{slug}, …) que:
 *  - se agrega al mensaje como "[ref: origen]" para saber de dónde llegó el chat, y
 *  - debe ir también en el atributo data-cta del link para la analítica (ver trackCta).
 */
import { telefono } from '../content/configuracion/site.json';

export function waLink(origen: string, mensaje: string): string {
  const text = `${mensaje} [ref: ${origen}]`;
  return `https://wa.me/${telefono}?text=${encodeURIComponent(text)}`;
}

type Gtag = (command: 'event', name: string, params: Record<string, unknown>) => void;
type Plausible = (name: string, options?: { props?: Record<string, unknown> }) => void;

/** Evento de clic en CTA. Envía a GA4 y/o Plausible si están cargados; si no, no hace nada. */
export function trackCta(origen: string): void {
  try {
    const w = window as unknown as { gtag?: Gtag; plausible?: Plausible };
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'whatsapp_click', { cta_origen: origen });
    }
    if (typeof w.plausible === 'function') {
      w.plausible('WhatsApp Click', { props: { origen } });
    }
  } catch {
    // La analítica nunca debe romper la navegación.
  }
}
