import type { GitHubActivity as Activity } from '@/lib/types';

export default function GitHubActivity({ items }: { items: Activity[] }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      <h2 className="text-sm font-semibold px-4 py-2 border-b border-[var(--border)]">
        Actividad GitHub · hoy
      </h2>
      <div className="p-2 space-y-1 max-h-[260px] overflow-auto">
        {items.length === 0 && (
          <p className="text-[var(--muted)] text-sm p-2">Sin actividad registrada hoy.</p>
        )}
        {items.map((a) => (
          <a
            key={a.id}
            href={a.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="block px-2 py-1 hover:bg-[var(--bg)] text-sm"
          >
            <span className="mono text-xs text-[var(--accent)]">[{a.kind}]</span>{' '}
            <span className="mono text-xs text-[var(--muted)]">{a.repo}</span>
            <div className="text-[var(--text)] truncate">{a.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
