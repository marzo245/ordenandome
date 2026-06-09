'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
      <div className="p-4 text-sm leading-relaxed">
        {summary?.content ? (
          <ReactMarkdown
            components={{
              h1: (p) => <h3 className="font-semibold text-[var(--accent)] mt-3 mb-1" {...p} />,
              h2: (p) => <h3 className="font-semibold text-[var(--accent)] mt-3 mb-1" {...p} />,
              h3: (p) => <h3 className="font-semibold text-[var(--accent)] mt-3 mb-1" {...p} />,
              p: (p) => <p className="mb-2" {...p} />,
              strong: (p) => <strong className="font-semibold text-[var(--text)]" {...p} />,
              em: (p) => <em className="italic text-[var(--muted)]" {...p} />,
              ul: (p) => <ul className="list-disc list-outside ml-5 space-y-0.5 mb-2" {...p} />,
              ol: (p) => <ol className="list-decimal list-outside ml-5 space-y-1 mb-2" {...p} />,
              li: (p) => <li className="text-[var(--text)]" {...p} />,
              a: (p) => (
                <a
                  className="text-[var(--accent)] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                  {...p}
                />
              ),
              code: (p) => (
                <code
                  className="mono text-xs bg-[var(--bg)] px-1 py-0.5 border border-[var(--border)]"
                  {...p}
                />
              ),
              hr: () => <hr className="border-[var(--border)] my-3" />,
            }}
          >
            {summary.content}
          </ReactMarkdown>
        ) : (
          <span className="text-[var(--muted)]">
            Sin resumen aún. Pulsa «regenerar» para crear uno con tus tareas y tu actividad de GitHub.
          </span>
        )}
      </div>
    </div>
  );
}
