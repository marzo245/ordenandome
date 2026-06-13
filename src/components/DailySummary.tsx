'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { DailySummary as Summary } from '@/lib/types';

export default function DailySummary({ initial }: { initial: Summary | null }) {
  const [summary, setSummary] = useState<Summary | null>(initial);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/summary', { method: 'POST' });
      setSummary(await res.json());
    } finally {
      setLoading(false);
    }
  }

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-6 right-6 z-40">
      {/* Panel */}
      {open && (
        <div className="absolute bottom-16 right-0 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white border border-[var(--border)] rounded-xl shadow-2xl p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
              Resumen del día
            </h2>
            <button
              onClick={regenerate}
              disabled={loading}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
            >
              {loading ? 'generando…' : 'regenerar'}
            </button>
          </div>
          <div className="text-sm leading-relaxed">
            {summary?.content ? (
              <ReactMarkdown
                components={{
                  h1: (p) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
                  h2: (p) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
                  h3: (p) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
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
      )}

      {/* Botón flotante que levita */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Resumen del día"
        aria-label="Resumen del día"
        className={`w-14 h-14 rounded-full bg-white border border-[var(--border)] shadow-lg flex items-center justify-center text-2xl hover:shadow-xl transition-shadow ${
          open ? '' : 'animate-[levitate_3s_ease-in-out_infinite]'
        }`}
      >
        ☀️
      </button>
    </div>
  );
}
