type TipoLente = {
  imagen: string;
  alt: string;
  nombre: string;
  /** Misma foto con el lente activado: la tarjeta alterna entre ambas (animación). */
  imagenActiva?: string;
};

export const tiposLente: readonly TipoLente[] = [
  {
    imagen: '/images/tipos-lente/monofocales.webp',
    alt: 'Gafas con lentes monofocales sobre un escritorio',
    nombre: 'Monofocales',
  },
  {
    imagen: '/images/tipos-lente/progresivos.webp',
    alt: 'Gafas con lentes progresivos frente a un computador y una ventana',
    nombre: 'Progresivos',
  },
  {
    imagen: '/images/tipos-lente/filtro-luz-azul.webp',
    alt: 'Gafas con filtro de luz azul junto a un portátil encendido',
    nombre: 'Filtro luz azul',
  },
  {
    imagen: '/images/tipos-lente/fotocromaticos.webp',
    imagenActiva: '/images/tipos-lente/fotocromaticos-sol.webp',
    alt: 'Gafas con lentes fotocromáticos que se oscurecen al sol',
    nombre: 'Fotocromáticos',
  },
];
