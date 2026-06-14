import { db, tasks } from '@/db';
import { sql } from 'drizzle-orm';
import TaskBoard from '@/components/TaskBoard';
import LogoutButton from '@/components/LogoutButton';
import DashboardShell from '@/components/DashboardShell';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const day = new Date().toISOString().slice(0, 10);

  const [session, tasksRows] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
  ]);

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
    </DashboardShell>
  );
}
