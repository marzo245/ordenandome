'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KoEntry, KoSubproceso, KoImportCaso, KoImportLote } from '@/db';
import MarkdownImageTextarea from './MarkdownImageTextarea';

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

function Chip({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const base =
    'inline-block text-xs px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]';
  if (!onClick) {
    return <span className={base}>{children}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${base} cursor-pointer transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]`}
    >
      {children} <span aria-hidden="true">↗</span>
    </button>
  );
}

const SISTEMA_FILTERS = ['Todos', 'Salesforce', 'Opera', 'SAP', 'eCO'];

/**
 * Resuelve una referencia de subproceso (código o nombre) contra el catálogo de
 * subprocesos. Compartido por el detalle del KO y la worklist de conocidas.
 */
function resolveSubproceso(
  ref: string,
  subprocesos: KoSubproceso[],
): KoSubproceso | null {
  const r = ref.trim().toLowerCase();
  return (
    subprocesos.find((s) => (s.codigo ?? '').toLowerCase() === r) ??
    subprocesos.find((s) => (s.nombre ?? '').toLowerCase() === r) ??
    null
  );
}

/* ================================================================== */
/* Root                                                               */
/* ================================================================== */

/**
 * Gestor de la sección KO (errores conocidos). Tablero con dos pestañas:
 * el catálogo de KOs y los subprocesos. Permite ver/crear/editar/borrar cada
 * entrada contra `/api/ko` y `/api/ko/subprocesos`.
 */
type Tab = 'catalogo' | 'subprocesos' | 'conocidas' | 'pendientes';

export default function KoManager({
  initialEntries,
  initialSubprocesos,
  initialCasos,
}: {
  initialEntries: KoEntry[];
  initialSubprocesos: KoSubproceso[];
  initialCasos: KoImportCaso[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('catalogo');
  // Subproceso a abrir al navegar desde un caso del catálogo (deep-link entre tabs).
  const [openSubprocesoId, setOpenSubprocesoId] = useState<string | null>(null);

  // Casos importados: estado compartido por las pestañas Conocidas y Pendientes.
  // Se resincroniza desde el server tras router.refresh() (importar/promover).
  const [casos, setCasos] = useState<KoImportCaso[]>(initialCasos);
  useEffect(() => setCasos(initialCasos), [initialCasos]);

  const pendientesCount = useMemo(
    () => casos.filter((c) => c.tipo === 'desconocida').length,
    [casos],
  );

  function goToSubproceso(id: string) {
    setOpenSubprocesoId(id);
    setTab('subprocesos');
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs (Notion-style underline) */}
      <div className="flex items-center gap-5 border-b border-[var(--border)] overflow-x-auto">
        <TabButton active={tab === 'catalogo'} onClick={() => setTab('catalogo')}>
          Catálogo
        </TabButton>
        <TabButton
          active={tab === 'subprocesos'}
          onClick={() => setTab('subprocesos')}
        >
          Subprocesos
        </TabButton>
        <TabButton active={tab === 'conocidas'} onClick={() => setTab('conocidas')}>
          Conocidas
        </TabButton>
        <TabButton active={tab === 'pendientes'} onClick={() => setTab('pendientes')}>
          Pendientes
          {pendientesCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center text-[10px] min-w-[1.1rem] px-1 rounded-full bg-[var(--accent)] text-white align-middle">
              {pendientesCount}
            </span>
          )}
        </TabButton>
      </div>

      {tab === 'catalogo' && (
        <CatalogoTab
          initial={initialEntries}
          subprocesos={initialSubprocesos}
          onOpenSubproceso={goToSubproceso}
        />
      )}
      {tab === 'subprocesos' && (
        <SubprocesosTab
          initial={initialSubprocesos}
          openId={openSubprocesoId}
          onOpened={() => setOpenSubprocesoId(null)}
        />
      )}
      {tab === 'conocidas' && (
        <ConocidasTab
          entries={initialEntries}
          subprocesos={initialSubprocesos}
          casos={casos}
          setCasos={setCasos}
          onImported={() => router.refresh()}
          onOpenSubproceso={goToSubproceso}
        />
      )}
      {tab === 'pendientes' && (
        <PendientesTab
          entries={initialEntries}
          casos={casos}
          setCasos={setCasos}
          onImported={() => router.refresh()}
          onChanged={() => router.refresh()}
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

function CatalogoTab({
  initial,
  subprocesos,
  onOpenSubproceso,
}: {
  initial: KoEntry[];
  subprocesos: KoSubproceso[];
  onOpenSubproceso: (id: string) => void;
}) {
  const [entries, setEntries] = useState<KoEntry[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<EntryBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sistemaFilter, setSistemaFilter] = useState('Todos');
  const [query, setQuery] = useState('');

  // El chat global (GUITO) hace router.refresh() tras aplicar cambios; al
  // recargar las props del server, sincronizamos la lista local.
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

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
            onClick={createNew}
            disabled={busy}
            className="shrink-0 text-sm px-3 py-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            + Nuevo KO
          </button>
        </div>
      </div>

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
              <EntryView
                selected={selected}
                subprocesos={subprocesos}
                onEdit={startEdit}
                onClose={() => setSelectedId(null)}
                onOpenSubproceso={onOpenSubproceso}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryView({
  selected,
  subprocesos,
  onEdit,
  onClose,
  onOpenSubproceso,
}: {
  selected: KoEntry;
  subprocesos: KoSubproceso[];
  onEdit: () => void;
  onClose: () => void;
  onOpenSubproceso: (id: string) => void;
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
            {subs.map((s) => {
              const match = resolveSubproceso(s, subprocesos);
              return match ? (
                <Chip
                  key={s}
                  onClick={() => onOpenSubproceso(match.id)}
                  title={`Ir al subproceso ${match.codigo} — ${match.nombre}`}
                >
                  {s}
                </Chip>
              ) : (
                <Chip key={s}>{s}</Chip>
              );
            })}
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
        <MarkdownImageTextarea
          value={buffer.resolucion}
          onChange={(v) => upd({ resolucion: v })}
          rows={5}
          className={textareaCls}
        />
      </div>

      <div>
        <label className={labelCls}>Documentación (markdown)</label>
        <MarkdownImageTextarea
          value={buffer.documentacion}
          onChange={(v) => upd({ documentacion: v })}
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

function SubprocesosTab({
  initial,
  openId,
  onOpened,
}: {
  initial: KoSubproceso[];
  openId?: string | null;
  onOpened?: () => void;
}) {
  const [subprocesos, setSubprocesos] = useState<KoSubproceso[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<SpBuffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubprocesos(initial);
  }, [initial]);

  // Deep-link desde el catálogo: al llegar con un `openId`, abrimos ese
  // subproceso y consumimos la petición (para no re-seleccionar en cada render).
  useEffect(() => {
    if (!openId) return;
    setSelectedId(openId);
    setEditing(false);
    setBuffer(null);
    setError(null);
    onOpened?.();
  }, [openId, onOpened]);

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
                  <MarkdownImageTextarea
                    value={buffer.cuando_aplicar}
                    onChange={(v) => upd({ cuando_aplicar: v })}
                    rows={3}
                    className={textareaCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Pasos (markdown)</label>
                  <MarkdownImageTextarea
                    value={buffer.pasos}
                    onChange={(v) => upd({ pasos: v })}
                    rows={6}
                    className={textareaCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Documentación (markdown)</label>
                  <MarkdownImageTextarea
                    value={buffer.documentacion}
                    onChange={(v) => upd({ documentacion: v })}
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

/* ================================================================== */
/* Importación de Excel (compartido por Conocidas y Pendientes)       */
/* ================================================================== */

/** Pares [columna, valor] no vacíos de una fila del Excel. */
function filaEntries(fila: KoImportCaso['fila']): [string, string][] {
  return Object.entries(fila)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => [k, String(v)]);
}

/** Resumen en una línea de la fila del Excel (para listas). */
function filaResumen(fila: KoImportCaso['fila']): string {
  return filaEntries(fila)
    .map(([, v]) => v)
    .join(' · ');
}

/**
 * Zona de subida del Excel de KO altas. Sube a `/api/ko/import`; si el server no
 * puede detectar la columna de código, pide elegirla y reintenta. Al terminar,
 * llama a `onImported()` (que refresca los casos desde el server).
 */
function ImportarExcel({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<string | null>(null);
  const [columnas, setColumnas] = useState<string[] | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lotes, setLotes] = useState<KoImportLote[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refrescarLotes = useCallback(async () => {
    try {
      const res = await fetch('/api/ko/lotes');
      if (res.ok) setLotes(await res.json());
    } catch {
      // silencioso: la lista de importaciones es informativa
    }
  }, []);

  useEffect(() => {
    refrescarLotes();
  }, [refrescarLotes]);

  async function recruzar() {
    setBusy(true);
    setError(null);
    setResumen(null);
    try {
      const res = await fetch('/api/ko/casos/recruzar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `No se pudo re-cruzar (${res.status})`);
      setResumen(
        data.movidas > 0
          ? `${data.movidas} cuentas pasaron a Conocidas`
          : 'No hay pendientes que crucen con el catálogo actual',
      );
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al re-cruzar');
    } finally {
      setBusy(false);
    }
  }

  async function borrarLote(id: string) {
    if (!confirm('¿Borrar esta importación y todas sus cuentas?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ko/lotes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`No se pudo borrar (${res.status})`);
      await refrescarLotes();
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar');
    } finally {
      setBusy(false);
    }
  }

  async function subir(file: File, columnaError?: string) {
    setBusy(true);
    setError(null);
    setResumen(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (columnaError) fd.append('columna_error', columnaError);
      const res = await fetch('/api/ko/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Falló la subida (${res.status})`);

      if (data.needsColumn) {
        // No se pudo detectar la columna: pedimos elegir y reintentamos.
        setColumnas(data.columnas as string[]);
        setPendingFile(file);
        return;
      }

      setColumnas(null);
      setPendingFile(null);
      const lote = data.lote as { conocidas: number; desconocidas: number; total: number };
      const hoja = typeof data.hoja === 'string' ? ` · hoja «${data.hoja}»` : '';
      setResumen(
        `${lote.total} cuentas${hoja} · ${lote.conocidas} conocidas · ${lote.desconocidas} pendientes`,
      );
      onImported();
      refrescarLotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) subir(file);
    // Permite re-subir el mismo archivo (reset del input).
    e.target.value = '';
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Importando…' : 'Subir Excel de KO altas'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onPick}
          className="hidden"
          aria-label="Subir Excel de KO altas"
        />
        <button
          type="button"
          onClick={recruzar}
          disabled={busy}
          title="Reevalúa las pendientes contra el catálogo actual (tras crear o editar KOs)"
          className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          Re-cruzar pendientes
        </button>
        <p className="text-xs text-[var(--muted)]">
          Lee la hoja <span className="mono">default_1</span>. Cruza el «Error normalizado»
          contra el catálogo (por contención).
        </p>
      </div>

      {columnas && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">
            No detecté la columna del error. ¿Cuál es?
          </span>
          <select
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value && pendingFile) subir(pendingFile, e.target.value);
            }}
            className={`${inputCls} sm:w-56`}
            aria-label="Columna del error"
          >
            <option value="" disabled>
              Elegir columna…
            </option>
            {columnas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {resumen && (
        <p className="mt-3 text-sm text-[var(--text)]">✓ {resumen}</p>
      )}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

      {lotes.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <SubLabel>Importaciones</SubLabel>
          <div className="flex flex-col gap-1.5">
            {lotes.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-[var(--muted)]">
                  {new Date(l.created_at).toLocaleDateString('es')} · {l.nombre_archivo} ·{' '}
                  {l.total} cuentas ({l.conocidas} conocidas · {l.desconocidas} pendientes)
                </span>
                <button
                  type="button"
                  onClick={() => borrarLote(l.id)}
                  disabled={busy}
                  className="shrink-0 px-2 py-0.5 rounded hover:bg-[var(--surface-hover)] text-[var(--danger)] disabled:opacity-50"
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Tab 3 — Conocidas (worklist)                                       */
/* ================================================================== */

type SetCasos = React.Dispatch<React.SetStateAction<KoImportCaso[]>>;

const ESTADO_FILTERS = ['Pendientes', 'Resueltos', 'Todos'] as const;
type EstadoFilter = (typeof ESTADO_FILTERS)[number];

/**
 * Worklist de casos cuyo código YA está en el catálogo. Agrupa por KO, muestra
 * su plan de acción (clasificación, sistema de solución, subprocesos, resolución)
 * y permite marcar cada caso como resuelto e ir avanzando.
 */
function ConocidasTab({
  entries,
  subprocesos,
  casos,
  setCasos,
  onImported,
  onOpenSubproceso,
}: {
  entries: KoEntry[];
  subprocesos: KoSubproceso[];
  casos: KoImportCaso[];
  setCasos: SetCasos;
  onImported: () => void;
  onOpenSubproceso: (id: string) => void;
}) {
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('Pendientes');
  const [clasifFilter, setClasifFilter] = useState('Todas');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entryById = useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );

  const conocidas = useMemo(
    () => casos.filter((c) => c.tipo === 'conocida'),
    [casos],
  );

  const totalResueltas = conocidas.filter((c) => c.estado === 'resuelto').length;

  // Clasificaciones presentes entre las conocidas (para el filtro).
  const clasificaciones = useMemo(() => {
    const set = new Set<string>();
    for (const c of conocidas) {
      const ko = c.ko_entry_id ? entryById.get(c.ko_entry_id) : null;
      if (ko?.clasificacion) set.add(ko.clasificacion);
    }
    return ['Todas', ...[...set].sort()];
  }, [conocidas, entryById]);

  // Agrupa por KO aplicando estado + clasificación + búsqueda (código/error/clasif).
  const grupos = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { ko: KoEntry | null; casos: KoImportCaso[] }>();
    for (const c of conocidas) {
      if (estadoFilter === 'Pendientes' && c.estado !== 'pendiente') continue;
      if (estadoFilter === 'Resueltos' && c.estado !== 'resuelto') continue;
      const ko = c.ko_entry_id ? entryById.get(c.ko_entry_id) ?? null : null;
      if (clasifFilter !== 'Todas' && (ko?.clasificacion ?? '') !== clasifFilter) continue;
      if (q) {
        const hay = [ko?.codigo, ko?.error, ko?.clasificacion, c.codigo, c.error_texto]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = c.ko_entry_id ?? `sin:${c.codigo ?? '—'}`;
      if (!map.has(key)) map.set(key, { ko, casos: [] });
      map.get(key)!.casos.push(c);
    }
    return [...map.values()];
  }, [conocidas, estadoFilter, clasifFilter, query, entryById]);

  async function setEstado(caso: KoImportCaso, estado: 'pendiente' | 'resuelto') {
    setBusyId(caso.id);
    setError(null);
    try {
      const res = await fetch(`/api/ko/casos/${caso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error(`No se pudo actualizar (${res.status})`);
      const updated: KoImportCaso = await res.json();
      setCasos((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar');
    } finally {
      setBusyId(null);
    }
  }

  // Resuelve/reabre todas las cuentas de un grupo de una vez.
  async function setEstadoBulk(ids: string[], estado: 'pendiente' | 'resuelto') {
    if (ids.length === 0) return;
    setBusyId(ids[0]);
    setError(null);
    try {
      const res = await fetch('/api/ko/casos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: estado === 'resuelto' ? 'resolver' : 'reabrir', ids }),
      });
      if (!res.ok) throw new Error(`No se pudo actualizar (${res.status})`);
      const idSet = new Set(ids);
      const stamp = estado === 'resuelto' ? new Date() : null;
      setCasos((prev) =>
        prev.map((c) =>
          idSet.has(c.id) ? { ...c, estado, resolved_at: stamp } : c,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ImportarExcel onImported={onImported} />

      {conocidas.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-8 text-center">
          Aún no hay casos conocidos. Sube un Excel de KO altas para empezar.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {ESTADO_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEstadoFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      estadoFilter === s
                        ? 'border-[var(--text)] text-[var(--text)] font-medium'
                        : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-sm text-[var(--muted)]">
                {totalResueltas}/{conocidas.length} resueltas
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por código, error o clasificación…"
                className={`${inputCls} sm:flex-1`}
                aria-label="Buscar en conocidas"
              />
              {clasificaciones.length > 1 && (
                <select
                  value={clasifFilter}
                  onChange={(e) => setClasifFilter(e.target.value)}
                  className={`${inputCls} sm:w-56`}
                  aria-label="Filtrar por clasificación"
                >
                  {clasificaciones.map((c) => (
                    <option key={c} value={c}>
                      {c === 'Todas' ? 'Todas las clasificaciones' : c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          {grupos.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">
              {query.trim() || clasifFilter !== 'Todas'
                ? 'Sin resultados para el filtro actual.'
                : `Nada en «${estadoFilter}».`}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {grupos.map((g, i) => (
                <GrupoConocidas
                  key={g.ko?.id ?? `g${i}`}
                  ko={g.ko}
                  casos={g.casos}
                  subprocesos={subprocesos}
                  busy={busyId != null}
                  onResolver={(c) => setEstado(c, 'resuelto')}
                  onReabrir={(c) => setEstado(c, 'pendiente')}
                  onResolverGrupo={(ids) => setEstadoBulk(ids, 'resuelto')}
                  onOpenSubproceso={onOpenSubproceso}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Tarjeta de un KO con su plan de acción y las cuentas afectadas a gestionar. */
function GrupoConocidas({
  ko,
  casos,
  subprocesos,
  busy,
  onResolver,
  onReabrir,
  onResolverGrupo,
  onOpenSubproceso,
}: {
  ko: KoEntry | null;
  casos: KoImportCaso[];
  subprocesos: KoSubproceso[];
  busy: boolean;
  onResolver: (c: KoImportCaso) => void;
  onReabrir: (c: KoImportCaso) => void;
  onResolverGrupo: (ids: string[]) => void;
  onOpenSubproceso: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const subs = ko?.subprocesos ?? [];
  const pendientes = casos.filter((c) => c.estado === 'pendiente');

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mono text-[11px] text-[var(--muted)] font-medium mb-1">
            {ko?.codigo || casos[0]?.codigo || 'sin código'}
          </div>
          <h3 className="text-lg font-semibold tracking-tight">
            {ko?.error ?? casos[0]?.error_texto ?? 'KO no encontrado en el catálogo'}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-[var(--muted)] whitespace-nowrap">
          {casos.length - pendientes.length}/{casos.length} cuentas
        </span>
      </div>

      {/* Plan de acción del KO */}
      {ko && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Meta label="Clasificación" value={ko.clasificacion} />
            <Meta label="Resuelve en" value={ko.sistema_solucion} />
            <Meta label="Responsable" value={ko.responsable} />
            <Meta label="Flujo" value={ko.flujo != null ? String(ko.flujo) : null} />
          </div>
          {subs.length > 0 && (
            <div>
              <SubLabel>Subprocesos</SubLabel>
              <div className="flex flex-wrap gap-1.5">
                {subs.map((s) => {
                  const match = resolveSubproceso(s, subprocesos);
                  return match ? (
                    <Chip
                      key={s}
                      onClick={() => onOpenSubproceso(match.id)}
                      title={`Ir al subproceso ${match.codigo} — ${match.nombre}`}
                    >
                      {s}
                    </Chip>
                  ) : (
                    <Chip key={s}>{s}</Chip>
                  );
                })}
              </div>
            </div>
          )}
          {ko.resolucion && (
            <div>
              <SubLabel>Resolución</SubLabel>
              <Markdown value={ko.resolucion} />
            </div>
          )}
        </div>
      )}

      {/* Acciones de grupo */}
      <div className="flex flex-wrap items-center gap-2">
        {pendientes.length > 0 && (
          <button
            type="button"
            onClick={() => onResolverGrupo(pendientes.map((c) => c.id))}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            Marcar {pendientes.length} como resueltas
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-xs px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)]"
        >
          {abierto ? 'Ocultar cuentas' : `Ver cuentas (${casos.length})`}
        </button>
      </div>

      {/* Cuentas individuales (una a una) */}
      {abierto && (
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {casos.map((c) => {
            const resuelto = c.estado === 'resuelto';
            return (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <p
                  className={`text-sm min-w-0 break-words ${
                    resuelto ? 'text-[var(--muted)] line-through' : 'text-[var(--text)]'
                  }`}
                >
                  {filaResumen(c.fila) || c.codigo || '—'}
                </p>
                {resuelto ? (
                  <button
                    type="button"
                    onClick={() => onReabrir(c)}
                    disabled={busy}
                    className="shrink-0 text-xs px-2.5 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)] disabled:opacity-50"
                  >
                    Reabrir
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onResolver(c)}
                    disabled={busy}
                    className="shrink-0 text-xs px-2.5 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    Resuelto ✓
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Tab 4 — Pendientes (casos por gestionar / normalizar)              */
/* ================================================================== */

/** Valor de la columna de ECO Notes (mensaje crudo) si existe en la fila. */
function ecoNotesDeFila(fila: KoImportCaso['fila']): string {
  const entry = filaEntries(fila).find(([k]) => /eco.*notes/i.test(k));
  return entry ? entry[1] : '';
}

/**
 * Construye un buffer de KO a partir de un caso pendiente (para promoverlo).
 * Prerellena el error con su «Error normalizado» y las ECO Notes con el mensaje
 * crudo; el resto lo completa el usuario al normalizar.
 */
function casoToBuffer(caso: KoImportCaso): EntryBuffer {
  return {
    codigo: '',
    error: caso.error_texto ?? '',
    eco_notes: ecoNotesDeFila(caso.fila),
    sistema: '',
    flujo: '',
    clasificacion: '',
    causa_raiz: '',
    sistema_solucion: '',
    responsable: '',
    subprocesos: '',
    resolucion: '',
    documentacion: '',
    flujograma_url: '',
  };
}

/** Convierte un EntryBuffer al payload de creación de KO (mismo mapeo que el catálogo). */
function bufferToKoData(b: EntryBuffer) {
  const flujoNum = b.flujo.trim() === '' ? null : Number(b.flujo);
  return {
    codigo: b.codigo.trim() || null,
    error: b.error,
    eco_notes: b.eco_notes || null,
    sistema: b.sistema || null,
    flujo: Number.isNaN(flujoNum as number) ? null : flujoNum,
    clasificacion: b.clasificacion || null,
    causa_raiz: b.causa_raiz || null,
    sistema_solucion: b.sistema_solucion || null,
    responsable: b.responsable || null,
    subprocesos: b.subprocesos
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    resolucion: b.resolucion || null,
    documentacion: b.documentacion || null,
    flujograma_url: b.flujograma_url || null,
  };
}

type GrupoPendiente = {
  key: string;
  label: string;
  casos: KoImportCaso[];
};

/**
 * Bandeja de cuentas cuyo error NO está en el catálogo: pendientes de normalizar.
 * Agrupa por «Error normalizado» (muchas cuentas comparten el mismo error) y, por
 * grupo, permite vincular a un KO existente, promover a un KO nuevo o descartar
 * TODAS las cuentas del grupo de una vez.
 */
function PendientesTab({
  entries,
  casos,
  setCasos,
  onImported,
  onChanged,
}: {
  entries: KoEntry[];
  casos: KoImportCaso[];
  setCasos: SetCasos;
  onImported: () => void;
  onChanged: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'promover'>('view');
  const [buffer, setBuffer] = useState<EntryBuffer | null>(null);
  const [linkId, setLinkId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agrupa las desconocidas por su texto de error, de mayor a menor volumen.
  const grupos = useMemo<GrupoPendiente[]>(() => {
    const map = new Map<string, GrupoPendiente>();
    for (const c of casos) {
      if (c.tipo !== 'desconocida') continue;
      const label = c.error_texto?.trim() || '(sin error normalizado)';
      const key = label.toLowerCase();
      if (!map.has(key)) map.set(key, { key, label, casos: [] });
      map.get(key)!.casos.push(c);
    }
    return [...map.values()].sort((a, b) => b.casos.length - a.casos.length);
  }, [casos]);

  // Grupos visibles según la búsqueda por texto del error.
  const gruposVisibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? grupos.filter((g) => g.label.toLowerCase().includes(q)) : grupos;
  }, [grupos, query]);

  const grupo = useMemo(
    () => grupos.find((g) => g.key === selectedKey) ?? null,
    [grupos, selectedKey],
  );

  const totalPendientes = grupos.reduce((n, g) => n + g.casos.length, 0);

  function close() {
    setSelectedKey(null);
    setMode('view');
    setBuffer(null);
    setLinkId('');
    setError(null);
  }

  /** Marca localmente las cuentas del grupo como conocidas (tras link/create). */
  function aplicarVinculo(ids: string[], ko: KoEntry) {
    const idSet = new Set(ids);
    setCasos((prev) =>
      prev.map((c) =>
        idSet.has(c.id)
          ? { ...c, tipo: 'conocida', ko_entry_id: ko.id, codigo: ko.codigo }
          : c,
      ),
    );
  }

  async function vincular() {
    if (!grupo || !linkId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ko/casos/promover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'link',
          ko_entry_id: linkId,
          caso_ids: grupo.casos.map((c) => c.id),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || `No se pudo vincular (${res.status})`);
      }
      const { koEntry } = (await res.json()) as { koEntry: KoEntry };
      aplicarVinculo(grupo.casos.map((c) => c.id), koEntry);
      close();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al vincular');
    } finally {
      setBusy(false);
    }
  }

  async function promover() {
    if (!grupo || !buffer) return;
    if (!buffer.error.trim()) {
      setError('El error es obligatorio para crear el KO.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ko/casos/promover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create',
          koData: bufferToKoData(buffer),
          caso_ids: grupo.casos.map((c) => c.id),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || `No se pudo promover (${res.status})`);
      }
      const { koEntry } = (await res.json()) as { koEntry: KoEntry };
      aplicarVinculo(grupo.casos.map((c) => c.id), koEntry);
      close();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al promover');
    } finally {
      setBusy(false);
    }
  }

  async function descartar() {
    if (!grupo) return;
    if (!confirm(`¿Descartar las ${grupo.casos.length} cuentas de este error?`)) return;
    setBusy(true);
    setError(null);
    try {
      const ids = grupo.casos.map((c) => c.id);
      const res = await fetch('/api/ko/casos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'descartar', ids }),
      });
      if (!res.ok) throw new Error(`No se pudo descartar (${res.status})`);
      const idSet = new Set(ids);
      setCasos((prev) => prev.filter((c) => !idSet.has(c.id)));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al descartar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ImportarExcel onImported={onImported} />

      {grupos.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-8 text-center">
          No hay cuentas pendientes. Los errores que no cruzan con el catálogo aparecerán aquí.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por error…"
              className={`${inputCls} sm:w-80`}
              aria-label="Buscar en pendientes"
            />
            <p className="text-sm text-[var(--muted)] whitespace-nowrap">
              {totalPendientes} cuentas · {grupos.length} errores por normalizar
            </p>
          </div>
          {gruposVisibles.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">
              Sin resultados para «{query.trim()}».
            </p>
          ) : (
          <div className="flex flex-col gap-2">
            {gruposVisibles.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  setSelectedKey(g.key);
                  setMode('view');
                  setBuffer(null);
                  setLinkId('');
                  setError(null);
                }}
                className="text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--accent)] transition-colors flex items-center justify-between gap-3"
              >
                <span className="text-sm min-w-0 break-words text-[var(--text)]">
                  {g.label}
                </span>
                <span className="shrink-0 text-xs text-[var(--muted)] whitespace-nowrap">
                  {g.casos.length} cuenta{g.casos.length === 1 ? '' : 's'} ↗
                </span>
              </button>
            ))}
          </div>
          )}
        </>
      )}

      {/* Detalle / acciones del grupo */}
      {grupo && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={close}
        >
          <div
            className="bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {error && <div className="mb-3 text-sm text-[var(--danger)]">{error}</div>}

            {mode === 'promover' && buffer ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Promover a KO</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('view');
                      setBuffer(null);
                      setError(null);
                    }}
                    className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)]"
                  >
                    ← Volver
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Normaliza el error y asígnale clasificación y subproceso. Al guardar se
                  crea el KO y se vinculan las <strong>{grupo.casos.length} cuentas</strong> del grupo.
                </p>
                <EntryEditor
                  buffer={buffer}
                  setBuffer={setBuffer}
                  busy={busy}
                  onSave={promover}
                  onCancel={() => {
                    setMode('view');
                    setBuffer(null);
                  }}
                  onRemove={descartar}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mono text-[11px] text-[var(--muted)] font-medium mb-1">
                      {grupo.casos.length} cuenta{grupo.casos.length === 1 ? '' : 's'}
                    </div>
                    <h2 className="text-xl font-bold tracking-tight break-words">
                      {grupo.label}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="shrink-0 text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)]"
                  >
                    Cerrar
                  </button>
                </div>

                <div>
                  <SubLabel>Ejemplo de cuenta (fila del Excel)</SubLabel>
                  <pre className="text-xs mono whitespace-pre-wrap bg-[var(--surface)] border border-[var(--border)] rounded p-3 text-[var(--text)] overflow-x-auto">
                    {filaEntries(grupo.casos[0].fila)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n') || '—'}
                  </pre>
                </div>

                {/* Vincular a KO existente */}
                <div>
                  <SubLabel>Vincular a un KO existente</SubLabel>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={linkId}
                      onChange={(e) => setLinkId(e.target.value)}
                      className={`${inputCls} flex-1`}
                      aria-label="KO al que vincular"
                    >
                      <option value="">Elegir KO…</option>
                      {entries.map((e) => (
                        <option key={e.id} value={e.id}>
                          {(e.codigo ? `${e.codigo} · ` : '') + e.error}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={vincular}
                      disabled={busy || !linkId}
                      className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? '…' : 'Vincular'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setBuffer(casoToBuffer(grupo.casos[0]));
                      setMode('promover');
                      setError(null);
                    }}
                    disabled={busy}
                    className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    Promover a KO nuevo
                  </button>
                  <button
                    type="button"
                    onClick={descartar}
                    disabled={busy}
                    className="text-sm px-3 py-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--danger)] disabled:opacity-50 ml-auto"
                  >
                    Descartar grupo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
