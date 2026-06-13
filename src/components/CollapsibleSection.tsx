'use client';
import { useState } from 'react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-2 mb-3 text-left w-full"
      >
        <span
          className={`text-[var(--muted)] text-xs transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          ▸
        </span>
        <h2 className="text-base font-semibold tracking-tight group-hover:text-[var(--muted)]">
          {title}
        </h2>
      </button>
      {open && <div className="pl-5">{children}</div>}
    </div>
  );
}
