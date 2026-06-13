import { db, tasks, sistemas } from '@/db';
import { asc, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import DashboardShell from '@/components/DashboardShell';
import LogoutButton from '@/components/LogoutButton';
import SistemasManager from '@/components/SistemasManager';

export const dynamic = 'force-dynamic';

export default async function SistemasPage() {
  const [session, tasksRows, rows] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
    db
      .select()
      .from(sistemas)
      .orderBy(asc(sistemas.orden), asc(sistemas.nombre)),
  ]);

  return (
    <DashboardShell
      session={session}
      logoutSlot={<LogoutButton />}
      tasks={tasksRows}
    >
      {/* Notion-style page header */}
      <div className="pt-8 pb-6">
        <div className="text-5xl mb-3 select-none leading-none">🖥️</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Sistemas
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          Cada sistema del flujo de creación: rol, accesos y documentación.
        </p>
      </div>

      <SistemasManager initial={rows} />
    </DashboardShell>
  );
}
