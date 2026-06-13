'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidBlock from './MermaidBlock';

type Scope = 'work' | 'personal' | 'study' | 'unknown';

interface NoteRow {
  path: string;
  title: string;
  scope: Scope;
  folder: string;
  tags: string[];
  body_excerpt: string;
  updated_at: string | Date;
}

interface NoteDetail {
  path: string;
  sha: string;
  title: string;
  scope: Scope;
  folder: string;
  tags: string[];
  content: string;
  backlinks: string[];
  links_to: string[];
}

const SCOPES: { value: Scope | 'all'; label: string }[] = [
  { value: 'all', label: 'todas' },
  { value: 'work', label: 'trabajo' },
  { value: 'personal', label: 'personal' },
  { value: 'study', label: 'estudio' },
  { value: 'unknown', label: 'sin clasificar' },
];

export default function NotesBrowser({ initial }: { initial: NoteRow[] }) {
  const [notes, setNotes] = useState<NoteRow[]>(initial);
  const [scope, setScope] = useState<Scope | 'all'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const initialOpenRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [aiMode, setAiMode] = useState<null | 'menu' | 'custom'>(null);
  const [aiCustom, setAiCustom] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrev, setAiPrev] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newFolder, setNewFolder] = useState(''); // override opcional desde el + del árbol
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [proposal, setProposal] = useState<null | {
    title: string;
    filename: string;
    folder: string;
    suggestedFolder: string;
    scope: 'work' | 'personal' | 'study';
    tags: string[];
    content: string;
    path: string;
    folderLocked: boolean; // true si el usuario llegó por + sobre carpeta
  }>(null);
  const [editFolderOpen, setEditFolderOpen] = useState(false);
  const [attachments, setAttachments] = useState<
    { name: string; ext: string; chars: number; approx_tokens: number; truncated: boolean; text: string }[]
  >([]);
  const [attaching, setAttaching] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialOpenRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    if (open) {
      initialOpenRef.current = true;
      openNote(decodeURIComponent(open));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return notes.filter((n) => {
      if (scope !== 'all' && n.scope !== scope) return false;
      if (!ql) return true;
      return (
        n.title.toLowerCase().includes(ql) ||
        n.body_excerpt.toLowerCase().includes(ql) ||
        n.folder.toLowerCase().includes(ql) ||
        n.tags.some((t) => t.toLowerCase().includes(ql))
      );
    });
  }, [notes, scope, q]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Índice para resolver wikilinks: basename (sin .md, lowercased) → path completo.
  // Si hay colisiones, gana la primera; podría refinarse con preferencia por carpeta del actual.
  const nameIndex = useMemo(() => {
    const idx = new Map<string, string>();
    for (const n of notes) {
      const base = n.path.split('/').pop()!.replace(/\.md$/, '').toLowerCase();
      if (!idx.has(base)) idx.set(base, n.path);
      // También indexa por path completo sin .md para wikilinks tipo [[carpeta/nota]]
      const full = n.path.replace(/\.md$/, '').toLowerCase();
      if (!idx.has(full)) idx.set(full, n.path);
    }
    return idx;
  }, [notes]);

  function resolveWikilink(target: string): string | null {
    const cleaned = target.trim().replace(/^\.?\/+/, '').replace(/#.*$/, '');
    const key = cleaned.toLowerCase();
    return (
      nameIndex.get(key) ??
      nameIndex.get(key.replace(/\.md$/, '')) ??
      nameIndex.get(key.split('/').pop() ?? '') ??
      nameIndex.get((key.split('/').pop() ?? '').replace(/\.md$/, '')) ??
      null
    );
  }

  function isInternalHref(href: string): boolean {
    if (!href) return false;
    if (/^[a-z]+:/i.test(href) && !href.startsWith('wiki:')) return false; // http, mailto, etc.
    if (href.startsWith('#')) return false;
    return true;
  }
  const searching = q.trim().length > 0;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Al seleccionar una nota, expande sus carpetas padre una sola vez (no bloquea futuros toggles).
  useEffect(() => {
    if (!selected?.folder) return;
    const parts = selected.folder.split('/').filter(Boolean);
    const acc: string[] = [];
    const next: Record<string, boolean> = {};
    for (const p of parts) {
      acc.push(p);
      next[acc.join('/')] = true;
    }
    setExpanded((s) => ({ ...s, ...next }));
  }, [selected?.path]);

  function toggle(folderPath: string) {
    setExpanded((s) => ({ ...s, [folderPath]: !(s[folderPath] ?? false) }));
  }

  function isExpanded(folderPath: string): boolean {
    if (searching) return true;
    return expanded[folderPath] ?? false;
  }

  async function openNote(path: string) {
    setLoading(true);
    setEditing(false);
    setSaveErr(null);
    try {
      const enc = path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/notes/${enc}`);
      if (!res.ok) throw new Error(await res.text());
      const data: NoteDetail = await res.json();
      setSelected(data);
      setDraft(data.content);
    } catch (e) {
      setSelected(null);
      alert(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const enc = selected.path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/notes/${enc}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: draft, sha: selected.sha }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSaveErr('La nota cambió en GitHub. Recarga para ver la versión actual.');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'save failed');
      setSelected({ ...selected, content: draft, sha: data.sha });
      setEditing(false);
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setDraft((d) => d + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/notes/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'upload failed');
      insertAtCursor(`![${data.alt || ''}](${data.url})\n`);
    } catch (e) {
      alert(`Error subiendo imagen: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const img = items.find((it) => it.type.startsWith('image/'));
    if (!img) return;
    const file = img.getAsFile();
    if (!file) return;
    e.preventDefault();
    uploadImage(file);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    for (const f of files) uploadImage(f);
  }

  async function runAi(mode: 'improve' | 'expand' | 'summarize' | 'continue' | 'custom', instruction?: string) {
    setAiLoading(true);
    try {
      const res = await fetch('/api/notes/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: draft, mode, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ai failed');
      setAiPrev(draft);
      setDraft(data.content);
      setAiMode(null);
      setAiCustom('');
    } catch (e) {
      alert(`Error IA: ${(e as Error).message}`);
    } finally {
      setAiLoading(false);
    }
  }

  function undoAi() {
    if (aiPrev == null) return;
    setDraft(aiPrev);
    setAiPrev(null);
  }

  const allFolders = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) if (n.folder) set.add(n.folder);
    return [...set].sort();
  }, [notes]);

  function computePath(folder: string, filename: string): string {
    const f = folder.replace(/^\/+|\/+$/g, '');
    let base = f ? `${f}/${filename}.md` : `${filename}.md`;
    let suffix = 1;
    while (notes.some((n) => n.path.toLowerCase() === base.toLowerCase())) {
      base = (f ? `${f}/${filename}` : filename) + `-${suffix}.md`;
      suffix++;
    }
    return base;
  }

  async function attachFile(file: File) {
    setAttaching(true);
    setCreateErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/notes/extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'extract failed');
      setAttachments((a) => [...a, data]);
    } catch (e) {
      setCreateErr(`Archivo: ${(e as Error).message}`);
    } finally {
      setAttaching(false);
    }
  }

  function buildPromptWithAttachments(): string {
    const base = newPrompt.trim();
    if (!attachments.length) return base;
    const ctx = attachments
      .map((a) => `### Archivo: ${a.name}\n\n${a.text}`)
      .join('\n\n---\n\n');
    return `${base}\n\n## Contexto adicional (archivos adjuntos)\n\n${ctx}`;
  }

  async function generateProposal() {
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const prompt = buildPromptWithAttachments();
      if (!prompt.trim()) throw new Error('Describe la nota o adjunta un archivo');

      const folderLocked = !!newFolder.trim();
      const aiRes = await fetch('/api/notes/create-ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, folder: folderLocked ? newFolder : undefined }),
      });
      const ai = await aiRes.json();
      if (!aiRes.ok) throw new Error(ai.error ?? 'IA falló');

      const folder = (folderLocked ? newFolder : ai.suggestedFolder || '').replace(/^\/+|\/+$/g, '');
      const path = computePath(folder, ai.filename);

      setProposal({
        title: ai.title,
        filename: ai.filename,
        folder,
        suggestedFolder: ai.suggestedFolder || '',
        scope: ai.scope,
        tags: ai.tags || [],
        content: ai.content,
        path,
        folderLocked,
      });
      setEditFolderOpen(false);
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally {
      setCreateBusy(false);
    }
  }

  function changeProposalFolder(folder: string) {
    if (!proposal) return;
    const clean = folder.replace(/^\/+|\/+$/g, '');
    const path = computePath(clean, proposal.filename);
    setProposal({ ...proposal, folder: clean, path });
  }

  async function confirmProposal() {
    if (!proposal) return;
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const enc = proposal.path.split('/').map(encodeURIComponent).join('/');
      const putRes = await fetch(`/api/notes/${enc}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: proposal.content, message: `create ${proposal.path} via IA` }),
      });
      const putData = await putRes.json();
      if (!putRes.ok) throw new Error(putData.error ?? 'create failed');

      const listRes = await fetch('/api/notes?limit=500');
      if (listRes.ok) setNotes(await listRes.json());

      const path = proposal.path;
      const content = proposal.content;
      setCreating(false);
      setProposal(null);
      setNewPrompt('');
      setNewFolder('');
      setEditFolderOpen(false);
      setAttachments([]);
      await openNote(path);
      setEditing(true);
      setDraft(content);
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally {
      setCreateBusy(false);
    }
  }

  function cancelCreate() {
    setCreating(false);
    setProposal(null);
    setNewPrompt('');
    setNewFolder('');
    setCreateErr(null);
    setEditFolderOpen(false);
    setAttachments([]);
  }

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/notes/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'sync failed');
      setSyncMsg(`✓ ${data.updated} actualizadas / ${data.total} total / ${data.removed} eliminadas`);
      const listRes = await fetch('/api/notes?limit=500');
      if (listRes.ok) setNotes(await listRes.json());
    } catch (e) {
      setSyncMsg(`✗ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
      <aside className="lg:col-span-2 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={`mono text-xs px-2 py-1 border ${
                scope === s.value
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--muted)]'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => {
              setCreating(true);
              setCreateErr(null);
              setNewPrompt('');
              setNewFolder(selected?.folder ?? '');
            }}
            className="mono text-xs px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white ml-auto"
          >
            ✨ + nueva
          </button>
          <button
            onClick={sync}
            disabled={syncing}
            className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            {syncing ? 'sync…' : '↻ sync'}
          </button>
        </div>
        {creating && !proposal && (
          <div className="border border-[var(--accent)] bg-[var(--surface)] p-3 space-y-2">
            <div className="mono text-xs font-semibold text-[var(--accent)]">✨ Nueva nota con IA</div>
            <p className="mono text-[10px] text-[var(--muted)]">
              {newFolder
                ? `Carpeta fija: ${newFolder}`
                : 'La IA decide la carpeta. Luego apruebas o cambias.'}
            </p>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generateProposal();
              }}
              placeholder="ej. resume este PDF y dame puntos clave en bullets"
              autoFocus
              rows={3}
              className="w-full bg-[var(--bg)] border border-[var(--border)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)] resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => attachInputRef.current?.click()}
                disabled={attaching}
                className="mono text-[10px] px-2 py-1 border border-[var(--border)] text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                {attaching ? 'extrayendo…' : '📎 adjuntar archivo'}
              </button>
              <input
                ref={attachInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.json,.yaml,.yml,.csv,.tsv,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.swift,.sh,.sql,.html,.css,.scss,.xml,.log"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) attachFile(f);
                  e.target.value = '';
                }}
              />
              <span className="mono text-[10px] text-[var(--muted)]">⌘/Ctrl + Enter para generar</span>
            </div>
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a, i) => (
                  <li
                    key={`${a.name}-${i}`}
                    className="flex items-center gap-2 mono text-[10px] px-2 py-1 border border-[var(--border)] bg-[var(--bg)]"
                  >
                    <span>📄</span>
                    <span className="truncate flex-1">{a.name}</span>
                    <span className="text-[var(--muted)] shrink-0">
                      ~{a.approx_tokens.toLocaleString()} tok{a.truncated ? ' · truncado' : ''}
                    </span>
                    <button
                      onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                      className="text-[var(--muted)] hover:text-[var(--danger)]"
                    >
                      ×
                    </button>
                  </li>
                ))}
                <li className="mono text-[10px] text-[var(--muted)] pl-2">
                  total ≈{' '}
                  {attachments.reduce((s, a) => s + a.approx_tokens, 0).toLocaleString()} tokens
                  (límite contexto: 128K)
                </li>
              </ul>
            )}
            {createErr && <div className="mono text-xs text-[var(--danger)]">{createErr}</div>}
            <div className="flex gap-2">
              <button
                onClick={generateProposal}
                disabled={createBusy || !newPrompt.trim()}
                className="mono text-xs px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
              >
                {createBusy ? 'generando…' : '✨ generar propuesta'}
              </button>
              <button
                onClick={cancelCreate}
                disabled={createBusy}
                className="mono text-xs px-2 py-1 text-[var(--muted)] hover:underline"
              >
                cancelar
              </button>
            </div>
          </div>
        )}

        {creating && proposal && (
          <div className="border border-[var(--accent)] bg-[var(--surface)] p-3 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="mono text-xs font-semibold text-[var(--accent)]">Propuesta</div>
              <span className="mono text-[10px] text-[var(--muted)]">apruébala o cámbiala</span>
            </div>
            <div>
              <div className="mono text-[10px] text-[var(--muted)]">Título</div>
              <div className="text-sm font-medium">{proposal.title}</div>
            </div>
            <div>
              <div className="mono text-[10px] text-[var(--muted)] flex items-center gap-2">
                Carpeta sugerida
                {proposal.folderLocked && (
                  <span className="text-[var(--accent)]">(fijada por ti)</span>
                )}
                {!proposal.folderLocked && !editFolderOpen && (
                  <button
                    onClick={() => setEditFolderOpen(true)}
                    className="text-[var(--accent)] hover:underline"
                  >
                    cambiar
                  </button>
                )}
              </div>
              {editFolderOpen ? (
                <div className="flex gap-1 mt-0.5">
                  <input
                    list="notes-folders"
                    value={proposal.folder}
                    onChange={(e) => changeProposalFolder(e.target.value)}
                    placeholder="(raíz)"
                    className="flex-1 bg-[var(--bg)] border border-[var(--border)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                  <button
                    onClick={() => setEditFolderOpen(false)}
                    className="mono text-xs px-2 text-[var(--muted)] hover:underline"
                  >
                    ok
                  </button>
                </div>
              ) : (
                <div className="text-sm">{proposal.folder || <em className="text-[var(--muted)]">raíz</em>}</div>
              )}
              <div className="mono text-[10px] text-[var(--muted)] mt-1 truncate">→ {proposal.path}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="mono text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--accent)]">
                {proposal.scope}
              </span>
              {proposal.tags.map((t) => (
                <span
                  key={t}
                  className="mono text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--muted)]"
                >
                  #{t}
                </span>
              ))}
            </div>
            <details>
              <summary className="mono text-[10px] text-[var(--muted)] cursor-pointer hover:text-[var(--accent)]">
                ver contenido
              </summary>
              <pre className="mono text-[10px] mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap bg-[var(--bg)] border border-[var(--border)] p-2">
                {proposal.content}
              </pre>
            </details>
            <datalist id="notes-folders">
              {allFolders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            {createErr && <div className="mono text-xs text-[var(--danger)]">{createErr}</div>}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={confirmProposal}
                disabled={createBusy}
                className="mono text-xs px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
              >
                {createBusy ? 'creando…' : '✓ aprobar y crear'}
              </button>
              <button
                onClick={generateProposal}
                disabled={createBusy}
                className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                ↻ regenerar
              </button>
              <button
                onClick={cancelCreate}
                disabled={createBusy}
                className="mono text-xs px-2 py-1 text-[var(--muted)] hover:underline ml-auto"
              >
                cancelar
              </button>
            </div>
          </div>
        )}
        {syncMsg && <p className="mono text-xs text-[var(--muted)]">{syncMsg}</p>}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar título, texto, carpeta, tag…"
          className="w-full bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <p className="mono text-xs text-[var(--muted)]">{filtered.length} notas</p>
        <div className="border border-[var(--border)] bg-[var(--surface)] max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--muted)]">
              sin notas — corre sync para importar tu vault
            </div>
          ) : (
            <TreeView
              node={tree}
              depth={0}
              selectedPath={selected?.path ?? null}
              onSelect={openNote}
              isExpanded={isExpanded}
              toggle={toggle}
              onCreateInFolder={(folder) => {
                setCreating(true);
                setCreateErr(null);
                setNewPrompt('');
                setNewFolder(folder);
              }}
            />
          )}
        </div>
      </aside>

      <section className="lg:col-span-3 border border-[var(--border)] bg-[var(--surface)] min-h-[60vh]">
        {loading && <div className="p-6 mono text-xs text-[var(--muted)]">cargando…</div>}
        {!loading && !selected && (
          <div className="p-6 text-sm text-[var(--muted)]">selecciona una nota</div>
        )}
        {!loading && selected && (
          <article className="p-4 sm:p-6">
            <header className="mb-4 pb-3 border-b border-[var(--border)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mono text-[10px] text-[var(--muted)] mb-1 truncate">{selected.folder || '/'}</div>
                  <h2 className="text-lg font-semibold">{selected.title}</h2>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {!editing && (
                    <button
                      onClick={() => {
                        setDraft(selected.content);
                        setEditing(true);
                        setSaveErr(null);
                      }}
                      className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--accent)] hover:underline"
                    >
                      ✎ editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!editing) {
                        setDraft(selected.content);
                        setEditing(true);
                      }
                      setAiMode('menu');
                    }}
                    disabled={aiLoading}
                    className="mono text-xs px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
                  >
                    ✨ IA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editing) {
                        setDraft(selected.content);
                        setEditing(true);
                      }
                      requestAnimationFrame(() => fileInputRef.current?.click());
                    }}
                    disabled={uploading}
                    className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--accent)] hover:underline disabled:opacity-50"
                  >
                    {uploading ? 'subiendo…' : '🖼️ imagen'}
                  </button>
                  {editing && (
                    <>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setDraft(selected.content);
                          setSaveErr(null);
                          setAiMode(null);
                        }}
                        className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--muted)] hover:underline"
                      >
                        cancelar
                      </button>
                      <button
                        onClick={save}
                        disabled={saving || draft === selected.content}
                        className="mono text-xs px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:underline disabled:opacity-50"
                      >
                        {saving ? 'guardando…' : '✓ guardar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="mono text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--accent)]">
                  {selected.scope}
                </span>
                {selected.tags.map((t) => (
                  <span
                    key={t}
                    className="mono text-[10px] px-1.5 py-0.5 border border-[var(--border)] text-[var(--muted)]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              {saveErr && (
                <div className="mt-2 mono text-xs text-[var(--danger)]">{saveErr}</div>
              )}
            </header>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f);
                e.target.value = '';
              }}
            />
            {editing ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  {aiPrev !== null && (
                    <button
                      type="button"
                      onClick={undoAi}
                      className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--muted)] hover:underline"
                    >
                      ↶ deshacer IA
                    </button>
                  )}
                  <span className="mono text-[10px] text-[var(--muted)] ml-auto">
                    pega o arrastra imágenes en el editor para subirlas
                  </span>
                </div>
                {aiMode === 'menu' && (
                  <div className="border border-[var(--border)] bg-[var(--bg)] p-2 flex flex-wrap gap-2">
                    {(
                      [
                        ['improve', 'mejorar'],
                        ['expand', 'expandir'],
                        ['summarize', 'resumir'],
                        ['continue', 'continuar'],
                      ] as const
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        onClick={() => runAi(m)}
                        disabled={aiLoading}
                        className="mono text-xs px-2 py-1 border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                      >
                        {aiLoading ? '…' : label}
                      </button>
                    ))}
                    <button
                      onClick={() => setAiMode('custom')}
                      disabled={aiLoading}
                      className="mono text-xs px-2 py-1 border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    >
                      instrucción libre…
                    </button>
                    <button
                      onClick={() => setAiMode(null)}
                      className="mono text-xs px-2 py-1 text-[var(--muted)] hover:underline ml-auto"
                    >
                      cerrar
                    </button>
                  </div>
                )}
                {aiMode === 'custom' && (
                  <div className="border border-[var(--border)] bg-[var(--bg)] p-2 space-y-2">
                    <textarea
                      value={aiCustom}
                      onChange={(e) => setAiCustom(e.target.value)}
                      placeholder="ej. tradúcelo a inglés, conviértelo en lista de bullets, añade una sección de ejemplos…"
                      className="mono w-full bg-[var(--surface)] border border-[var(--border)] p-2 text-xs outline-none focus:border-[var(--accent)] min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => runAi('custom', aiCustom)}
                        disabled={aiLoading || !aiCustom.trim()}
                        className="mono text-xs px-2 py-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
                      >
                        {aiLoading ? 'procesando…' : 'aplicar'}
                      </button>
                      <button
                        onClick={() => setAiMode(null)}
                        className="mono text-xs px-2 py-1 text-[var(--muted)] hover:underline"
                      >
                        cancelar
                      </button>
                    </div>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={onPaste}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  spellCheck={false}
                  className="mono w-full min-h-[60vh] bg-[var(--bg)] border border-[var(--border)] p-3 text-xs leading-relaxed outline-none focus:border-[var(--accent)] resize-y"
                />
              </div>
            ) : (
            <div className="text-sm leading-relaxed prose-notes">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => url}
                components={{
                  h1: (p) => <h2 className="text-base font-semibold text-[var(--accent)] mt-4 mb-2" {...p} />,
                  h2: (p) => <h3 className="text-sm font-semibold text-[var(--accent)] mt-4 mb-1" {...p} />,
                  h3: (p) => <h4 className="text-sm font-semibold mt-3 mb-1" {...p} />,
                  p: (p) => <p className="mb-2" {...p} />,
                  ul: (p) => <ul className="list-disc ml-5 space-y-0.5 mb-2" {...p} />,
                  ol: (p) => <ol className="list-decimal ml-5 space-y-1 mb-2" {...p} />,
                  a: ({ href, children, ...rest }) => {
                    if (typeof href === 'string' && isInternalHref(href)) {
                      const target = href.startsWith('wiki:')
                        ? decodeURIComponent(href.slice(5))
                        : decodeURIComponent(href);
                      const resolved = resolveWikilink(target);
                      if (resolved) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              openNote(resolved);
                            }}
                            className="text-[var(--accent)] hover:underline inline bg-transparent border-0 p-0 cursor-pointer"
                          >
                            {children}
                          </button>
                        );
                      }
                      return (
                        <span
                          className="text-[var(--muted)] italic underline decoration-dotted"
                          title={`No encontrado: ${target}`}
                        >
                          {children}
                        </span>
                      );
                    }
                    return (
                      <a className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer" href={href} {...rest}>
                        {children}
                      </a>
                    );
                  },
                  code: ({ className, children, ...rest }) => {
                    const lang = /language-(\w+)/.exec(className ?? '')?.[1];
                    const raw = String(children ?? '').replace(/\n$/, '');
                    if (lang === 'mermaid') {
                      return <MermaidBlock code={raw} />;
                    }
                    return (
                      <code
                        className={`mono text-xs bg-[var(--bg)] px-1 py-0.5 border border-[var(--border)] ${className ?? ''}`}
                        {...rest}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre: (p) => (
                    <pre
                      className="mono text-xs bg-[var(--bg)] border border-[var(--border)] p-3 overflow-x-auto my-3"
                      {...p}
                    />
                  ),
                  blockquote: (p) => (
                    <blockquote
                      className="border-l-2 border-[var(--accent)] pl-3 my-2 text-[var(--muted)] italic"
                      {...p}
                    />
                  ),
                  table: (p) => (
                    <div className="overflow-x-auto my-3">
                      <table className="border-collapse text-xs" {...p} />
                    </div>
                  ),
                  th: (p) => (
                    <th className="border border-[var(--border)] px-2 py-1 bg-[var(--bg)] text-left" {...p} />
                  ),
                  td: (p) => <td className="border border-[var(--border)] px-2 py-1 align-top" {...p} />,
                  input: (p) =>
                    p.type === 'checkbox' ? (
                      <input
                        {...p}
                        disabled
                        className="mr-1 accent-[var(--accent)] align-middle"
                      />
                    ) : (
                      <input {...p} />
                    ),
                  hr: () => <hr className="border-[var(--border)] my-3" />,
                  img: (p) => (
                    // imágenes externas (http) sí se renderizan; embeds Obsidian ya se transforman a > 📎
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      {...p}
                      alt={p.alt ?? ''}
                      className="max-w-full border border-[var(--border)] my-2"
                    />
                  ),
                }}
              >
                {prepareMarkdown(selected.content)}
              </ReactMarkdown>
            </div>
            )}
            {selected.backlinks.length > 0 && (
              <footer className="mt-6 pt-3 border-t border-[var(--border)]">
                <h4 className="mono text-xs text-[var(--muted)] mb-2">backlinks</h4>
                <ul className="space-y-1">
                  {selected.backlinks.map((b) => (
                    <li key={b}>
                      <button
                        onClick={() => openNote(b)}
                        className="text-xs text-[var(--accent)] hover:underline mono"
                      >
                        ← {b}
                      </button>
                    </li>
                  ))}
                </ul>
              </footer>
            )}
          </article>
        )}
      </section>
    </div>
  );
}

interface TreeNode {
  name: string;
  path: string; // folder path (relative to vault root)
  folders: TreeNode[];
  notes: NoteRow[];
}

function buildTree(rows: NoteRow[]): TreeNode {
  const root: TreeNode = { name: '', path: '', folders: [], notes: [] };
  const getChild = (parent: TreeNode, name: string, fullPath: string): TreeNode => {
    let found = parent.folders.find((f) => f.name === name);
    if (!found) {
      found = { name, path: fullPath, folders: [], notes: [] };
      parent.folders.push(found);
    }
    return found;
  };
  for (const n of rows) {
    if (!n.folder) {
      root.notes.push(n);
      continue;
    }
    const parts = n.folder.split('/').filter(Boolean);
    let cur = root;
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      cur = getChild(cur, p, acc);
    }
    cur.notes.push(n);
  }
  sortTree(root);
  return root;
}

const FOLDER_META: Record<string, { label: string; icon: string; order: number }> = {
  '00-inbox': { label: 'Inbox', icon: '📥', order: 0 },
  '01-proyectos': { label: 'Proyectos', icon: '🎯', order: 1 },
  '02-areas': { label: 'Áreas', icon: '🌳', order: 2 },
  '03-recursos': { label: 'Recursos', icon: '📚', order: 3 },
  '06 knowledge': { label: 'Conocimiento', icon: '🧠', order: 4 },
  '04-diario': { label: 'Diario', icon: '📅', order: 5 },
  '05-mocs': { label: 'MOCs', icon: '🗺️', order: 6 },
  '04 repositories': { label: 'Repositorios', icon: '💾', order: 7 },
  '04 resources': { label: 'Adjuntos', icon: '📎', order: 8 },
  '06 tasks': { label: 'Tareas', icon: '✅', order: 90 },
  '90 templates': { label: 'Plantillas', icon: '📋', order: 91 },
  '99 archive': { label: 'Archivo', icon: '🗄️', order: 99 },
};

function folderMeta(rawName: string, depth: number) {
  if (depth === 0) {
    const m = FOLDER_META[rawName.toLowerCase()];
    if (m) return m;
  }
  // Strip leading "00-" / "00 " patterns for deeper folders too
  const clean = rawName.replace(/^\d+[\s-]+/, '');
  return { label: clean, icon: '', order: 1000 };
}

function sortTree(node: TreeNode, depth = 0) {
  node.folders.sort((a, b) => {
    const ma = folderMeta(a.name, depth);
    const mb = folderMeta(b.name, depth);
    if (ma.order !== mb.order) return ma.order - mb.order;
    return ma.label.localeCompare(mb.label);
  });
  node.notes.sort((a, b) => a.title.localeCompare(b.title));
  for (const f of node.folders) sortTree(f, depth + 1);
}

function folderNoteCount(node: TreeNode): number {
  let n = node.notes.length;
  for (const f of node.folders) n += folderNoteCount(f);
  return n;
}

function TreeView({
  node,
  depth,
  selectedPath,
  onSelect,
  isExpanded,
  toggle,
  onCreateInFolder,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isExpanded: (path: string) => boolean;
  toggle: (path: string) => void;
  onCreateInFolder: (folder: string) => void;
}) {
  return (
    <ul>
      {node.folders.map((f) => {
        const open = isExpanded(f.path);
        const meta = folderMeta(f.name, depth);
        const isTop = depth === 0;
        return (
          <li key={`f:${f.path}`}>
            <div
              className={`group flex items-center gap-1 hover:bg-[var(--bg)] ${
                isTop ? 'text-sm font-medium' : 'text-sm'
              }`}
            >
              <button
                onClick={() => toggle(f.path)}
                className="flex-1 text-left flex items-center gap-1.5 px-2 py-1 min-w-0"
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                <span className="mono text-[10px] text-[var(--muted)] w-3">{open ? '▾' : '▸'}</span>
                {meta.icon && <span className="text-xs">{meta.icon}</span>}
                <span className="truncate">{meta.label}</span>
                <span className="mono text-[10px] text-[var(--muted)] ml-auto">
                  {folderNoteCount(f)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateInFolder(f.path);
                }}
                title={`Nueva nota en ${f.path}`}
                className="opacity-0 group-hover:opacity-100 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white px-2 py-1 mono text-sm leading-none"
              >
                +
              </button>
            </div>
            {open && (
              <TreeView
                node={f}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                isExpanded={isExpanded}
                toggle={toggle}
                onCreateInFolder={onCreateInFolder}
              />
            )}
          </li>
        );
      })}
      {node.notes.map((n) => (
        <li key={`n:${n.path}`}>
          <button
            onClick={() => onSelect(n.path)}
            className={`w-full text-left flex items-center gap-1 px-2 py-1 hover:bg-[var(--bg)] ${
              selectedPath === n.path ? 'bg-[var(--bg)]' : ''
            }`}
            style={{ paddingLeft: 8 + (depth + 1) * 12 }}
          >
            <span className="mono text-[10px] text-[var(--muted)] w-3">·</span>
            <span className="text-sm truncate">{n.title}</span>
            <span className="mono text-[10px] text-[var(--muted)] ml-auto shrink-0">{n.scope}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + 4).replace(/^\r?\n/, '');
}

function transformEmbeds(md: string): string {
  // ![[image.png]] o ![[archivo.pdf|alias]] — Obsidian-style. Lo dejamos como referencia visible.
  return md.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
    const label = alias || target;
    return `> 📎 embed: **${label}**`;
  });
}

function transformCallouts(md: string): string {
  // > [!note] Title  → "> 💡 Title" simplificado (sin formato extra por ahora)
  const icons: Record<string, string> = {
    note: '📝', info: 'ℹ️', tip: '💡', warning: '⚠️', danger: '🔥',
    error: '❌', success: '✅', question: '❓', quote: '💬', example: '🧪',
    abstract: '📄', summary: '📄', todo: '☑️', bug: '🐞', important: '❗',
  };
  return md.replace(
    /^>\s*\[!(\w+)\][+-]?\s*(.*)$/gim,
    (_m, type, rest) => {
      const icon = icons[type.toLowerCase()] ?? '📌';
      return `> ${icon} **${rest || type}**`;
    }
  );
}

function renderWikilinks(md: string): string {
  return md.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
    const label = alias || target;
    const t = encodeURIComponent(String(target).trim());
    return `[${label}](wiki:${t})`;
  });
}

function prepareMarkdown(md: string): string {
  return renderWikilinks(transformCallouts(transformEmbeds(stripFrontmatter(md))));
}
