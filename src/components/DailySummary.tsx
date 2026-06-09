'use client';

import { useState } from 'react';
import type { DailySummary as Summary } from '@/lib/types';

export default function DailySummary({ initial }: { initial: Summary | null }) {
  const [summary, setSummary] = useState<Summary | null>(initial);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/summary', { method: 'POST' });
      setSummary(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex justify-between items-center px-4 py-2 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold">Resumen del día</h2>
        <button
          onClick={regenerate}
          disabled={loading}
          className="mono text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
        >
          {loading ? 'generando…' : '↻ regenerar'}
        </button>
      </div>
      <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
        {summary?.content ?? (
          <span className="text-[var(--muted)]">
            Sin resumen aún. Pulsa «regenerar» para crear uno con tus tareas y tu actividad de GitHub.
          </span>
        )}
      </div>
    </div>
  );
}
