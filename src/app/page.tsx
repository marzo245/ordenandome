import { db, tasks, github_activity, daily_summaries } from '@/db';
import { eq, sql } from 'drizzle-orm';
import TaskBoard from '@/components/TaskBoard';
import DailySummary from '@/components/DailySummary';
import GitHubActivity from '@/components/GitHubActivity';
import NewsFeed from '@/components/NewsFeed';
import NotesPreview from '@/components/NotesPreview';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const day = new Date().toISOString().slice(0, 10);

  const [tasksRows, activity, summaryRows] = await Promise.all([
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
    db.select().from(github_activity).where(eq(github_activity.day, day)),
    db.select().from(daily_summaries).where(eq(daily_summaries.day, day)).limit(1),
  ]);

  const summary = summaryRows[0] ?? null;

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
      <header className="mb-6 sm:mb-8 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-semibold">
          Calendario <span className="text-[var(--accent)]">Inteligente</span>
        </h1>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a
            href="/notes"
            className="px-3 py-1.5 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white text-sm font-medium transition-colors"
          >
            📝 Notas
          </a>
          <span className="mono text-xs sm:text-sm text-[var(--muted)]">{day}</span>
        </nav>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2">
          <TaskBoard initial={tasksRows} />
        </div>
        <div className="space-y-4 sm:space-y-6">
          <DailySummary initial={summary} />
          <NotesPreview />
          <NewsFeed />
          <GitHubActivity items={activity} />
        </div>
      </div>
    </main>
  );
}
