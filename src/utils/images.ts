/** true si la imagen es un placeholder del CMS ("Foto pendiente"), no una foto real. */
export function isPlaceholderImage(url: string): boolean {
  return url.includes('/placeholder-');
}
