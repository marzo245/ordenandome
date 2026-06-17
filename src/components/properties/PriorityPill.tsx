'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskPriority } from '@/lib/types';

interface Props {
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  baja: { label: 'Baja', className: 'bg-[#e9e9e7] text-[#37352f]' },
  media: { label: 'Media', className: 'bg-[#fdecc8] text-[#402c1b]' },
  alta: { label: 'Alta', className: 'bg-[#ffe2dd] text-[#5d1715]' },
};

const OPTIONS: TaskPriority[] = ['baja', 'media', 'alta'];

function Pill({ priority }: { priority: TaskPriority }) {
  const { label, className } = PRIORITY_CONFIG[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

/** Selector tipo "pill" de la prioridad de una tarea (baja/media/alta). */
export default function PriorityPill({ value, onChange }: Props) {
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
        <Pill priority={value} />
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
              <Pill priority={opt} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
