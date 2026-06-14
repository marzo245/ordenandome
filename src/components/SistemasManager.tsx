'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AccionPaso, Sistema, SistemaSeccion } from '@/db';

/* ------------------------------------------------------------------ */
/* Markdown rendering (shared)                                         */
/* ------------------------------------------------------------------ */

const MD_COMPONENTS = {
  h1: (p: object) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
  h2: (p: object) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
  h3: (p: object) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
  p: (p: object) => <p className="mb-2" {...p} />,
  strong: (p: object) => <strong className="font-semibold text-[var(--text)]" {...p} />,
  em: (p: object) => <em className="italic text-[var(--muted)]" {...p} />,
  ul: (p: object) => <ul className="list-disc list-outside ml-5 space-y-0.5 mb-2" {...p} />,
  ol: (p: object) => <ol className="list-decimal list-outside ml-5 space-y-1 mb-2" {...p} />,
  li: (p: object) => <li className="text-[var(--text)]" {...p} />,
  a: (p: object) => (
    <a
      className="text-[var(--accent)] hover:underline"
      target="_blank"
      rel="noreferrer"
      {...p}
    />
  ),
  code: (p: object) => (
    <code
      className="mono text-xs bg-[var(--bg)] px-1 py-0.5 border border-[var(--border)]"
      {...p}
    />
  ),
  hr: () => <hr className="border-[var(--border)] my-3" />,
};

function Markdown({ value }: { value: string | null }) {
  if (!value || !value.trim()) {
    return <p className="text-sm text-[var(--muted)]">—</p>;
  }
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {value}
      </ReactMarkdown>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Textarea markdown con pegar/arrastrar imágenes (mismo patrón Notas)  */
/* ------------------------------------------------------------------ */

function MarkdownImageTextarea({
  value,
  onChange,
  rows,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function insertAtCursor(text: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/notes/upload-image', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error((data as { error?: string }).error ?? `subida falló (${res.status})`);
      }
      insertAtCursor(`![${data.alt || ''}](${data.url})\n`);
    } catch (e) {
      setErr(`Error subiendo imagen: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  // Extrae el primer archivo de imagen de un DataTransfer (items o files).
  function imageFrom(dt: DataTransfer | null): File | null {
    if (!dt) return null;
    for (const it of Array.from(dt.items ?? [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
    for (const f of Array.from(dt.files ?? [])) {
      if (f.type.startsWith('image/')) return f;
    }
    return null;
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = imageFrom(e.clipboardData);
    if (!file) return; // no hay imagen → deja el pegado normal (texto)
    e.preventDefault();
    void uploadImage(file);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const file = imageFrom(e.dataTransfer);
    if (!file) return;
    e.preventDefault();
    void uploadImage(file);
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {uploading && (
        <span className="absolute top-1.5 right-2 text-[11px] text-[var(--muted)] mono bg-[var(--bg)] px-1 rounded">
          subiendo…
        </span>
      )}
      {err && <p className="text-xs text-[var(--danger)] mt-1">{err}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared style tokens                                                 */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)]';
const textareaCls = `${inputCls} font-mono leading-relaxed resize-y`;
const labelCls =
  'block text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1';

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1.5">
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">
      {children}
    </span>
  );
}

/* ================================================================== */
/* Root — tabs (Sistemas / Acciones), igual que KO (Catálogo / Subprocesos) */
/* ================================================================== */

export default function SistemasManager({
  initial,
  initialSections,
}: {
  initial: Sistema[];
  initialSections: SistemaSeccion[];
}) {
  const [tab, setTab] = useState<'sistemas' | 'acciones'>('sistemas');

  // Estado compartido entre pestañas: la de Acciones necesita los sistemas
  // para asociar cada acción a uno.
  const [items, setItems] = useState<Sistema[]>(initial);
  const [sections, setSections] = useState<SistemaSeccion[]>(initialSections);

  // Resincroniza cuando el server re-renderiza tras router.refresh()
  // (p. ej. tras crear/editar desde el asistente de IA).
  useEffect(() => {
    setItems(initial);
  }, [initial]);
  useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs (Notion-style underline) */}
      <div className="flex items-center gap-5 border-b border-[var(--border)]">
        <TabButton active={tab === 'sistemas'} onClick={() => setTab('sistemas')}>
          Sistemas
        </TabButton>
        <TabButton active={tab === 'acciones'} onClick={() => setTab('acciones')}>
          Acciones
        </TabButton>
      </div>

      {tab === 'sistemas' ? (
        <SistemasTab items={items} setItems={setItems} />
      ) : (
        <AccionesTab
          items={items}
          sections={sections}
          setSections={setSections}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px pb-2 text-sm transition-colors border-b-2 ${
        active
          ? 'border-[var(--text)] text-[var(--text)] font-medium'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}

/* ================================================================== */
/* Tab 1 — Sistemas                                                   */
/* ================================================================== */

type SistemaBuffer = {
  nombre: string;
  descripcion: string;
  rol: string;
  url: string;
  contenido: string;
  orden: string;
};

function sistemaToBuffer(s: Sistema): SistemaBuffer {
  return {
    nombre: s.nombre ?? '',
    descripcion: s.descripcion ?? '',
    rol: s.rol ?? '',
    url: s.url ?? '',
    contenido: s.contenido ?? '',
    orden: s.orden != null ? String(s.orden) : '0',
  };
}

function SistemasTab({
  items,
  setItems,
}: {
  items: Sistema[];
  setItems: React.Dispatch<React.SetStateAction<Sistema[]>>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<SistemaBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((s) => s.id === selectedId) ?? null,
    [items, selectedId],
  );

  function closeModal() {
    setSelectedId(null);
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  function select(id: string) {
    setSelectedId(id);
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  function startEdit() {
    if (!selected) return;
    setBuffer(sistemaToBuffer(selected));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  async function createNew() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sistemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'Nuevo sistema' }),
      });
      if (!res.ok) throw new Error(`POST falló (${res.status})`);
      const created: Sistema = await res.json();
      setItems((prev) => [...prev, created]);
      setSelectedId(created.id);
      setBuffer(sistemaToBuffer(created));
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected || !buffer) return;
    setBusy(true);
    setError(null);
    try {
      const ordenNum = buffer.orden.trim() === '' ? 0 : Number(buffer.orden);
      const res = await fetch(`/api/sistemas/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: buffer.nombre.trim() || 'Sin nombre',
          descripcion: buffer.descripcion || null,
          rol: buffer.rol || null,
          url: buffer.url || null,
          contenido: buffer.contenido || null,
          orden: Number.isNaN(ordenNum) ? 0 : ordenNum,
        }),
      });
      if (!res.ok) throw new Error(`PATCH falló (${res.status})`);
      const updated: Sistema = await res.json();
      setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditing(false);
      setBuffer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!confirm(`¿Eliminar "${selected.nombre}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sistemas/${selected.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`DELETE falló (${res.status})`);
      const removedId = selected.id;
      setItems((prev) => prev.filter((s) => s.id !== removedId));
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={createNew}
          disabled={busy}
          className="shrink-0 text-sm px-3 py-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          + Nuevo sistema
        </button>
      </div>

      {/* List */}
      <div>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">
            Sin sistemas aún. Crea el primero.
          </p>
        ) : (
          <div className="flex flex-col">
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id)}
                className={`flex items-center gap-3 text-left px-3 py-2.5 rounded border-b border-[var(--border)] hover:bg-[var(--surface-hover)] ${
                  s.id === selectedId ? 'bg-[var(--surface-hover)]' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--text)] truncate">
                    {s.nombre}
                  </div>
                  {s.rol && (
                    <div className="text-xs text-[var(--muted)] truncate">
                      {s.rol}
                    </div>
                  )}
                </div>
                {s.orden != null && <Chip>#{s.orden}</Chip>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={closeModal}
        >
          <div
            className="bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {error && (
              <div className="mb-3 text-sm text-[var(--danger)]">{error}</div>
            )}

            {editing && buffer ? (
              <SistemaEditor
                buffer={buffer}
                setBuffer={setBuffer}
                busy={busy}
                onSave={save}
                onCancel={cancelEdit}
                onRemove={remove}
              />
            ) : (
              <SistemaView
                selected={selected}
                onEdit={startEdit}
                onClose={closeModal}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SistemaView({
  selected,
  onEdit,
  onClose,
}: {
  selected: Sistema;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {selected.orden != null && (
            <div className="mono text-[11px] text-[var(--muted)] font-medium mb-1">
              #{selected.orden}
            </div>
          )}
          <h2 className="text-2xl font-bold tracking-tight">{selected.nombre}</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--accent)]"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)]"
          >
            Cerrar
          </button>
        </div>
      </div>

      {selected.rol && (
        <div>
          <SubLabel>Rol</SubLabel>
          <p className="text-sm leading-relaxed text-[var(--text)] whitespace-pre-wrap">
            {selected.rol}
          </p>
        </div>
      )}

      {selected.url && (
        <div>
          <SubLabel>URL</SubLabel>
          <a
            href={selected.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--accent)] hover:underline break-all"
          >
            {selected.url}
          </a>
        </div>
      )}

      {selected.descripcion && (
        <div>
          <SubLabel>Descripción</SubLabel>
          <p className="text-sm leading-relaxed text-[var(--text)] whitespace-pre-wrap">
            {selected.descripcion}
          </p>
        </div>
      )}

      <div>
        <SubLabel>Documentación</SubLabel>
        <Markdown value={selected.contenido} />
      </div>
    </div>
  );
}

function SistemaEditor({
  buffer,
  setBuffer,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  buffer: SistemaBuffer;
  setBuffer: (b: SistemaBuffer) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<SistemaBuffer>) =>
    setBuffer({ ...buffer, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--danger)] disabled:opacity-50 ml-auto"
        >
          Eliminar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Nombre</label>
          <input
            type="text"
            value={buffer.nombre}
            onChange={(e) => upd({ nombre: e.target.value })}
            className={`${inputCls} text-lg font-semibold`}
          />
        </div>
        <div>
          <label className={labelCls}>Orden</label>
          <input
            type="number"
            value={buffer.orden}
            onChange={(e) => upd({ orden: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Rol</label>
        <textarea
          value={buffer.rol}
          onChange={(e) => upd({ rol: e.target.value })}
          rows={2}
          placeholder="Qué papel cumple este sistema en el flujo"
          className={`${inputCls} resize-y`}
        />
      </div>

      <div>
        <label className={labelCls}>URL</label>
        <input
          type="text"
          value={buffer.url}
          onChange={(e) => upd({ url: e.target.value })}
          placeholder="https://…"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Descripción</label>
        <textarea
          value={buffer.descripcion}
          onChange={(e) => upd({ descripcion: e.target.value })}
          rows={3}
          className={`${inputCls} resize-y`}
        />
      </div>

      <div>
        <label className={labelCls}>Documentación (markdown)</label>
        <MarkdownImageTextarea
          value={buffer.contenido}
          onChange={(v) => upd({ contenido: v })}
          rows={10}
          placeholder="Documentación… pega o arrastra imágenes (Ctrl/⌘+V)"
          className={textareaCls}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 2 — Acciones (por fuera; cada una asociada a un sistema)        */
/* ================================================================== */

type AccionBuffer = {
  sistema_id: string;
  titulo: string;
  tipo: string;
  contenido: string;
  orden: string;
  pasos: AccionPaso[];
};

function accionToBuffer(s: SistemaSeccion): AccionBuffer {
  return {
    sistema_id: s.sistema_id ?? '',
    titulo: s.titulo ?? '',
    tipo: s.tipo ?? 'acción',
    contenido: s.contenido ?? '',
    orden: s.orden != null ? String(s.orden) : '0',
    pasos: Array.isArray(s.pasos) ? s.pasos : [],
  };
}

function AccionesTab({
  items,
  sections,
  setSections,
}: {
  items: Sistema[];
  sections: SistemaSeccion[];
  setSections: React.Dispatch<React.SetStateAction<SistemaSeccion[]>>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<AccionBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sistemaFilter, setSistemaFilter] = useState('Todos');

  const sistemaName = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((s) => map.set(s.id, s.nombre));
    return (id: string) => map.get(id) ?? 'Sistema desconocido';
  }, [items]);

  const selected = useMemo(
    () => sections.find((s) => s.id === selectedId) ?? null,
    [sections, selectedId],
  );

  // Acciones ordenadas y agrupadas por sistema (respetando el orden de items).
  const grouped = useMemo(() => {
    const filtered =
      sistemaFilter === 'Todos'
        ? sections
        : sections.filter((s) => s.sistema_id === sistemaFilter);
    return items
      .map((sistema) => ({
        sistema,
        acciones: filtered
          .filter((a) => a.sistema_id === sistema.id)
          .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo)),
      }))
      .filter((g) => g.acciones.length > 0);
  }, [items, sections, sistemaFilter]);

  function select(id: string) {
    setSelectedId(id);
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  function startEdit() {
    if (!selected) return;
    setBuffer(accionToBuffer(selected));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  async function createNew() {
    if (items.length === 0) {
      setError('Crea primero un sistema en la pestaña «Sistemas».');
      return;
    }
    setBusy(true);
    setError(null);
    // Por defecto, asociamos al sistema filtrado (o al primero).
    const sistemaId =
      sistemaFilter !== 'Todos' ? sistemaFilter : items[0].id;
    const count = sections.filter((s) => s.sistema_id === sistemaId).length;
    try {
      const res = await fetch('/api/sistemas/secciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sistema_id: sistemaId,
          titulo: 'Nueva acción',
          tipo: 'acción',
          contenido: '',
          orden: count + 1,
        }),
      });
      if (!res.ok) throw new Error(`POST falló (${res.status})`);
      const created: SistemaSeccion = await res.json();
      setSections((prev) => [...prev, created]);
      setSelectedId(created.id);
      setBuffer(accionToBuffer(created));
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear acción');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected || !buffer) return;
    if (!buffer.sistema_id) {
      setError('Elige a qué sistema pertenece la acción.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ordenNum = buffer.orden.trim() === '' ? 0 : Number(buffer.orden);
      const res = await fetch(`/api/sistemas/secciones/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sistema_id: buffer.sistema_id,
          titulo: buffer.titulo.trim() || 'Sin título',
          tipo: buffer.tipo.trim() || 'acción',
          contenido: buffer.contenido || null,
          orden: Number.isNaN(ordenNum) ? 0 : ordenNum,
          // Solo pasos con sistema y algún contenido (se descartan filas vacías).
          pasos: buffer.pasos.filter(
            (p) => p.sistema_id && (p.accion.trim() || p.dato.trim()),
          ),
        }),
      });
      if (!res.ok) throw new Error(`PATCH falló (${res.status})`);
      const updated: SistemaSeccion = await res.json();
      setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditing(false);
      setBuffer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar acción');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!confirm(`¿Eliminar la acción "${selected.titulo}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sistemas/secciones/${selected.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`DELETE falló (${res.status})`);
      const removedId = selected.id;
      setSections((prev) => prev.filter((s) => s.id !== removedId));
      setSelectedId(null);
      setEditing(false);
      setBuffer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar acción');
    } finally {
      setBusy(false);
    }
  }

  const upd = (patch: Partial<AccionBuffer>) =>
    buffer && setBuffer({ ...buffer, ...patch });

  // --- helpers de pasos (flujo multi-sistema) ---
  function addPaso() {
    if (!buffer) return;
    const sistemaId = buffer.sistema_id || items[0]?.id || '';
    upd({ pasos: [...buffer.pasos, { sistema_id: sistemaId, accion: '', dato: '' }] });
  }
  function updPaso(i: number, patch: Partial<AccionPaso>) {
    if (!buffer) return;
    upd({ pasos: buffer.pasos.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  }
  function removePaso(i: number) {
    if (!buffer) return;
    upd({ pasos: buffer.pasos.filter((_, j) => j !== i) });
  }
  function movePaso(i: number, dir: -1 | 1) {
    if (!buffer) return;
    const j = i + dir;
    if (j < 0 || j >= buffer.pasos.length) return;
    const next = [...buffer.pasos];
    [next[i], next[j]] = [next[j], next[i]];
    upd({ pasos: next });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: filtro por sistema + nueva acción */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSistemaFilter('Todos')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              sistemaFilter === 'Todos'
                ? 'border-[var(--text)] text-[var(--text)] font-medium'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Todos
          </button>
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSistemaFilter(s.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                sistemaFilter === s.id
                  ? 'border-[var(--text)] text-[var(--text)] font-medium'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {s.nombre}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={createNew}
          disabled={busy}
          className="shrink-0 text-sm px-3 py-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          + Nueva acción
        </button>
      </div>

      {error && !selected && (
        <div className="text-sm text-[var(--danger)]">{error}</div>
      )}

      {/* Master-detail */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* List (agrupada por sistema) */}
        <div
          className={`${
            selectedId ? 'hidden md:block' : 'block'
          } w-full md:w-72 md:shrink-0 md:border-r md:border-[var(--border)] md:pr-4`}
        >
          {grouped.length === 0 ? (
            <p className="text-sm text-[var(--muted)] px-2 py-4">
              {items.length === 0
                ? 'Crea primero un sistema, luego añade acciones aquí.'
                : 'Sin acciones todavía. Crea la primera con «+ Nueva acción».'}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(({ sistema, acciones }) => (
                <div key={sistema.id}>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] px-2 mb-1">
                    {sistema.nombre}
                  </div>
                  <div className="flex flex-col">
                    {acciones.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => select(a.id)}
                        className={`text-left px-2 py-1.5 rounded text-sm hover:bg-[var(--surface-hover)] flex items-center gap-2 ${
                          a.id === selectedId
                            ? 'bg-[var(--surface-hover)] font-medium'
                            : ''
                        }`}
                      >
                        <span className="truncate flex-1">{a.titulo}</span>
                        {a.pasos && a.pasos.length > 0 && (
                          <span
                            className="text-[10px] text-[var(--muted)] shrink-0"
                            title={`Flujo de ${a.pasos.length} pasos entre sistemas`}
                          >
                            ⛓ {a.pasos.length}
                          </span>
                        )}
                        {a.tipo && (
                          <span className="text-[10px] text-[var(--muted)] shrink-0">
                            {a.tipo}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail / editor */}
        <div className={`${selectedId ? 'block' : 'hidden md:block'} flex-1 min-w-0`}>
          {!selected ? (
            <div className="h-full flex items-center justify-center py-16">
              <p className="text-sm text-[var(--muted)]">
                Selecciona o crea una acción
              </p>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setEditing(false);
                  setBuffer(null);
                }}
                className="md:hidden text-sm text-[var(--muted)] hover:text-[var(--text)] mb-3"
              >
                ← volver
              </button>

              {error && (
                <div className="mb-3 text-sm text-[var(--danger)]">{error}</div>
              )}

              {editing && buffer ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={save}
                      disabled={busy}
                      className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? 'Guardando…' : 'Guardar acción'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busy}
                      className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)] disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={remove}
                      disabled={busy}
                      className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--danger)] disabled:opacity-50 ml-auto"
                    >
                      Eliminar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Sistema</label>
                      <select
                        value={buffer.sistema_id}
                        onChange={(e) => upd({ sistema_id: e.target.value })}
                        className={inputCls}
                      >
                        {items.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Tipo</label>
                        <input
                          type="text"
                          value={buffer.tipo}
                          onChange={(e) => upd({ tipo: e.target.value })}
                          placeholder="acción"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Orden</label>
                        <input
                          type="number"
                          value={buffer.orden}
                          onChange={(e) => upd({ orden: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Acción</label>
                    <input
                      type="text"
                      value={buffer.titulo}
                      onChange={(e) => upd({ titulo: e.target.value })}
                      placeholder="Qué se puede hacer"
                      className={`${inputCls} text-lg font-semibold`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Detalle (markdown)</label>
                    <MarkdownImageTextarea
                      value={buffer.contenido}
                      onChange={(v) => upd({ contenido: v })}
                      rows={6}
                      placeholder="Pasos, requisitos o notas… pega o arrastra imágenes (Ctrl/⌘+V)"
                      className={textareaCls}
                    />
                  </div>

                  {/* Pasos del flujo multi-sistema */}
                  <div className="border-t border-[var(--border)] pt-4">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <label className={`${labelCls} mb-0`}>
                        Flujo entre sistemas
                      </label>
                      <button
                        type="button"
                        onClick={addPaso}
                        className="text-sm px-2 py-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)]"
                      >
                        + Paso
                      </button>
                    </div>
                    <p className="text-xs text-[var(--muted)] mb-3">
                      Si la acción atraviesa varios sistemas: añade un paso por
                      sistema, indicando qué haces y qué dato sacas para el siguiente.
                      Déjalo vacío si es de un solo sistema.
                    </p>

                    {buffer.pasos.length === 0 ? (
                      <p className="text-sm text-[var(--muted)] py-1">
                        Sin pasos. Acción de un solo sistema.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {buffer.pasos.map((paso, i) => (
                          <div
                            key={i}
                            className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="mono text-[11px] text-[var(--muted)] font-medium">
                                Paso {i + 1}
                              </span>
                              <select
                                value={paso.sistema_id}
                                onChange={(e) =>
                                  updPaso(i, { sistema_id: e.target.value })
                                }
                                className={`${inputCls} flex-1`}
                              >
                                {items.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nombre}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => movePaso(i, -1)}
                                disabled={i === 0}
                                className="text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 px-1"
                                title="Subir"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => movePaso(i, 1)}
                                disabled={i === buffer.pasos.length - 1}
                                className="text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 px-1"
                                title="Bajar"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => removePaso(i)}
                                className="text-[var(--muted)] hover:text-[var(--danger)] px-1"
                                title="Eliminar paso"
                              >
                                ×
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={paso.accion}
                                onChange={(e) =>
                                  updPaso(i, { accion: e.target.value })
                                }
                                placeholder="Qué haces aquí"
                                className={inputCls}
                              />
                              <input
                                type="text"
                                value={paso.dato}
                                onChange={(e) =>
                                  updPaso(i, { dato: e.target.value })
                                }
                                placeholder="Dato que obtienes →"
                                className={inputCls}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Chip>{sistemaName(selected.sistema_id)}</Chip>
                        {selected.tipo && (
                          <span className="text-[11px] text-[var(--muted)]">
                            {selected.tipo}
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight">
                        {selected.titulo}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={startEdit}
                      className="shrink-0 text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--accent)]"
                    >
                      Editar
                    </button>
                  </div>

                  {selected.pasos && selected.pasos.length > 0 && (
                    <div>
                      <SubLabel>Flujo entre sistemas</SubLabel>
                      <ol className="flex flex-col gap-2">
                        {selected.pasos.map((paso, i) => (
                          <li
                            key={i}
                            className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="mono text-[11px] text-[var(--muted)]">
                                {i + 1}
                              </span>
                              <Chip>{sistemaName(paso.sistema_id)}</Chip>
                            </div>
                            {paso.accion && (
                              <p className="text-sm text-[var(--text)]">
                                {paso.accion}
                              </p>
                            )}
                            {paso.dato && (
                              <p className="text-xs text-[var(--muted)] mt-0.5">
                                → dato: {paso.dato}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <div>
                    <SubLabel>Detalle</SubLabel>
                    <Markdown value={selected.contenido} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
