'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KoEntry, KoSubproceso } from '@/db';
import KoAiChat from './KoAiChat';

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

const SISTEMA_FILTERS = ['Todos', 'Salesforce', 'Opera', 'SAP', 'eCO'];

/* ================================================================== */
/* Root                                                               */
/* ================================================================== */

export default function KoManager({
  initialEntries,
  initialSubprocesos,
}: {
  initialEntries: KoEntry[];
  initialSubprocesos: KoSubproceso[];
}) {
  const [tab, setTab] = useState<'catalogo' | 'subprocesos'>('catalogo');

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs (Notion-style underline) */}
      <div className="flex items-center gap-5 border-b border-[var(--border)]">
        <TabButton active={tab === 'catalogo'} onClick={() => setTab('catalogo')}>
          Catálogo
        </TabButton>
        <TabButton
          active={tab === 'subprocesos'}
          onClick={() => setTab('subprocesos')}
        >
          Subprocesos
        </TabButton>
      </div>

      {tab === 'catalogo' ? (
        <CatalogoTab initial={initialEntries} />
      ) : (
        <SubprocesosTab initial={initialSubprocesos} />
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
/* Tab 1 — Catálogo (KOs)                                             */
/* ================================================================== */

type EntryBuffer = {
  codigo: string;
  error: string;
  eco_notes: string;
  sistema: string;
  flujo: string;
  clasificacion: string;
  causa_raiz: string;
  sistema_solucion: string;
  responsable: string;
  subprocesos: string; // CSV
  resolucion: string;
  documentacion: string;
  flujograma_url: string;
};

function entryToBuffer(e: KoEntry): EntryBuffer {
  return {
    codigo: e.codigo ?? '',
    error: e.error ?? '',
    eco_notes: e.eco_notes ?? '',
    sistema: e.sistema ?? '',
    flujo: e.flujo != null ? String(e.flujo) : '',
    clasificacion: e.clasificacion ?? '',
    causa_raiz: e.causa_raiz ?? '',
    sistema_solucion: e.sistema_solucion ?? '',
    responsable: e.responsable ?? '',
    subprocesos: (e.subprocesos ?? []).join(', '),
    resolucion: e.resolucion ?? '',
    documentacion: e.documentacion ?? '',
    flujograma_url: e.flujograma_url ?? '',
  };
}

function CatalogoTab({ initial }: { initial: KoEntry[] }) {
  const [entries, setEntries] = useState<KoEntry[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<EntryBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const [sistemaFilter, setSistemaFilter] = useState('Todos');
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (sistemaFilter !== 'Todos' && (e.sistema ?? '') !== sistemaFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (e.codigo ?? '').toLowerCase().includes(q) ||
        (e.error ?? '').toLowerCase().includes(q) ||
        (e.causa_raiz ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, sistemaFilter, query]);

  function select(id: string) {
    setSelectedId(id);
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  function startEdit() {
    if (!selected) return;
    setBuffer(entryToBuffer(selected));
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
      const res = await fetch('/api/ko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'NUEVO', error: 'Nuevo error' }),
      });
      if (!res.ok) throw new Error(`POST falló (${res.status})`);
      const created: KoEntry = await res.json();
      setEntries((prev) => [...prev, created]);
      setSelectedId(created.id);
      setBuffer(entryToBuffer(created));
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
      const subprocesos = buffer.subprocesos
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const flujoNum = buffer.flujo.trim() === '' ? null : Number(buffer.flujo);
      const res = await fetch(`/api/ko/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: buffer.codigo.trim() || null,
          error: buffer.error,
          eco_notes: buffer.eco_notes || null,
          sistema: buffer.sistema || null,
          flujo: Number.isNaN(flujoNum as number) ? null : flujoNum,
          clasificacion: buffer.clasificacion || null,
          causa_raiz: buffer.causa_raiz || null,
          sistema_solucion: buffer.sistema_solucion || null,
          responsable: buffer.responsable || null,
          subprocesos,
          resolucion: buffer.resolucion || null,
          documentacion: buffer.documentacion || null,
          flujograma_url: buffer.flujograma_url || null,
        }),
      });
      if (!res.ok) throw new Error(`PATCH falló (${res.status})`);
      const updated: KoEntry = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
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
    if (!confirm(`¿Eliminar "${selected.codigo}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ko/${selected.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE falló (${res.status})`);
      const removedId = selected.id;
      setEntries((prev) => prev.filter((e) => e.id !== removedId));
      setSelectedId(null);
      setEditing(false);
      setBuffer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: filters + new */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {SISTEMA_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSistemaFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                sistemaFilter === s
                  ? 'border-[var(--text)] text-[var(--text)] font-medium'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar código, error, causa…"
            className={`${inputCls} sm:w-64`}
          />
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="shrink-0 text-sm px-3 py-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)]"
          >
            ✨ IA
          </button>
          <button
            type="button"
            onClick={createNew}
            disabled={busy}
            className="shrink-0 text-sm px-3 py-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            + Nuevo KO
          </button>
        </div>
      </div>

      <KoAiChat
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        entries={entries}
        onApplied={(entry) =>
          setEntries((prev) => {
            const i = prev.findIndex((e) => e.id === entry.id);
            if (i >= 0) {
              const c = [...prev];
              c[i] = entry;
              return c;
            }
            return [entry, ...prev];
          })
        }
      />

      {/* Table */}
      <div>
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">
            {entries.length === 0
              ? 'Sin KO aún. Crea el primero.'
              : 'Sin resultados para el filtro actual.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <th className="font-medium pb-2 pr-3">Código</th>
                  <th className="font-medium pb-2 pr-3">Error</th>
                  <th className="font-medium pb-2 pr-3">Sistema</th>
                  <th className="font-medium pb-2 pr-3">Clasificación</th>
                  <th className="font-medium pb-2">Resuelve</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => select(e.id)}
                    className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] ${
                      e.id === selectedId ? 'bg-[var(--surface-hover)]' : ''
                    }`}
                  >
                    <td className="py-2 pr-3 mono font-medium whitespace-nowrap">
                      {e.codigo || <span className="text-[var(--muted)] font-normal">—</span>}
                    </td>
                    <td className="py-2 pr-3 max-w-[20rem] truncate">
                      {e.error}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-[var(--muted)]">
                      {e.sistema || '—'}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-[var(--muted)]">
                      {e.clasificacion || '—'}
                    </td>
                    <td className="py-2 whitespace-nowrap text-[var(--muted)]">
                      {e.sistema_solucion || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => {
            setSelectedId(null);
            setEditing(false);
            setBuffer(null);
          }}
        >
          <div
            className="bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {error && (
              <div className="mb-3 text-sm text-[var(--danger)]">{error}</div>
            )}

            {editing && buffer ? (
              <EntryEditor
                buffer={buffer}
                setBuffer={setBuffer}
                busy={busy}
                onSave={save}
                onCancel={cancelEdit}
                onRemove={remove}
              />
            ) : (
              <EntryView selected={selected} onEdit={startEdit} onClose={() => setSelectedId(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryView({
  selected,
  onEdit,
  onClose,
}: {
  selected: KoEntry;
  onEdit: () => void;
  onClose: () => void;
}) {
  const subs = selected.subprocesos ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mono text-[11px] text-[var(--muted)] font-medium mb-1">
            {selected.codigo || 'sin código'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{selected.error}</h2>
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

      {selected.eco_notes && (
        <div>
          <SubLabel>Mensaje del sistema (ECO Notes)</SubLabel>
          <pre className="text-xs mono whitespace-pre-wrap bg-[var(--surface)] border border-[var(--border)] rounded p-3 text-[var(--text)] overflow-x-auto">
            {selected.eco_notes}
          </pre>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Meta label="Sistema" value={selected.sistema} />
        <Meta label="Flujo" value={selected.flujo != null ? String(selected.flujo) : null} />
        <Meta label="Clasificación" value={selected.clasificacion} />
        <Meta label="Resuelve en" value={selected.sistema_solucion} />
        <Meta label="Responsable" value={selected.responsable} />
      </div>

      {selected.causa_raiz && (
        <div>
          <SubLabel>Causa raíz</SubLabel>
          <p className="text-sm leading-relaxed text-[var(--text)]">
            {selected.causa_raiz}
          </p>
        </div>
      )}

      {subs.length > 0 && (
        <div>
          <SubLabel>Subprocesos</SubLabel>
          <div className="flex flex-wrap gap-1.5">
            {subs.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <SubLabel>Resolución</SubLabel>
        <Markdown value={selected.resolucion} />
      </div>

      <div>
        <SubLabel>Documentación</SubLabel>
        <Markdown value={selected.documentacion} />
      </div>

      {selected.flujograma_url && (
        <div>
          <SubLabel>Flujograma</SubLabel>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.flujograma_url}
            alt={`Flujograma ${selected.codigo}`}
            className="max-w-full rounded border border-[var(--border)]"
          />
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <SubLabel>{label}</SubLabel>
      <p className="text-sm text-[var(--text)]">{value || '—'}</p>
    </div>
  );
}

function EntryEditor({
  buffer,
  setBuffer,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  buffer: EntryBuffer;
  setBuffer: (b: EntryBuffer) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<EntryBuffer>) => setBuffer({ ...buffer, ...patch });
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Código</label>
          <input
            type="text"
            value={buffer.codigo}
            onChange={(e) => upd({ codigo: e.target.value })}
            className={`${inputCls} mono`}
          />
        </div>
        <div>
          <label className={labelCls}>Sistema</label>
          <input
            type="text"
            value={buffer.sistema}
            onChange={(e) => upd({ sistema: e.target.value })}
            placeholder="Salesforce | Opera | SAP | eCO"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Error</label>
        <input
          type="text"
          value={buffer.error}
          onChange={(e) => upd({ error: e.target.value })}
          className={`${inputCls} text-lg font-semibold`}
        />
      </div>

      <div>
        <label className={labelCls}>Mensaje del sistema (ECO Notes)</label>
        <textarea
          value={buffer.eco_notes}
          onChange={(e) => upd({ eco_notes: e.target.value })}
          rows={3}
          placeholder="Mensaje crudo tal como aparece en el sistema"
          className={`${inputCls} mono text-xs resize-y`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Flujo</label>
          <input
            type="number"
            value={buffer.flujo}
            onChange={(e) => upd({ flujo: e.target.value })}
            placeholder="9..13"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Clasificación</label>
          <input
            type="text"
            value={buffer.clasificacion}
            onChange={(e) => upd({ clasificacion: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Resuelve en</label>
          <input
            type="text"
            value={buffer.sistema_solucion}
            onChange={(e) => upd({ sistema_solucion: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Responsable</label>
          <input
            type="text"
            value={buffer.responsable}
            onChange={(e) => upd({ responsable: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Subprocesos (CSV)</label>
          <input
            type="text"
            value={buffer.subprocesos}
            onChange={(e) => upd({ subprocesos: e.target.value })}
            placeholder="SP-001, SP-003"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Causa raíz</label>
        <textarea
          value={buffer.causa_raiz}
          onChange={(e) => upd({ causa_raiz: e.target.value })}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </div>

      <div>
        <label className={labelCls}>Resolución (markdown)</label>
        <textarea
          value={buffer.resolucion}
          onChange={(e) => upd({ resolucion: e.target.value })}
          rows={5}
          className={textareaCls}
        />
      </div>

      <div>
        <label className={labelCls}>Documentación (markdown)</label>
        <textarea
          value={buffer.documentacion}
          onChange={(e) => upd({ documentacion: e.target.value })}
          rows={4}
          className={textareaCls}
        />
      </div>

      <div>
        <label className={labelCls}>Flujograma URL</label>
        <input
          type="text"
          value={buffer.flujograma_url}
          onChange={(e) => upd({ flujograma_url: e.target.value })}
          placeholder="https://…/flujograma.png"
          className={inputCls}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 2 — Subprocesos                                                */
/* ================================================================== */

type SpBuffer = {
  codigo: string;
  nombre: string;
  responsable: string;
  cuando_aplicar: string;
  pasos: string;
  documentacion: string;
  flujograma_url: string;
};

function spToBuffer(s: KoSubproceso): SpBuffer {
  return {
    codigo: s.codigo ?? '',
    nombre: s.nombre ?? '',
    responsable: s.responsable ?? '',
    cuando_aplicar: s.cuando_aplicar ?? '',
    pasos: s.pasos ?? '',
    documentacion: s.documentacion ?? '',
    flujograma_url: s.flujograma_url ?? '',
  };
}

function SubprocesosTab({ initial }: { initial: KoSubproceso[] }) {
  const [subprocesos, setSubprocesos] = useState<KoSubproceso[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<SpBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => subprocesos.find((s) => s.id === selectedId) ?? null,
    [subprocesos, selectedId],
  );

  function select(id: string) {
    setSelectedId(id);
    setEditing(false);
    setBuffer(null);
    setError(null);
  }

  function startEdit() {
    if (!selected) return;
    setBuffer(spToBuffer(selected));
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
      const res = await fetch('/api/ko/subprocesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'SP-NUEVO', nombre: 'Nuevo' }),
      });
      if (!res.ok) throw new Error(`POST falló (${res.status})`);
      const created: KoSubproceso = await res.json();
      setSubprocesos((prev) => [...prev, created]);
      setSelectedId(created.id);
      setBuffer(spToBuffer(created));
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
      const res = await fetch(`/api/ko/subprocesos/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: buffer.codigo,
          nombre: buffer.nombre,
          responsable: buffer.responsable || null,
          cuando_aplicar: buffer.cuando_aplicar || null,
          pasos: buffer.pasos || null,
          documentacion: buffer.documentacion || null,
          flujograma_url: buffer.flujograma_url || null,
        }),
      });
      if (!res.ok) throw new Error(`PATCH falló (${res.status})`);
      const updated: KoSubproceso = await res.json();
      setSubprocesos((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
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
    if (!confirm(`¿Eliminar "${selected.codigo}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ko/subprocesos/${selected.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`DELETE falló (${res.status})`);
      const removedId = selected.id;
      setSubprocesos((prev) => prev.filter((s) => s.id !== removedId));
      setSelectedId(null);
      setEditing(false);
      setBuffer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setBusy(false);
    }
  }

  const upd = (patch: Partial<SpBuffer>) =>
    buffer && setBuffer({ ...buffer, ...patch });

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* List */}
      <div
        className={`${
          selectedId ? 'hidden md:block' : 'block'
        } w-full md:w-72 md:shrink-0 md:border-r md:border-[var(--border)] md:pr-4`}
      >
        <button
          type="button"
          onClick={createNew}
          disabled={busy}
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--accent)] disabled:opacity-50"
        >
          + Nuevo subproceso
        </button>

        {subprocesos.length === 0 ? (
          <p className="text-sm text-[var(--muted)] px-2 py-4">
            Sin subprocesos aún. Crea el primero.
          </p>
        ) : (
          <div className="mt-2 flex flex-col">
            {subprocesos.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id)}
                className={`text-left px-2 py-1.5 rounded text-sm hover:bg-[var(--surface-hover)] ${
                  s.id === selectedId
                    ? 'bg-[var(--surface-hover)] font-medium'
                    : ''
                }`}
              >
                <span className="mono text-[11px] text-[var(--muted)] mr-2">
                  {s.codigo}
                </span>
                <span className="truncate">{s.nombre}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail / editor */}
      <div className={`${selectedId ? 'block' : 'hidden md:block'} flex-1 min-w-0`}>
        {!selected ? (
          <div className="h-full flex items-center justify-center py-16">
            <p className="text-sm text-[var(--muted)]">
              Selecciona o crea un subproceso
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
              /* ---------- EDIT ---------- */
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? 'Guardando…' : 'Guardar'}
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
                    <label className={labelCls}>Código</label>
                    <input
                      type="text"
                      value={buffer.codigo}
                      onChange={(e) => upd({ codigo: e.target.value })}
                      className={`${inputCls} mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Responsable</label>
                    <input
                      type="text"
                      value={buffer.responsable}
                      onChange={(e) => upd({ responsable: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Nombre</label>
                  <input
                    type="text"
                    value={buffer.nombre}
                    onChange={(e) => upd({ nombre: e.target.value })}
                    className={`${inputCls} text-lg font-semibold`}
                  />
                </div>

                <div>
                  <label className={labelCls}>Cuándo aplicarlo (markdown)</label>
                  <textarea
                    value={buffer.cuando_aplicar}
                    onChange={(e) => upd({ cuando_aplicar: e.target.value })}
                    rows={3}
                    className={textareaCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Pasos (markdown)</label>
                  <textarea
                    value={buffer.pasos}
                    onChange={(e) => upd({ pasos: e.target.value })}
                    rows={6}
                    className={textareaCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Documentación (markdown)</label>
                  <textarea
                    value={buffer.documentacion}
                    onChange={(e) => upd({ documentacion: e.target.value })}
                    rows={3}
                    className={textareaCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Flujograma URL</label>
                  <input
                    type="text"
                    value={buffer.flujograma_url}
                    onChange={(e) => upd({ flujograma_url: e.target.value })}
                    placeholder="https://…/flujograma.png"
                    className={inputCls}
                  />
                </div>
              </div>
            ) : (
              /* ---------- VIEW ---------- */
              <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mono text-[11px] text-[var(--muted)] font-medium mb-1">
                      {selected.codigo}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">
                      {selected.nombre}
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

                <Meta label="Responsable" value={selected.responsable} />

                {selected.flujograma_url && (
                  <div>
                    <SubLabel>Flujograma</SubLabel>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.flujograma_url}
                      alt={`Flujograma ${selected.codigo}`}
                      className="max-w-full rounded border border-[var(--border)]"
                    />
                  </div>
                )}

                <div>
                  <SubLabel>Cuándo aplicarlo</SubLabel>
                  <Markdown value={selected.cuando_aplicar} />
                </div>

                <div>
                  <SubLabel>Pasos</SubLabel>
                  <Markdown value={selected.pasos} />
                </div>

                <div>
                  <SubLabel>Documentación</SubLabel>
                  <Markdown value={selected.documentacion} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
