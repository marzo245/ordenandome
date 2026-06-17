/**
 * Acceso al vault Obsidian, que vive como repo de GitHub.
 *
 * Cubre dos cosas: (1) E/S contra GitHub (listar, leer, escribir notas vía
 * Octokit) y (2) el parseo de una nota Markdown a {@link ParsedNote} —
 * frontmatter, scope inferido, tags, wikilinks y las tareas embebidas
 * (`- [ ] ...` con emojis de fecha/prioridad estilo Obsidian Tasks).
 *
 * Las tareas extraídas llevan un `fingerprint` estable para deduplicar entre
 * sincronizaciones sucesivas.
 */
import { Octokit } from 'octokit';
import matter from 'gray-matter';
import { createHash } from 'node:crypto';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/** Resuelve owner/repo/branch del vault desde el entorno. @throws si falta o mal formado. */
function repo() {
  const full = process.env.OBSIDIAN_VAULT_REPO;
  if (!full) throw new Error('OBSIDIAN_VAULT_REPO no configurado');
  const [owner, name] = full.split('/');
  if (!owner || !name) throw new Error('OBSIDIAN_VAULT_REPO formato owner/repo');
  return { owner, name, branch: process.env.OBSIDIAN_VAULT_BRANCH || 'main' };
}

/** Entrada del árbol git del vault: ruta + SHA del blob + tamaño. */
export interface VaultFile {
  path: string;
  sha: string;
  size: number;
}

/** Una nota ya parseada: metadatos + cuerpo derivado (excerpt, enlaces, tareas). */
export interface ParsedNote {
  path: string;
  title: string;
  scope: 'work' | 'personal' | 'study' | 'unknown';
  folder: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  bodyExcerpt: string;
  linksTo: string[];
  tasks: ParsedTask[];
  raw: string;
}

/** Una tarea embebida en una nota (checkbox Markdown con metadatos Obsidian Tasks). */
export interface ParsedTask {
  text: string;
  done: boolean;
  line: number;
  due: string | null;
  deadline: string | null;
  priority: 'baja' | 'media' | 'alta';
  tags: string[];
  /** SHA1 estable del path+line+textNormalizado para dedupe entre syncs */
  fingerprint: string;
}

/** Lista todos los .md del vault usando el git tree (1 sola llamada). */
export async function listVaultMarkdown(): Promise<VaultFile[]> {
  const { owner, name, branch } = repo();
  const ref = await octokit.rest.git.getRef({ owner, repo: name, ref: `heads/${branch}` });
  const tree = await octokit.rest.git.getTree({
    owner,
    repo: name,
    tree_sha: ref.data.object.sha,
    recursive: 'true',
  });
  return tree.data.tree
    .filter((n) => n.type === 'blob' && n.path?.endsWith('.md'))
    .map((n) => ({ path: n.path!, sha: n.sha!, size: n.size ?? 0 }));
}

/** Trae el contenido raw de una nota. */
export async function getNoteContent(path: string): Promise<{ content: string; sha: string }> {
  const { owner, name, branch } = repo();
  const res = await octokit.rest.repos.getContent({ owner, repo: name, path, ref: branch });
  const data = res.data as { content?: string; encoding?: string; sha: string };
  if (!data.content) throw new Error(`Sin contenido: ${path}`);
  const content = Buffer.from(data.content, (data.encoding as BufferEncoding) || 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

/** Trae múltiples blobs vía getBlob (necesario porque listVaultMarkdown solo da SHAs). */
export async function getBlob(sha: string): Promise<string> {
  const { owner, name } = repo();
  const res = await octokit.rest.git.getBlob({ owner, repo: name, file_sha: sha });
  return Buffer.from(res.data.content, (res.data.encoding as BufferEncoding) || 'base64').toString('utf-8');
}

/** Escribe (crea o actualiza) una nota en el vault. Si pasas `expectedSha` y no coincide, GitHub rechaza con 409. */
export async function writeNote(
  path: string,
  content: string,
  message: string,
  expectedSha?: string
): Promise<{ sha: string; commit: string }> {
  const { owner, name, branch } = repo();
  const res = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo: name,
    path,
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
    sha: expectedSha,
  });
  return {
    sha: res.data.content?.sha ?? '',
    commit: res.data.commit.sha ?? '',
  };
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

/** Extrae los destinos de wikilinks `[[Nota]]` (ignora alias y anclas), sin duplicados. */
function extractWikilinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

/** Decide el scope de la nota: respeta el frontmatter `scope` y, si no, lo infiere del path. */
function inferScope(path: string, fmScope: unknown): ParsedNote['scope'] {
  if (typeof fmScope === 'string') {
    const s = fmScope.toLowerCase();
    if (s === 'work' || s === 'personal' || s === 'study') return s;
  }
  const lower = path.toLowerCase();
  if (lower.includes('enel') || lower.includes('trabajo')) return 'work';
  if (lower.includes('diario') || lower.includes('personal') || lower.includes('inbox')) return 'personal';
  if (
    lower.includes('knowledge') ||
    lower.includes('recursos') ||
    lower.includes('certificaciones') ||
    lower.includes('areas')
  ) return 'study';
  return 'unknown';
}

/** Normaliza los tags del frontmatter (array o string separado por comas/espacios) a `string[]`. */
function normalizeTags(fmTags: unknown): string[] {
  if (Array.isArray(fmTags)) return fmTags.map(String);
  if (typeof fmTags === 'string') return fmTags.split(/[,\s]+/).filter(Boolean);
  return [];
}

const TASK_LINE_RE = /^(\s*)-\s*\[([ xX])\]\s+(.+)$/;
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
const DEADLINE_RE = /⏳\s*(\d{4}-\d{2}-\d{2})/;
const TAG_RE = /(?:^|\s)#([A-Za-z0-9_-][\w/-]*)/g;

/** Deriva la prioridad de una tarea según los emojis de prioridad de Obsidian Tasks. */
function priorityFromMarks(text: string): 'baja' | 'media' | 'alta' {
  if (/⏫|🔼|🔴/.test(text)) return 'alta';
  if (/🔽|⬇️|🟢/.test(text)) return 'baja';
  return 'media';
}

/** Limpia el texto de una tarea quitando fechas, emojis de prioridad y tags. */
function normalizeText(text: string): string {
  return text
    .replace(DUE_RE, '')
    .replace(DEADLINE_RE, '')
    .replace(/[⏫🔼🔴🔽⬇️🟢]/g, '')
    .replace(/(^|\s)#[A-Za-z0-9_-][\w/-]*/g, '')
    .trim();
}

/** SHA1 (16 chars) de path+línea+texto normalizado: identidad estable para dedupe entre syncs. */
function fingerprintTask(path: string, line: number, text: string): string {
  return createHash('sha1').update(`${path}::${line}::${normalizeText(text)}`).digest('hex').slice(0, 16);
}

/** Recorre el cuerpo y extrae todas las tareas-checkbox con sus metadatos y línea. */
export function extractTasks(path: string, body: string): ParsedTask[] {
  const out: ParsedTask[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_LINE_RE);
    if (!m) continue;
    const rawText = m[3];
    const due = rawText.match(DUE_RE)?.[1] ?? null;
    const deadline = rawText.match(DEADLINE_RE)?.[1] ?? null;
    const tags: string[] = [];
    for (const tm of rawText.matchAll(TAG_RE)) tags.push(tm[1]);
    out.push({
      text: normalizeText(rawText),
      done: m[2].toLowerCase() === 'x',
      line: i,
      due,
      deadline,
      priority: priorityFromMarks(rawText),
      tags,
      fingerprint: fingerprintTask(path, i, rawText),
    });
  }
  return out;
}

/** Parsea el Markdown crudo de una nota a {@link ParsedNote} (frontmatter + cuerpo derivado). */
export function parseNote(path: string, raw: string): ParsedNote {
  const parsed = matter(raw);
  const fm = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content ?? '';
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const fileName = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
  const title = typeof fm.title === 'string' ? fm.title : fileName;
  const excerpt = body.replace(/\s+/g, ' ').trim().slice(0, 280);
  return {
    path,
    title,
    scope: inferScope(path, fm.scope),
    folder,
    frontmatter: fm,
    tags: normalizeTags(fm.tags),
    bodyExcerpt: excerpt,
    linksTo: extractWikilinks(body),
    tasks: extractTasks(path, body),
    raw,
  };
}
