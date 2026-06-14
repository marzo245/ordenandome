import { db, tasks, github_activity } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import DashboardShell from '@/components/DashboardShell';
import LogoutButton from '@/components/LogoutButton';
import GitHubActivity from '@/components/GitHubActivity';

export const dynamic = 'force-dynamic';

export default async function GitHubPage() {
  const day = new Date().toISOString().slice(0, 10);

  const [session, tasksRows, activity] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
    db.select().from(github_activity).where(eq(github_activity.day, day)),
  ]);

  return (
    <DashboardShell
      session={session}
      logoutSlot={<LogoutButton />}
      tasks={tasksRows}
    >
      {/* Notion-style page header */}
      <div className="pt-8 pb-6">
        <div className="text-5xl mb-3 select-none leading-none">🐙</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">GitHub</h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          Tu actividad de hoy
        </p>
      </div>

      <GitHubActivity items={activity} />
    </DashboardShell>
  );
}
