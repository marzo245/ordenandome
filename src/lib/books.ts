/**
 * Recomendaciones de libros desde Open Library.
 *
 * Por cada nicho (dev, ia, seguridad, startups) consulta el endpoint de
 * "subjects" de Open Library, normaliza a {@link BookSuggestion}, dedup por id
 * y reporta conteos/errores por nicho. Tolerante a fallos: un nicho que falla
 * no tumba al resto.
 */
export type NicheKey = 'dev' | 'ai' | 'sec' | 'startup';

/** Un libro sugerido, normalizado desde Open Library. */
export interface BookSuggestion {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  open_library_url: string;
  niche: NicheKey;
  niche_label: string;
  first_publish_year: number | null;
}

/** Etiqueta legible de cada nicho (para la UI). */
export const NICHE_LABELS: Record<NicheKey, string> = {
  dev: 'Dev / Web',
  ai: 'IA / LLM',
  sec: 'Seguridad',
  startup: 'Startups',
};

/** Mapea cada nicho al "subject" de Open Library que se consulta. */
const NICHE_SUBJECTS: Record<NicheKey, string> = {
  dev: 'computer_programming',
  ai: 'artificial_intelligence',
  sec: 'computer_security',
  startup: 'entrepreneurship',
};

interface OlWork {
  key: string;
  title: string;
  authors?: { name: string }[];
  cover_id: number | null;
  first_publish_year?: number;
}

/** fetch con timeout de 6s y sin cache; devuelve null en vez de lanzar si falla/aborta. */
async function safeFetch(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'calendario-inteligente/1.0 (+https://github.com/marzo245/ordenandome)',
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Trae hasta `limit` libros del subject de un nicho, ya normalizados. */
async function fetchSubject(niche: NicheKey, limit: number): Promise<BookSuggestion[]> {
  const subject = NICHE_SUBJECTS[niche];
  const url = `https://openlibrary.org/subjects/${subject}.json?limit=${limit}`;
  const res = await safeFetch(url);
  if (!res?.ok) return [];
  const data = (await res.json()) as { works?: OlWork[] };
  return (data.works ?? []).map((w) => ({
    id: w.key,
    title: w.title,
    author: w.authors?.[0]?.name ?? null,
    cover_url: w.cover_id
      ? `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`
      : null,
    open_library_url: `https://openlibrary.org${w.key}`,
    niche,
    niche_label: NICHE_LABELS[niche],
    first_publish_year: w.first_publish_year ?? null,
  }));
}

/** Resultado agregado: libros dedup + conteo por nicho + errores por nicho. */
export interface BookRecommendationsResult {
  items: BookSuggestion[];
  perNiche: Record<NicheKey, number>;
  errors: { niche: NicheKey; error: string }[];
}

/**
 * Trae recomendaciones de los cuatro nichos en paralelo y las combina.
 * @param perNiche Cuántos libros pedir por nicho (default 6).
 */
export async function fetchBookRecommendations(
  perNiche = 6
): Promise<BookRecommendationsResult> {
  const niches: NicheKey[] = ['dev', 'ai', 'sec', 'startup'];
  const errors: { niche: NicheKey; error: string }[] = [];
  const perNicheCount: Record<NicheKey, number> = {
    dev: 0,
    ai: 0,
    sec: 0,
    startup: 0,
  };

  const results = await Promise.all(
    niches.map(async (n) => {
      try {
        const items = await fetchSubject(n, perNiche);
        perNicheCount[n] = items.length;
        return items;
      } catch (e) {
        errors.push({ niche: n, error: (e as Error).message });
        return [];
      }
    })
  );

  const all = results.flat();
  const seen = new Set<string>();
  const dedup: BookSuggestion[] = [];
  for (const b of all) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    dedup.push(b);
  }

  return { items: dedup, perNiche: perNicheCount, errors };
}
