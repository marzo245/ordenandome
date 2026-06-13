import { db, tasks, github_activity, daily_summaries } from '@/db';
import { eq, sql } from 'drizzle-orm';
import TaskBoard from '@/components/TaskBoard';
import DailySummary from '@/components/DailySummary';
import NotificationsButton from '@/components/NotificationsButton';
import GitHubActivity from '@/components/GitHubActivity';
import NewsFeed from '@/components/NewsFeed';
import NotesPreview from '@/components/NotesPreview';
import LogoutButton from '@/components/LogoutButton';
import DashboardShell from '@/components/DashboardShell';
import CollapsibleSection from '@/components/CollapsibleSection';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const day = new Date().toISOString().slice(0, 10);

  const [session, tasksRows, activity, summaryRows] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
    db.select().from(github_activity).where(eq(github_activity.day, day)),
    db.select().from(daily_summaries).where(eq(daily_summaries.day, day)).limit(1),
  ]);

  const summary = summaryRows[0] ?? null;

  const doingCount = tasksRows.filter((t) => t.status === 'doing').length;
  const dueTodayCount = tasksRows.filter(
    (t) => t.due_date === day && t.status !== 'done',
  ).length;

  const dateStr = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const capitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return (
    <DashboardShell
      session={session}
      logoutSlot={<LogoutButton />}
      tasks={tasksRows}
    >
      {/* Notion-style page header (flat, no cover) */}
      <div className="pt-8 pb-6">
        <div className="text-5xl mb-3 select-none leading-none">📅</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Hoy</h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          {dueTodayCount} vencen hoy · {doingCount} en curso · {capitalized}
        </p>
      </div>

      <section id="hoy" className="scroll-mt-16">
        <TaskBoard initial={tasksRows} />
      </section>

      {/* Botones flotantes que levitan (fixed): resumen + notificaciones */}
      <DailySummary initial={summary} />
      <NotificationsButton tasks={tasksRows} />

      <section
        id="notas"
        className="mt-12 border-t border-[var(--border-soft)] pt-10 scroll-mt-16"
      >
        <CollapsibleSection title="Notas recientes" defaultOpen>
          <NotesPreview />
        </CollapsibleSection>
      </section>

      <section
        id="noticias"
        className="mt-12 border-t border-[var(--border-soft)] pt-10 scroll-mt-16"
      >
        <CollapsibleSection title="Noticias" defaultOpen={false}>
          <NewsFeed />
        </CollapsibleSection>
      </section>

      <section
        id="github"
        className="mt-12 border-t border-[var(--border-soft)] pt-10 scroll-mt-16"
      >
        <CollapsibleSection title="GitHub hoy" defaultOpen={false}>
          <GitHubActivity items={activity} />
        </CollapsibleSection>
      </section>
    </DashboardShell>
  );
}
