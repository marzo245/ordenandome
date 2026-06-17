/**
 * Asistente de IA para notas Obsidian.
 *
 * Dos capacidades: crear una nota nueva desde una descripción
 * ({@link aiCreateNote} → JSON con título, carpeta, scope, tags y contenido) y
 * editar el contenido de una existente ({@link aiEditNote}) en varios modos
 * (mejorar, expandir, resumir, continuar o instrucción libre). Usa las tools
 * del vault para evitar duplicados y mantener wikilinks coherentes.
 */
import { runAgent } from './ai-agent';

const MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

const SYSTEM = `Eres un editor de notas markdown experto. Recibes el contenido actual de una nota Obsidian (puede tener frontmatter YAML, wikilinks [[...]], callouts, código, etc.) y una instrucción del usuario.

REGLAS:
- Devuelve SOLO el contenido nuevo de la nota, en markdown puro. Sin explicaciones previas, sin "Aquí está...", sin envolverlo en \`\`\`markdown\`\`\`.
- Preserva el frontmatter YAML (--- al inicio) si existe, salvo que la instrucción explícitamente pida cambiarlo.
- Preserva wikilinks [[X]] y enlaces existentes salvo que la instrucción los modifique.
- Mantén el idioma del original (si está en español, responde en español).
- No inventes hechos ni URLs.
- Si la nota está vacía y el usuario pide crear contenido, créalo desde cero.`;

/** Modos de edición asistida de una nota (`custom` = instrucción libre del usuario). */
export type AiMode = 'improve' | 'expand' | 'summarize' | 'continue' | 'custom';

const QUICK_PROMPTS: Record<Exclude<AiMode, 'custom'>, string> = {
  improve: 'Mejora la redacción, gramática y claridad. Conserva la estructura y los puntos clave. No agregues contenido nuevo.',
  expand: 'Expande las ideas existentes con más detalle, ejemplos y matices, manteniendo el tono y la estructura.',
  summarize: 'Resume el contenido en versión corta, conservando los puntos clave en bullets concisos.',
  continue: 'Continúa la nota donde se quedó, añadiendo el siguiente bloque coherente con el resto.',
};

const CREATE_SYSTEM = (vaultMap: string) => `Eres un asistente que genera notas markdown para un vault de Obsidian con estructura PARA.

## Mapa del vault del usuario

${vaultMap}

## Herramientas

Tienes herramientas para consultar el vault. Úsalas si necesitas validar si una nota similar ya existe (evitar duplicados) o decidir la carpeta correcta:
- search_vault(query) — busca por palabras clave
- read_note(path) — lee detalle
- list_active_projects() — proyectos activos

NO las uses si la descripción es muy específica y autocontenida (ej. "resumen de event sourcing").

## Salida

Devuelves un JSON estricto:

{
  "title": "Título corto en español, sin extensión .md, sin caracteres / \\\\ : * ? \\" < > |",
  "filename": "kebab-case-del-titulo",
  "suggestedFolder": "una de las carpetas conocidas del vault, o vacío",
  "scope": "work" | "personal" | "study",
  "tags": ["tag-1", "tag-2"],
  "content": "Contenido markdown completo de la nota"
}

REGLAS
- Devuelve SOLO el JSON, sin envolturas \`\`\`json.
- Español (salvo que el input esté en otro idioma).
- "content" debe ser markdown real y útil, NO placeholder.
- Frontmatter YAML al inicio del content con scope y tags.
- "suggestedFolder" debe existir en el vault; si dudas, usa search_vault para verificar.
- Wikilinks [[X]] solo si verificaste que existen.
- No inventes URLs ni hechos.`;

/** Resultado de {@link aiCreateNote}: la nota generada lista para crear en el vault. */
interface CreateNoteOutput {
  title: string;
  filename: string;
  suggestedFolder: string;
  scope: 'work' | 'personal' | 'study';
  tags: string[];
  content: string;
}

/**
 * Genera una nota nueva a partir de una descripción libre (usa Gemini).
 * Sanea el título/filename y valida `scope`; degrada a defaults si la IA falla.
 * @param prompt Descripción de la nota a crear.
 * @param vaultMap Mapa del vault para grounding.
 * @param preferredFolder Carpeta forzada por el usuario (si la hay).
 * @throws Si la IA no devuelve un título usable.
 */
export async function aiCreateNote(
  prompt: string,
  vaultMap: string,
  preferredFolder?: string
): Promise<CreateNoteOutput> {
  const user = JSON.stringify({
    descripcion: prompt,
    carpeta_preferida: preferredFolder || null,
  });

  const result = await runAgent({
    system: CREATE_SYSTEM(vaultMap),
    messages: [{ role: 'user', content: user }],
    temperature: 0.4,
    responseFormat: 'json_object',
    tools: true,
    maxToolHops: 3,
    provider: 'gemini',
  });
  const parsed = JSON.parse(result.content) as Partial<CreateNoteOutput>;

  const title = String(parsed.title ?? '').trim().replace(/[<>:"\\|?*/]/g, '').slice(0, 120);
  if (!title) throw new Error('La IA no devolvió un título válido');
  const filename = (parsed.filename || title)
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'nota';

  const folder = preferredFolder || String(parsed.suggestedFolder ?? '').trim().replace(/^\/+|\/+$/g, '');
  const scope = (['work', 'personal', 'study'] as const).includes(parsed.scope as never)
    ? (parsed.scope as 'work' | 'personal' | 'study')
    : 'study';

  return {
    title,
    filename,
    suggestedFolder: folder,
    scope,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [],
    content: String(parsed.content ?? `# ${title}\n\n`),
  };
}

/**
 * Reescribe el contenido de una nota según el modo elegido.
 * Modos cosméticos van a Groq (rápido); los de razonamiento a Gemini (calidad).
 * Quita el cercado ```markdown``` si el modelo lo añade.
 * @returns El nuevo contenido Markdown de la nota.
 */
export async function aiEditNote(
  content: string,
  mode: AiMode,
  customInstruction?: string,
  vaultMap?: string
): Promise<string> {
  const instruction =
    mode === 'custom' ? (customInstruction?.trim() || 'Mejora la nota.') : QUICK_PROMPTS[mode];

  const systemFull = vaultMap
    ? `${SYSTEM}\n\n## Mapa del vault (referencia para wikilinks coherentes)\n\n${vaultMap}\n\nPuedes usar search_vault o read_note si necesitas validar referencias antes de tocar el contenido. NO las uses para cambios cosméticos.`
    : SYSTEM;

  const user = `INSTRUCCIÓN:\n${instruction}\n\n---\nCONTENIDO ACTUAL DE LA NOTA:\n${content || '(nota vacía)'}`;

  // Modos cosméticos → Groq (rápido). Modos con razonamiento → Gemini (calidad).
  const heavyModes: AiMode[] = ['custom', 'expand', 'continue'];
  const provider = heavyModes.includes(mode) ? 'gemini' : 'groq';

  const result = await runAgent({
    system: systemFull,
    messages: [{ role: 'user', content: user }],
    temperature: 0.5,
    tools: !!vaultMap,
    maxToolHops: 2,
    provider,
  });
  let text = result.content.trim();
  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) text = fenced[1].trim();
  return text;
}
