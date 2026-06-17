/**
 * Contexto del vault Obsidian para los asistentes de IA.
 *
 * Provee dos niveles de grounding sobre `notes_cache`: un mapa compacto de la
 * estructura ({@link buildVaultMap}) que cabe siempre en el system prompt, y
 * una búsqueda por relevancia ({@link searchVault}) que el agente invoca como
 * tool cuando necesita detalle. Más helpers de render y estimación de tokens.
 */
import { db, notes_cache } from '@/db';
import { sql, or } from 'drizzle-orm';

/** Carpetas "estratégicas" del vault que entran en el mapa de grounding. */
const STRATEGIC_PREFIXES = [
  '01-Proyectos',
  '02-Areas',
  '05-MOCs',
  '06 Knowledge',
  '06 Tasks',
  'Gestión de KO',
];

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a',
  'en', 'por', 'para', 'con', 'sin', 'sobre', 'y', 'o', 'pero', 'si', 'no',
  'que', 'qué', 'cual', 'cuál', 'como', 'cómo', 'es', 'son', 'ser', 'estar',
  'hacer', 'tener', 'me', 'te', 'se', 'lo', 'le', 'mi', 'tu', 'su',
  'this', 'that', 'the', 'a', 'an', 'is', 'are', 'to', 'for', 'with',
]);

/** Normaliza a minúsculas sin acentos y parte en palabras ≥3 chars, sin stopwords. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_-]+/i)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Una nota encontrada por {@link searchVault} (con excerpt recortado). */
export interface VaultMatch {
  path: string;
  title: string;
  folder: string;
  tags: string[];
  excerpt: string;
}

/**
 * Mapa compacto del vault: estructura top-level con conteos. ~300 tok típicos.
 * Sirve para que el modelo sepa qué hay (proyectos, áreas, etc.) sin ver detalles.
 */
export async function buildVaultMap(): Promise<string> {
  const rows = await db
    .select({ folder: notes_cache.folder, title: notes_cache.title })
    .from(notes_cache)
    .where(
      or(...STRATEGIC_PREFIXES.map((p) => sql`${notes_cache.folder} LIKE ${p + '%'}`))
    );

  // Agrupa por folder de 1er o 2do nivel.
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const parts = r.folder.split('/').filter(Boolean);
    const key = parts.slice(0, 2).join('/');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.title);
  }

  if (!groups.size) return '(vault vacío o sin sincronizar)';

  const sections: string[] = [];
  for (const [folder, titles] of [...groups.entries()].sort()) {
    const sample = titles.slice(0, 8).map((t) => `[[${t}]]`).join(', ');
    const more = titles.length > 8 ? ` (+${titles.length - 8} más)` : '';
    sections.push(`- **${folder}** (${titles.length}): ${sample}${more}`);
  }
  return sections.join('\n');
}

/**
 * Búsqueda por relevancia: tokeniza el query, busca en title/tags/folder/excerpt
 * con score ponderado, devuelve top N. ~1.5K tok para 12 notas.
 */
export async function searchVault(query: string, limit = 12): Promise<VaultMatch[]> {
  const words = tokenize(query);
  if (!words.length) return [];

  // Construye condición OR sobre todas las palabras vs cada campo (ILIKE acento-insensible aproximado).
  const conds = words.map((w) => {
    const pat = `%${w}%`;
    return sql`(
      ${notes_cache.title} ILIKE ${pat}
      OR ${notes_cache.folder} ILIKE ${pat}
      OR ${notes_cache.body_excerpt} ILIKE ${pat}
      OR EXISTS (SELECT 1 FROM unnest(${notes_cache.tags}) tag WHERE tag ILIKE ${pat})
    )`;
  });

  // Score = peso por dónde matchea cada palabra
  const scoreExpr = sql.join(
    words.map((w) => {
      const pat = `%${w}%`;
      return sql`(
        (CASE WHEN ${notes_cache.title} ILIKE ${pat} THEN 5 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM unnest(${notes_cache.tags}) t WHERE t ILIKE ${pat}) THEN 3 ELSE 0 END) +
        (CASE WHEN ${notes_cache.folder} ILIKE ${pat} THEN 2 ELSE 0 END) +
        (CASE WHEN ${notes_cache.body_excerpt} ILIKE ${pat} THEN 1 ELSE 0 END)
      )`;
    }),
    sql` + `
  );

  const rows = await db
    .select({
      path: notes_cache.path,
      title: notes_cache.title,
      folder: notes_cache.folder,
      tags: notes_cache.tags,
      body_excerpt: notes_cache.body_excerpt,
      score: sql<number>`${scoreExpr}`.as('score'),
    })
    .from(notes_cache)
    .where(sql.join(conds, sql` OR `))
    .orderBy(sql`score DESC`)
    .limit(limit);

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    folder: r.folder,
    tags: r.tags,
    excerpt: r.body_excerpt.slice(0, 140),
  }));
}

/** Formatea matches como lista Markdown con wikilinks, tags y excerpt. */
export function renderMatches(matches: VaultMatch[]): string {
  if (!matches.length) return '(sin notas relevantes)';
  return matches
    .map((n) => {
      const tagStr = n.tags.length ? ` [${n.tags.map((t) => '#' + t).join(' ')}]` : '';
      return `- [[${n.title}]] (${n.folder})${tagStr}${n.excerpt ? ' — ' + n.excerpt : ''}`;
    })
    .join('\n');
}

/** Estimación grosera de tokens (~4 chars/token) para acotar el contexto. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
