'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskStatus } from '@/lib/types';

interface Props {
  value: TaskStatus;
  onChange: (v: TaskStatus) => void;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: 'Por hacer', className: 'bg-[#e9e9e7] text-[#37352f]' },
  doing: { label: 'En curso', className: 'bg-[#d3e5ef] text-[#183347]' },
  done: { label: 'Hecho', className: 'bg-[#dbeddb] text-[#1c3829]' },
};

const OPTIONS: TaskStatus[] = ['todo', 'doing', 'done'];

function Pill({ status }: { status: TaskStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

/** Selector tipo "pill" del estado de una tarea (todo/doing/done). */
export default function StatusPill({ value, onChange }: Props) {
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

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} className="cursor-pointer">
        <Pill status={value} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-[var(--border)] rounded shadow-lg py-1 min-w-[160px]">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="flex items-center w-full px-2 py-1 hover:bg-[#efefef] text-left"
            >
              <Pill status={opt} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
