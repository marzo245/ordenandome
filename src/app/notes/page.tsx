import { db, tasks, notes_cache } from '@/db';
import { desc, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import DashboardShell from '@/components/DashboardShell';
import LogoutButton from '@/components/LogoutButton';
import NotesBrowser from '@/components/NotesBrowser';

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const [session, tasksRows, rows] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
    db
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
      .limit(500),
  ]);

  return (
    <DashboardShell
      session={session}
      logoutSlot={<LogoutButton />}
      tasks={tasksRows}
    >
      {/* Notion-style page header */}
      <div className="pt-8 pb-6">
        <div className="text-5xl mb-3 select-none leading-none">📝</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Notas</h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          Tu vault de Obsidian
        </p>
      </div>

      <NotesBrowser initial={rows} />
    </DashboardShell>
  );
}
