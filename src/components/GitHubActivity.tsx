import type { GitHubActivity as Activity } from '@/lib/types';

/** Lista compacta de la actividad reciente de GitHub (commits y PRs). */
export default function GitHubActivity({ items }: { items: Activity[] }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
          GitHub hoy
        </h2>
      </div>
      <div className="space-y-2 max-h-[260px] overflow-auto">
        {items.length === 0 && (
          <p className="text-[var(--muted)] text-sm">Sin actividad registrada hoy.</p>
        )}
        {items.map((a) => (
          <a
            key={a.id}
            href={a.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="block py-1 text-sm group"
          >
            <div className="flex items-center gap-2">
              <span className="mono text-[10px] text-[var(--muted)] uppercase">
                {a.kind}
              </span>
              <span className="mono text-xs text-[var(--muted)] truncate">
                {a.repo}
              </span>
            </div>
            <div className="text-[var(--text)] truncate group-hover:underline">
              {a.title}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
