'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Sistema } from '@/db';

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
/* Buffer                                                             */
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

/* ================================================================== */
/* Root                                                               */
/* ================================================================== */

export default function SistemasManager({ initial }: { initial: Sistema[] }) {
  const [items, setItems] = useState<Sistema[]>(initial);
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
                {s.orden != null && (
                  <Chip>#{s.orden}</Chip>
                )}
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

/* ================================================================== */
/* View                                                              */
/* ================================================================== */

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
          <h2 className="text-2xl font-bold tracking-tight">
            {selected.nombre}
          </h2>
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

/* ================================================================== */
/* Editor                                                            */
/* ================================================================== */

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
        <textarea
          value={buffer.contenido}
          onChange={(e) => upd({ contenido: e.target.value })}
          rows={10}
          className={textareaCls}
        />
      </div>
    </div>
  );
}
