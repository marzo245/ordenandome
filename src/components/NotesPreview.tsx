import { db, notes_cache } from '@/db';
import { desc } from 'drizzle-orm';

export default async function NotesPreview() {
  const recent = await db
    .select({
      path: notes_cache.path,
      title: notes_cache.title,
      scope: notes_cache.scope,
      folder: notes_cache.folder,
      updated_at: notes_cache.updated_at,
    })
    .from(notes_cache)
    .orderBy(desc(notes_cache.updated_at))
    .limit(6);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Notas recientes
        </h2>
        <a href="/notes" className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
          abrir todas
        </a>
      </div>
      {recent.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">
          Sin notas aún.{' '}
          <a href="/notes" className="text-[var(--accent)] hover:underline">
            Sincroniza tu vault
          </a>
          .
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]/40">
          {recent.map((n) => {
            const enc = n.path.split('/').map(encodeURIComponent).join('/');
            return (
              <li key={n.path}>
                <a
                  href={`/notes?open=${enc}`}
                  className="block py-2.5 group"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm truncate group-hover:underline">
                      {n.title}
                    </span>
                    <span className="text-xs text-[var(--muted)] shrink-0">
                      {n.scope}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {n.folder || '/'}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
