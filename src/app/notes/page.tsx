import { db, notes_cache } from '@/db';
import { desc } from 'drizzle-orm';
import Link from 'next/link';
import NotesBrowser from '@/components/NotesBrowser';

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const rows = await db
    .select({
      path: notes_cache.path,
      title: notes_cache.title,
      scope: notes_cache.scope,
      folder: notes_cache.folder,
      tags: notes_cache.tags,
      body_excerpt: notes_cache.body_excerpt,
      updated_at: notes_cache.updated_at,
    })
    .from(notes_cache)
    .orderBy(desc(notes_cache.updated_at))
    .limit(500);

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
      <header className="mb-6 sm:mb-8 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-semibold">
          Notas <span className="text-[var(--muted)]">Obsidian</span>
        </h1>
        <Link href="/" className="mono text-xs sm:text-sm text-[var(--muted)] hover:underline">
          ← inicio
        </Link>
      </header>
      <NotesBrowser initial={rows} />
    </main>
  );
}
