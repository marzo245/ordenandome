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
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex justify-between items-center px-4 py-2 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold">Notas</h2>
        <a href="/notes" className="mono text-xs text-[var(--accent)] hover:underline">
          abrir todas →
        </a>
      </div>
      {recent.length === 0 ? (
        <div className="p-4 text-xs text-[var(--muted)]">
          Sin notas aún.{' '}
          <a href="/notes" className="text-[var(--accent)] hover:underline">
            Sincroniza tu vault
          </a>
          .
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {recent.map((n) => {
            const enc = n.path.split('/').map(encodeURIComponent).join('/');
            return (
              <li key={n.path}>
                <a
                  href={`/notes?open=${enc}`}
                  className="block px-4 py-2 hover:bg-[var(--bg)]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm truncate">{n.title}</span>
                    <span className="mono text-[10px] text-[var(--muted)] shrink-0">
                      {n.scope}
                    </span>
                  </div>
                  <div className="mono text-[10px] text-[var(--muted)] truncate">
                    {n.folder || '/'}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
