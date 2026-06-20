/**
 * Lógica de cruce de la importación de KO altas (compartida por
 * `/api/ko/import` y `/api/ko/casos/recruzar`).
 *
 * Criterio ÚNICO: el «Error normalizado» del caso. Una cuenta es conocida si la
 * frase de EXACTAMENTE un KO del catálogo (`ko_entries.error`) está contenida en
 * ese texto. Todas las filas con el mismo «Error normalizado» dan el mismo
 * resultado. Sin IA y sin mirar el ECO_Notes.
 */

/** Normaliza un texto de error para comparar (minúsculas, sin signos, espacios colapsados). */
export function normKoError(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type KoIndexEntry = { id: string; codigo: string | null; n: string };

/**
 * Índice del catálogo para el cruce por contención. Descarta errores muy cortos
 * (< 8 chars normalizados) para evitar falsos positivos.
 */
export function buildKoIndex(
  catalogo: { id: string; codigo: string | null; error: string }[]
): KoIndexEntry[] {
  return catalogo
    .map((ko) => ({ id: ko.id, codigo: ko.codigo, n: normKoError(ko.error) }))
    .filter((k) => k.n.length >= 8);
}

/**
 * Devuelve el KO del catálogo si EXACTAMENTE uno está contenido en el texto del
 * caso (0 o ambiguo → null). Cachea por texto: mismo texto → mismo veredicto.
 */
export function createKoMatcher(index: KoIndexEntry[]) {
  const cache = new Map<string, KoIndexEntry | null>();
  return (texto: unknown): KoIndexEntry | null => {
    const t = normKoError(texto);
    if (!t) return null;
    if (cache.has(t)) return cache.get(t)!;
    const hits = index.filter((k) => t.includes(k.n));
    const ko = hits.length === 1 ? hits[0] : null;
    cache.set(t, ko);
    return ko;
  };
}
