'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Renderiza un diagrama Mermaid a partir de su código fuente (usado dentro del Markdown). */
export default function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const id = `m-${baseId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (err) {
    return (
      <div className="my-3 border border-[var(--danger)] bg-[var(--surface)] p-3">
        <div className="mono text-xs text-[var(--danger)] mb-2">mermaid error: {err}</div>
        <pre className="mono text-xs text-[var(--muted)] whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }
  return <div ref={ref} className="my-3 overflow-x-auto" />;
}
