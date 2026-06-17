'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  start: string | null; // due_date (programada), formato 'YYYY-MM-DD' o null
  end: string | null; // deadline (límite), 'YYYY-MM-DD' o null
  onChange: (start: string | null, end: string | null) => void;
}

const formatter = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return formatter.format(new Date(value + 'T00:00:00'));
}

/** Campo de propiedad para un rango de fechas (due_date / deadline) de una tarea. */
export default function DateRangeField({ start, end, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const startLabel = formatDate(start);
  const endLabel = formatDate(end);

  let display: React.ReactNode;
  if (startLabel && endLabel) {
    display = (
      <span className="text-[var(--text)]">
        {startLabel} → {endLabel}
      </span>
    );
  } else if (startLabel) {
    display = <span className="text-[var(--text)]">{startLabel}</span>;
  } else {
    display = <span className="text-[var(--muted)]">Vacío</span>;
  }

  const invalidRange = !!start && !!end && end < start;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer text-xs"
      >
        {display}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-[var(--border)] rounded shadow-lg p-3 min-w-[220px] space-y-2">
          <label className="block text-xs text-[var(--muted)]">
            Inicio (programada)
            <input
              type="date"
              value={start ?? ''}
              onChange={(e) => onChange(e.target.value || null, end)}
              className="mt-1 block w-full border border-[var(--border)] rounded px-2 py-1 text-xs bg-white text-[var(--text)]"
            />
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Límite (deadline)
            <input
              type="date"
              value={end ?? ''}
              onChange={(e) => onChange(start, e.target.value || null)}
              className="mt-1 block w-full border border-[var(--border)] rounded px-2 py-1 text-xs bg-white text-[var(--text)]"
            />
          </label>
          {invalidRange && (
            <p className="text-xs text-red-600">El límite es anterior al inicio</p>
          )}
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="text-xs text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}
