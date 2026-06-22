/**
 * Lógica de cruce de la importación de KO altas (compartida por
 * `/api/ko/import` y `/api/ko/casos/recruzar`).
 *
 * Criterio PRIMARIO: el «Error normalizado» del caso. Una cuenta es conocida si la
 * frase de EXACTAMENTE un KO del catálogo (`ko_entries.error`) está contenida en
 * ese texto.
 *
 * El `ECO_Notes` del caso (mensaje crudo) interviene cuando el «Error normalizado»
 * no basta:
 *  - DESEMPATE: si el texto cruza con varios KOs (p. ej. el crudo trae el genérico
 *    "E011-No fue posible crear el servicios" + el específico "E137-Error
 *    insertando cuenta"), gana el KO cuyo `eco_notes` contenido en el crudo sea el
 *    MÁS LARGO (el más específico).
 *  - CRUCE: si el texto no cruza con ninguno pero es genérico (p. ej. "Error
 *    creando la Cuenta Contrato"), se intenta cruzar por el `eco_notes` del KO
 *    contenido en el `ECO_Notes` del caso (que sí trae el código: EM 101/EM 102…).
 *
 * El cruce es insensible a tildes (insercion ↔ inserción).
 */

/** Normaliza un texto de error para comparar (minúsculas, SIN tildes, sin signos, espacios colapsados). */
export function normKoError(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes/diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrae el valor de la columna de ECO_Notes de una fila del Excel (si existe). */
export function ecoNotesDeFila(fila: Record<string, unknown> | null | undefined): string {
  if (!fila) return '';
  for (const [k, v] of Object.entries(fila)) {
    if (/eco.*notes/i.test(k) && v != null && String(v).trim() !== '') {
      return String(v);
    }
  }
  return '';
}

export type KoIndexEntry = { id: string; codigo: string | null; n: string; eco: string };

/**
 * Índice del catálogo para el cruce por contención. Descarta errores muy cortos
 * (< 8 chars normalizados) para evitar falsos positivos. Guarda también el
 * `eco_notes` normalizado para el cruce/desempate por ECO_Notes.
 */
export function buildKoIndex(
  catalogo: { id: string; codigo: string | null; error: string; eco_notes?: string | null }[]
): KoIndexEntry[] {
  return catalogo
    .map((ko) => ({
      id: ko.id,
      codigo: ko.codigo,
      n: normKoError(ko.error),
      eco: normKoError(ko.eco_notes),
    }))
    .filter((k) => k.n.length >= 8);
}

/**
 * Elige, entre unos candidatos, el KO cuyo `eco_notes` esté contenido en el
 * mensaje crudo del caso y sea el MÁS LARGO (el más específico). Empate → null.
 */
function porEcoNotes(candidatos: KoIndexEntry[], raw: string): KoIndexEntry | null {
  const eh = candidatos
    .filter((k) => k.eco.length >= 8 && raw.includes(k.eco))
    .sort((a, b) => b.eco.length - a.eco.length);
  return eh.length === 1 || (eh.length > 1 && eh[0].eco.length > eh[1].eco.length)
    ? eh[0]
    : null;
}

/**
 * Devuelve el KO del catálogo para el texto de un caso, o null si no se puede
 * decidir. Cachea por (texto + ecoNotes).
 */
export function createKoMatcher(index: KoIndexEntry[]) {
  const cache = new Map<string, KoIndexEntry | null>();
  return (texto: unknown, ecoNotes?: unknown): KoIndexEntry | null => {
    const t = normKoError(texto);
    const raw = normKoError(ecoNotes);
    if (!t && !raw) return null;
    const key = `${t} ${raw}`;
    if (cache.has(key)) return cache.get(key)!;

    const hits = t ? index.filter((k) => t.includes(k.n)) : [];
    let ko: KoIndexEntry | null;
    if (hits.length === 1) {
      ko = hits[0];
    } else if (hits.length > 1) {
      // Cruza con varios: desempata por el eco_notes más específico del crudo.
      ko = porEcoNotes(hits, raw || t);
    } else {
      // No cruza por error: intenta cruzar por el ECO_Notes del caso (si lo trae).
      ko = raw ? porEcoNotes(index, raw) : null;
    }

    cache.set(key, ko);
    return ko;
  };
}
