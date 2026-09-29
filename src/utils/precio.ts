import site from './site';

export const formatCOP = (valor: number): string => `$${valor.toLocaleString('es-CO')}`;

/**
 * Etiqueta de precio de una montura:
 * precio propio → "Desde $X"; si no, precio base del sitio → "Monturas desde $X";
 * si tampoco existe → "Cotiza por WhatsApp".
 */
export function priceLabel(price: number | null): string {
  if (price !== null) return `Desde ${formatCOP(price)}`;
  if (site.precioDesdeMontura !== null) return `Monturas desde ${formatCOP(site.precioDesdeMontura)}`;
  return 'Cotiza por WhatsApp';
}
