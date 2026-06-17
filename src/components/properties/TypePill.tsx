'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskType } from '@/lib/types';

interface Props {
  value: TaskType;
  onChange: (v: TaskType) => void;
}

const TYPE_CONFIG: Record<TaskType, { label: string; className: string }> = {
  trabajo: { label: 'Trabajo', className: 'bg-[#d3e5ef] text-[#183347]' },
  personal: { label: 'Personal', className: 'bg-[#e8deee] text-[#412454]' },
  estudio: { label: 'Estudio', className: 'bg-[#fadec9] text-[#49290e]' },
  otro: { label: 'Otro', className: 'bg-[#e9e9e7] text-[#37352f]' },
};

const OPTIONS: TaskType[] = ['trabajo', 'personal', 'estudio', 'otro'];

function Pill({ type }: { type: TaskType }) {
  const { label, className } = TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

/** Selector tipo "pill" del tipo de una tarea (trabajo/personal/estudio/otro). */
export default function TypePill({ value, onChange }: Props) {
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
        <Pill type={value} />
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
              <Pill type={opt} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
