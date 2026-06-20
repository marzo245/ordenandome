import { db, tasks, ko_entries, ko_subprocesos, ko_import_casos } from '@/db';
import { asc, desc, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import DashboardShell from '@/components/DashboardShell';
import LogoutButton from '@/components/LogoutButton';
import KoManager from '@/components/KoManager';

export const dynamic = 'force-dynamic';

export default async function KoPage() {
  const [session, tasksRows, koRows, spRows, casosRows] = await Promise.all([
    auth(),
    db.select().from(tasks).orderBy(sql`${tasks.due_date} ASC NULLS LAST`),
    db.select().from(ko_entries).orderBy(asc(ko_entries.codigo)),
    db.select().from(ko_subprocesos).orderBy(asc(ko_subprocesos.codigo)),
    db.select().from(ko_import_casos).orderBy(desc(ko_import_casos.created_at)),
  ]);

  return (
    <DashboardShell
      session={session}
      logoutSlot={<LogoutButton />}
      tasks={tasksRows}
    >
      {/* Notion-style page header */}
      <div className="pt-8 pb-6">
        <div className="text-5xl mb-3 select-none leading-none">🧠</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Gestión de KO
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          Catálogo de errores, subprocesos de resolución, flujos y guías.
        </p>
      </div>

      <KoManager
        initialEntries={koRows}
        initialSubprocesos={spRows}
        initialCasos={casosRows}
      />
    </DashboardShell>
  );
}
