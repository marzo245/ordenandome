'use client';

import { useMemo } from 'react';
import type { KoEntry, KoSubproceso, KoImportCaso } from '@/db';

/* ------------------------------------------------------------------ */
/* Paleta — derivada de los tokens del tema (sin colores fijos).       */
/* La graduación de un mismo tono comunica progreso/severidad.         */
/* ------------------------------------------------------------------ */

const ACCENT = 'var(--accent)';
const DANGER = 'var(--danger)';

/* ------------------------------------------------------------------ */
/* Primitivas de gráfico (SVG/CSS, reutilizables)                      */
/* ------------------------------------------------------------------ */

type Segment = { label: string; value: number; color: string; opacity?: number };

/** Tarjeta de métrica destacada. */
function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${
          accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

/** Panel con título para agrupar un gráfico. */
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

/** Dona con total en el centro + leyenda al lado. */
function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Segment[];
  centerValue: string | number;
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 54;
  const c = 70;
  const stroke = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          {total > 0 &&
            segments.map((s, i) => {
              const len = (s.value / total) * circ;
              const el = (
                <circle
                  key={i}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeOpacity={s.opacity ?? 1}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${circ - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold tabular-nums text-[var(--text)]">
            {centerValue}
          </div>
          <div className="text-[11px] text-[var(--muted)]">{centerLabel}</div>
        </div>
      </div>
      <ul className="flex min-w-0 flex-col gap-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color, opacity: s.opacity ?? 1 }}
            />
            <span className="min-w-0 truncate text-[var(--text)]">{s.label}</span>
            <span className="ml-auto tabular-nums text-[var(--muted)]">
              {s.value}
              {total > 0 && (
                <span className="ml-1 text-[11px]">
                  ({Math.round((s.value / total) * 100)}%)
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra única apilada (p. ej. el embudo de gestión) + leyenda. */
function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        {total > 0 &&
          segments.map(
            (s, i) =>
              s.value > 0 && (
                <div
                  key={i}
                  style={{
                    width: `${(s.value / total) * 100}%`,
                    background: s.color,
                    opacity: s.opacity ?? 1,
                  }}
                  title={`${s.label}: ${s.value}`}
                />
              ),
          )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color, opacity: s.opacity ?? 1 }}
            />
            <span className="text-[var(--text)]">{s.label}</span>
            <span className="tabular-nums text-[var(--muted)]">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type BarItem = { label: string; value: number; hint?: string };

/** Lista de barras horizontales etiquetadas (rankings). */
function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Sin datos.</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="min-w-0 truncate text-sm text-[var(--text)]"
              title={it.label}
            >
              {it.label}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-[var(--muted)]">
              {it.value}
              {it.hint && <span className="ml-1 text-[11px]">{it.hint}</span>}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(it.value / max) * 100}%`,
                background: ACCENT,
                opacity: 0.45 + 0.55 * (it.value / max),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Agregaciones                                                        */
/* ------------------------------------------------------------------ */

function countBy<T>(rows: T[], key: (r: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (key(r) ?? '').trim() || '—';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function topBars(m: Map<string, number>, limit = 8): BarItem[] {
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/* ================================================================== */
/* Tab — Resumen (estado actual en gráficos)                          */
/* ================================================================== */

export default function KoResumen({
  entries,
  subprocesos,
  casos,
}: {
  entries: KoEntry[];
  subprocesos: KoSubproceso[];
  casos: KoImportCaso[];
}) {
  const stats = useMemo(() => {
    const conocidas = casos.filter((c) => c.tipo === 'conocida');
    const pendientes = casos.filter((c) => c.tipo === 'desconocida');
    const porGestionar = conocidas.filter((c) => c.estado === 'pendiente').length;
    const enRevision = conocidas.filter((c) => c.estado === 'en_revision').length;
    const resueltas = conocidas.filter((c) => c.estado === 'resuelto').length;

    // Incidencias abiertas/cerradas entre todos los casos.
    const conIncidencia = casos.filter(
      (c) => c.incidencia_numero || c.incidencia_estado,
    );
    const incPend = conIncidencia.filter((c) => c.incidencia_estado === 'pendiente').length;
    const incEnv = conIncidencia.filter((c) => c.incidencia_estado === 'enviado').length;
    const incOk = conIncidencia.filter((c) => c.incidencia_estado === 'ok').length;

    // Cuentas atascadas por KO (solo conocidas sin resolver = la cola real).
    const entryById = new Map(entries.map((e) => [e.id, e]));
    const sinResolver = conocidas.filter((c) => c.estado !== 'resuelto');
    const porKo = new Map<string, number>();
    for (const c of sinResolver) {
      const ko = c.ko_entry_id ? entryById.get(c.ko_entry_id) : null;
      const label = ko
        ? `${ko.codigo ? `${ko.codigo} · ` : ''}${ko.error}`
        : c.codigo ?? c.error_texto ?? '—';
      porKo.set(label, (porKo.get(label) ?? 0) + 1);
    }

    // Grupos pendientes por «Error normalizado» (lo que falta documentar).
    const porError = countBy(pendientes, (c) => c.error_texto);

    return {
      total: casos.length,
      conocidas: conocidas.length,
      pendientes: pendientes.length,
      porGestionar,
      enRevision,
      resueltas,
      pctResueltas: conocidas.length
        ? Math.round((resueltas / conocidas.length) * 100)
        : 0,
      conIncidencia: conIncidencia.length,
      incPend,
      incEnv,
      incOk,
      topKo: topBars(porKo),
      topError: topBars(porError),
      porSistema: topBars(countBy(entries, (e) => e.sistema)),
      porClasificacion: topBars(countBy(entries, (e) => e.clasificacion)),
    };
  }, [casos, entries]);

  const hayCatalogo = entries.length > 0;

  if (stats.total === 0 && !hayCatalogo) {
    return (
      <p className="py-12 text-center text-sm text-[var(--muted)]">
        Aún no hay datos. Crea KOs en el catálogo o importa un Excel de KO altas
        para ver el estado aquí.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ---------- Cuentas importadas ---------- */}
      {stats.total > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Cuentas importadas
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total cuentas" value={stats.total} />
            <StatCard label="Conocidas" value={stats.conocidas} accent />
            <StatCard label="Pendientes" value={stats.pendientes} />
            <StatCard
              label="Resueltas"
              value={`${stats.pctResueltas}%`}
              sub={`${stats.resueltas} de ${stats.conocidas} conocidas`}
              accent
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Conocidas vs. pendientes">
              <Donut
                centerValue={stats.total}
                centerLabel="cuentas"
                segments={[
                  { label: 'Conocidas', value: stats.conocidas, color: ACCENT },
                  {
                    label: 'Pendientes (sin documentar)',
                    value: stats.pendientes,
                    color: DANGER,
                  },
                ]}
              />
            </Panel>

            <Panel title="Gestión de las conocidas">
              {stats.conocidas > 0 ? (
                <StackedBar
                  segments={[
                    {
                      label: 'Por gestionar',
                      value: stats.porGestionar,
                      color: DANGER,
                      opacity: 0.85,
                    },
                    {
                      label: 'En revisión',
                      value: stats.enRevision,
                      color: ACCENT,
                      opacity: 0.55,
                    },
                    {
                      label: 'Resueltas',
                      value: stats.resueltas,
                      color: ACCENT,
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  No hay cuentas conocidas todavía.
                </p>
              )}
            </Panel>
          </div>

          {stats.conIncidencia > 0 && (
            <Panel title="Incidencias">
              <Donut
                centerValue={stats.conIncidencia}
                centerLabel="incidencias"
                segments={[
                  { label: 'Pendiente', value: stats.incPend, color: DANGER, opacity: 0.85 },
                  { label: 'Enviado', value: stats.incEnv, color: ACCENT, opacity: 0.55 },
                  { label: 'OK', value: stats.incOk, color: ACCENT },
                ]}
              />
            </Panel>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Top KO por cuentas sin resolver">
              <BarList items={stats.topKo} />
            </Panel>
            <Panel title="Pendientes por error (sin documentar)">
              <BarList items={stats.topError} />
            </Panel>
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Aún no has importado cuentas. Sube un Excel de KO altas en la pestaña
          Pendientes para ver el estado de gestión aquí.
        </p>
      )}

      {/* ---------- Catálogo ---------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">Catálogo</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="KOs en catálogo" value={entries.length} accent />
          <StatCard label="Subprocesos" value={subprocesos.length} />
          <StatCard
            label="Con resolución"
            value={entries.filter((e) => (e.resolucion ?? '').trim()).length}
            sub="documentados"
          />
          <StatCard
            label="Con flujograma"
            value={entries.filter((e) => (e.flujograma_url ?? '').trim()).length}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="KOs por sistema">
            <BarList items={stats.porSistema} />
          </Panel>
          <Panel title="KOs por clasificación">
            <BarList items={stats.porClasificacion} />
          </Panel>
        </div>
      </section>
    </div>
  );
}
