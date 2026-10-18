type TipoLente = {
  imagen: string;
  alt: string;
  nombre: string;
  /** Línea corta que se muestra bajo el nombre en el selector del catálogo. */
  descripcion?: string;
  /** Misma foto con el lente activado: la tarjeta alterna entre ambas (animación). */
  imagenActiva?: string;
  /** Reflejo de color del lente (hex): se muestra como velo en hover en el selector. */
  tinte?: string;
  /** Mini-visual especial en el selector (p. ej. el progresivo con sus zonas). */
  visual?: 'progresivo';
};

export const tiposLente: readonly TipoLente[] = [
  {
    imagen: '/images/tipos-lente/monofocales.webp',
    alt: 'Gafas con lentes monofocales sobre un escritorio',
    nombre: 'Monofocales',
    descripcion: 'Una sola graduación en todo el lente',
  },
  {
    imagen: '/images/tipos-lente/progresivos.webp',
    alt: 'Gafas con lentes progresivos frente a un computador y una ventana',
    nombre: 'Progresivos',
    descripcion: 'Lejos · intermedio · cerca',
    visual: 'progresivo',
  },
  {
    imagen: '/images/tipos-lente/filtro-luz-azul.webp',
    alt: 'Gafas con filtro de luz azul junto a un portátil encendido',
    nombre: 'Filtro luz azul',
    descripcion: 'Para pantallas y computador',
    tinte: '#38BDF8',
  },
  {
    imagen: '/images/tipos-lente/fotocromaticos.webp',
    imagenActiva: '/images/tipos-lente/fotocromaticos-sol.webp',
    alt: 'Gafas con lentes fotocromáticos que se oscurecen al sol',
    nombre: 'Fotocromáticos',
    descripcion: 'Se oscurecen con el sol',
  },
];
