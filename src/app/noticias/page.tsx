import { db, tasks } from '@/db';
import { sql } from 'drizzle-orm';
import { auth } from '@/auth';
import DashboardShell from '@/components/DashboardShell';
import LogoutButton from '@/components/LogoutButton';
import NewsFeed from '@/components/NewsFeed';

export const dynamic = 'force-dynamic';

export default async function NoticiasPage() {
  const [session, tasksRows] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
  ]);

  return (
    <DashboardShell
      session={session}
      logoutSlot={<LogoutButton />}
      tasks={tasksRows}
    >
      {/* Notion-style page header */}
      <div className="pt-8 pb-6">
        <div className="text-5xl mb-3 select-none leading-none">📰</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Noticias
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          Novedades de tus nichos
        </p>
      </div>

      <NewsFeed />
    </DashboardShell>
  );
}
